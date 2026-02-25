/**
 * Transaction Engine (Rule-based with Guardrails)
 * Handles cancellation, refunds, etc.
 */
class TransactionEngine {
    static async handle(message, session, config) {
        const lower = message.toLowerCase();
        const pendingAction = session.pending_action;

        // 1. Check for confirmation if an action was pending
        if (pendingAction) {
            if (lower.includes('yes') || lower.includes('ha') || lower.includes('confirm')) {
                const action = pendingAction;
                session.pending_action = null; // Clear after execution
                return {
                    type: 'TRANSACTION_SUCCESS',
                    action: action,
                    message: `Successfully executed: ${action}`
                };
            } else if (lower.includes('no') || lower.includes('nahi')) {
                session.pending_action = null;
                return {
                    type: 'TRANSACTION_CANCELLED',
                    message: "Okay, I've cancelled that request."
                };
            }
        }

        // 2. Detect new transactional intent
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
            message: "I can help with cancellations and refunds. What would you like to do?"
        };
    }
}

module.exports = TransactionEngine;
