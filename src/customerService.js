const supabase = require('./supabaseClient');

/**
 * Customer Service Module
 * Handles customer profiles, VIP tagging, and payment dues via Supabase.
 */
class CustomerService {
    // Normalize phone to format '+91-XXXXX' to match database format
    static normalizePhone(phone) {
        if (!phone.includes('+')) {
            if (phone.length === 12 && phone.startsWith('91')) {
                return `+91-${phone.substring(2)}`;
            }
            return `+${phone}`;
        }
        return phone;
    }

    static async getOrCreateCustomer(tenantId, phone) {
        const normalizedPhone = this.normalizePhone(phone);

        // 1. Try to fetch customer
        const { data, error } = await supabase
            .from('app_customers')
            .select('*')
            .eq('phone', normalizedPhone)
            .single();

        if (data && !error) {
            return data;
        }

        // 2. Create customer if not found
        // Use a simple ID generation for cust_...
        const newCustomerId = `cust_${Math.random().toString(16).slice(2, 10)}`;
        const newCustomer = {
            customer_id: newCustomerId,
            tenant_id: tenantId,
            name: 'New Customer',
            phone: normalizedPhone,
            tag: 'new'
        };

        const { data: inserted, error: insertError } = await supabase
            .from('app_customers')
            .insert([newCustomer])
            .select()
            .single();

        if (insertError) {
            console.error('Error creating customer in Supabase:', insertError);
            return newCustomer; // Fallback to memory object
        }

        console.log(`🆕 NEW CUSTOMER ADDED TO SUPABASE: ${normalizedPhone}`);
        return inserted;
    }

    static async updateOrderStats(tenantId, phone) {
        const customer = await this.getOrCreateCustomer(tenantId, phone);
        if (!customer.customer_id) return null;

        // Promote "new" customers to "frequent"
        if (customer.tag === 'new') {
            const { error } = await supabase
                .from('app_customers')
                .update({ tag: 'frequent' })
                .eq('customer_id', customer.customer_id);

            if (!error) {
                console.log(`⭐ CUSTOMER ${phone} PROMOTED TO FREQUENT`);
            }
        }
        return customer;
    }

    static async checkPaymentStatus(tenantId, phone) {
        const customer = await this.getOrCreateCustomer(tenantId, phone);
        const name = customer.name || "Customer";

        // Query pending payments for this customer
        const { data: payments, error } = await supabase
            .from('app_payments')
            .select('amount_cents, status')
            .eq('customer_id', customer.customer_id)
            .eq('status', 'pending');

        if (error) {
            console.error('Error fetching payments:', error);
            return { has_due: false, due_amount: 0, message: '' };
        }

        let totalDueCents = 0;
        if (payments && payments.length > 0) {
            totalDueCents = payments.reduce((sum, p) => sum + p.amount_cents, 0);
        }

        const dueAmountRs = totalDueCents / 100;

        if (dueAmountRs > 0) {
            return {
                has_due: true,
                due_amount: dueAmountRs,
                message: `Hi ${name}, you have a pending payment of ₹${dueAmountRs}. Please pay via UPI.`
            };
        } else {
            return {
                has_due: false,
                due_amount: 0,
                message: `Hi ${name}, no pending dues! Thanks for being a loyal customer.`
            };
        }
    }

    static async getRecentOrders(customerId, limit = 3) {
        const { data, error } = await supabase
            .from('app_payments')
            .select('*')
            .eq('customer_id', customerId)
            .eq('status', 'paid')
            .order('paid_at', { ascending: false })
            .limit(limit);

        if (error || !data) return [];
        return data;
    }

    static async createPayment(tenantId, customerId, amountCents, productId = null, productName = null) {
        // Generate unique payment ID
        const paymentId = `pay_${Math.random().toString(16).slice(2, 10)}`;

        const newPayment = {
            payment_id: paymentId,
            tenant_id: tenantId,
            customer_id: customerId,
            amount_cents: amountCents,
            product_name: productName,
            status: 'pending'
        };

        const { data, error } = await supabase
            .from('app_payments')
            .insert([newPayment])
            .select()
            .single();

        if (error) {
            console.error('Error creating payment:', error);
            return null;
        }

        console.log(`💳 Created pending payment ${paymentId} for ${customerId}`);
        return data;
    }

    static async updatePaymentStatus(paymentId, status) {
        const { data, error } = await supabase
            .from('app_payments')
            .update({ status: status, paid_at: status === 'paid' ? new Date().toISOString() : null })
            .eq('payment_id', paymentId)
            .select()
            .single();

        if (error) {
            console.error(`Error updating payment ${paymentId}:`, error);
            return false;
        }

        console.log(`✅ Payment ${paymentId} marked as ${status}`);
        return true;
    }
}

module.exports = CustomerService;
