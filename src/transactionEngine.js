const CustomerService = require('./customerService');
const supabase = require('./supabaseClient');

/**
 * Transaction Engine (Rule-based with Guardrails)
 * Handles ordering, cancellation, refunds, etc.
 */
class TransactionEngine {
    static async handle(message, session, config) {
        const lower = message.toLowerCase();
        const pendingAction = session.pending_action;
        const tenantId = session.tenant_id;
        const customerId = session.customer_id;

        const isConfirmationMsg = /^(yes|ha|sure|confirm|ok|okay|pl|place|do it|go ahead|yep|yup|yeah)$/.test(lower.trim()) ||
            lower.includes('confirm') || lower.includes('place order') || lower.includes('go ahead');
        const isRejectionMsg = /^(no|nope|nahi|cancel|stop|dont|don't|na)$/.test(lower.trim()) ||
            lower.includes('cancel') || lower.includes('dont want');

        // 0. No pending action but user confirms with a product in context → they want to order
        if (!pendingAction && isConfirmationMsg && session.last_product) {
            session.pending_action = 'NEW_ORDER';
            return {
                type: 'CONFIRMATION_REQUIRED',
                action: 'NEW_ORDER',
                message: `Shall I go ahead and place the order for this item?`
            };
        }

        // 1. Check for confirmation if an action was pending
        if (pendingAction) {
            if (isConfirmationMsg) {
                const action = pendingAction;
                session.pending_action = null; // Clear after execution

                if (action === 'NEW_ORDER' && session.last_product) {
                    // Fetch product details to get amount
                    const { data: product } = await supabase
                        .from('app_products')
                        .select('price_cents')
                        .eq('product_id', session.last_product)
                        .single();

                    if (product) {
                        // Create pending payment in database
                        const paymentRecord = await CustomerService.createPayment(
                            tenantId, customerId, product.price_cents,
                            session.last_product, session.last_product_name
                        );
                        // Clear collected order details now that order is placed
                        session.order_size = null;
                        session.order_color = null;
                        // Promote customer to frequent (fire-and-forget)
                        CustomerService.updateOrderStats(tenantId, session.session_id).catch(() => {});

                        return {
                            type: 'INTERACTIVE_PAYMENT',
                            action: action,
                            payment_id: paymentRecord.payment_id,
                            amount_cents: product.price_cents,
                            message: `Great! Your order for ${session.last_product_name || 'the item'} is confirmed. A payment QR code will be sent to you now. You can pay via UPI or Credit/Debit card.`
                        };
                    }
                }

                return {
                    type: 'TRANSACTION_SUCCESS',
                    action: action,
                    message: `Successfully executed: ${action}`
                };
            } else if (isRejectionMsg) {
                session.pending_action = null;
                return {
                    type: 'TRANSACTION_CANCELLED',
                    message: "Okay, I've cancelled that request."
                };
            }
        }

        // 2. Detect Ordering Intent
        if (lower.includes('buy') || lower.includes('order') || lower.includes('purchase')) {
            if (!session.last_product) {
                return {
                    type: 'TRANSACTION_INFO',
                    message: "What product would you like to order?"
                };
            }

            session.pending_action = 'NEW_ORDER';
            return {
                type: 'CONFIRMATION_REQUIRED',
                action: 'NEW_ORDER',
                message: "Shall I go ahead and place the order for this item?"
            };
        }

        // 3. Detect Cancellation/Refunds
        if (lower.includes('cancel')) {
            if (config.confirmation_required_for.includes('CANCEL_ORDER')) {
                session.pending_action = 'CANCEL_ORDER';
                return {
                    type: 'CONFIRMATION_REQUIRED',
                    action: 'CANCEL_ORDER',
                    message: "Are you sure you want to cancel your order?"
                };
            }
        }

        if (lower.includes('refund')) {
            if (config.confirmation_required_for.includes('REFUND')) {
                session.pending_action = 'REFUND';
                return {
                    type: 'CONFIRMATION_REQUIRED',
                    action: 'REFUND',
                    message: "Are you sure you want to request a refund? This will take 5-7 days."
                };
            }
        }

        return {
            type: 'TRANSACTION_INFO',
            message: "I can help with orders, cancellations, and refunds. What would you like to do?"
        };
    }
}

module.exports = TransactionEngine;
