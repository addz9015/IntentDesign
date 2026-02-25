const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, '..', 'sessions');

/**
 * Handles conversational state and memory.
 * For prototype, uses local JSON files.
 */
class SessionManager {
    static getSession(userId, tenantId) {
        const sessionPath = path.join(SESSION_DIR, `${userId}.json`);

        if (fs.existsSync(sessionPath)) {
            return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
        }

        // Initialize new session
        return {
            session_id: userId,
            tenant_id: tenantId,
            last_product: null,
            pending_action: null,
            last_intent: null,
            history: []
        };
    }

    static saveSession(userId, sessionData) {
        const sessionPath = path.join(SESSION_DIR, `${userId}.json`);
        if (!fs.existsSync(SESSION_DIR)) {
            fs.mkdirSync(SESSION_DIR, { recursive: true });
        }
        fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
    }

    static clearPendingAction(userId) {
        const session = this.getSession(userId);
        session.pending_action = null;
        this.saveSession(userId, session);
    }
}

module.exports = SessionManager;
