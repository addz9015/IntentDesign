const fs = require('fs');
const path = require('path');

const UNKNOWN_LOG = path.join(__dirname, '..', 'logs', 'unknown.json');

/**
 * Fallback Engine
 * Handles unknown intents and logs them.
 */
class FallbackEngine {
    static async handle(message, session, config) {
        // Log the unknown message
        this.logUnknown(message, session.tenant_id);

        return {
            type: 'FALLBACK',
            message: `I'm sorry, I'm still learning. I can help you with:\n1️⃣ Product details\n2️⃣ Track order\n3️⃣ Cancel order\n4️⃣ Refund queries\nHow can I assist?`
        };
    }

    static logUnknown(message, tenantId) {
        let logs = [];
        if (fs.existsSync(UNKNOWN_LOG)) {
            logs = JSON.parse(fs.readFileSync(UNKNOWN_LOG, 'utf8'));
        }
        logs.push({
            timestamp: new Date().toISOString(),
            tenant_id: tenantId,
            message: message
        });

        const logDir = path.dirname(UNKNOWN_LOG);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        fs.writeFileSync(UNKNOWN_LOG, JSON.stringify(logs, null, 2));
    }
}

module.exports = FallbackEngine;
