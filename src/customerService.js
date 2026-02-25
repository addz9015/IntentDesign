const fs = require('fs');
const path = require('path');

/**
 * Customer Service Module
 * Ported from teammate's Python implementation.
 * Handles customer profiles, VIP tagging, and payment dues.
 */
class CustomerService {
    static getDbPath(tenantId) {
        return path.join(__dirname, '..', 'tenants', tenantId, 'customers.json');
    }

    static loadDb(tenantId) {
        const filePath = this.getDbPath(tenantId);
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        } catch (e) {
            console.error(`Error loading customers for ${tenantId}:`, e);
        }
        return {};
    }

    static saveDb(tenantId, data) {
        const filePath = this.getDbPath(tenantId);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    static getOrCreateCustomer(tenantId, phone) {
        const db = this.loadDb(tenantId);

        if (!db[phone]) {
            db[phone] = {
                name: "New Customer",
                status: "active",
                amount_due: 0,
                orders_placed: 0,
                tags: ["new"],
                joined_at: new Date().toISOString()
            };
            this.saveDb(tenantId, db);
            console.log(`🆕 NEW CUSTOMER ADDED TO ${tenantId}: ${phone}`);
        }

        return db[phone];
    }

    static updateOrderStats(tenantId, phone) {
        const db = this.loadDb(tenantId);

        if (db[phone]) {
            db[phone].orders_placed += 1;
            db[phone].last_order_date = new Date().toISOString();

            // VIP Logic: Orders >= 3
            if (db[phone].orders_placed >= 3) {
                if (!db[phone].tags.includes("vip")) {
                    db[phone].tags.push("vip");
                    console.log(`⭐ CUSTOMER ${phone} PROMOTED TO VIP IN ${tenantId}`);
                }
            }

            this.saveDb(tenantId, db);
            return db[phone];
        }
        return null;
    }

    static checkPaymentStatus(tenantId, phone) {
        const customer = this.getOrCreateCustomer(tenantId, phone);
        const name = customer.name || "Customer";
        const due = customer.amount_due || 0;

        if (due > 0) {
            return {
                has_due: true,
                due_amount: due,
                message: `Hi ${name}, you have a pending payment of ₹${due}. Please pay via UPI.`
            };
        } else {
            return {
                has_due: false,
                due_amount: 0,
                message: `Hi ${name}, no pending dues! Thanks for being a loyal customer.`
            };
        }
    }
}

module.exports = CustomerService;
