const fs = require("fs");
const path = require("path");

const SESSION_DIR = path.join(__dirname, "..", "sessions");

/**
 * Handles conversational state and memory.
 * For prototype, uses local JSON files.
 */
class SessionManager {
  static getSession(userId, tenantId) {
    const sessionPath = path.join(SESSION_DIR, `${userId}.json`);

    if (fs.existsSync(sessionPath)) {
      return JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    }

    // Initialize new session
    return {
      session_id: userId,
      tenant_id: tenantId,
      last_product: null,
      rejected_products: [], // Product IDs the user has explicitly rejected
      rejected_product_names: [], // Corresponding names for the LLM prompt
      browsing_declined_count: 0, // How many times user said no to browsing suggestions
      pending_action: null,
      last_intent: null,
      memory_summary: "", // Rolling summary of the conversation (not raw history)
      history: [],
      order_size: null, // Size selected for current product (cleared on new product)
      order_color: null, // Color selected for current product (cleared on new product)
      is_returning_customer: false,
      previous_orders: [], // Recent paid orders from DB
      previous_orders_loaded: false,
      greeting_shown: false, // Track if initial greeting has been shown
      user_language: "en", // Last detected preferred language for reply continuity
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
