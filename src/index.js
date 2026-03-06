require('dotenv').config();
const { resolveTenant, getTenantConfig } = require('./tenantResolver');
const SessionManager = require('./sessionManager');
const routeRequest = require('./router');
const MemoryManager = require('./memoryManager');

/**
 * Main Webhook Handler
 */
async function handleWhatsAppMessage(fromNumber, messageText) {
  try {
    // 1. Resolve Tenant
    const tenantId = resolveTenant(fromNumber);
    const config = getTenantConfig(tenantId);

    // 2. Load/Initialize Session
    const session = SessionManager.getSession(fromNumber, tenantId);

    // 3. Route through AI Engines
    const result = await routeRequest(messageText, session, config);

    // 4. Update session with new state
    session.last_intent = result.intent;
    session.history.push({
      user: messageText,
      bot: result.response,
      timestamp: new Date().toISOString()
    });

    // 5. Update rolling summary asynchronously (fire-and-forget)
    //    We update AFTER saving so we don't delay the reply to the user.
    SessionManager.saveSession(fromNumber, session);

    MemoryManager.updateSummary(session.memory_summary, messageText, result.response)
      .then(newSummary => {
        session.memory_summary = newSummary;
        SessionManager.saveSession(fromNumber, session);
      })
      .catch(err => console.warn('Memory update failed silently:', err.message));

    return result.response;
  } catch (error) {
    console.error("Error handling message:", error);
    return "I'm having a bit of trouble connecting to my brain right now. Please try again in a moment.";
  }
}

// Demo interactive simulation if run directly
if (require.main === module) {
  const demoUser = "919876543210";
  const demoMessages = [
    "Hi!",
    "Do you have a Classic Hoodie?",
    "Is it cotton?",
    "I want to cancel my order",
    "Yes, confirm it",
    "What is your return policy?",
    "asdfghjkl"
  ];

  async function runDemo() {
    console.log("--- Antigravity AI Platform Demo ---");
    for (const msg of demoMessages) {
      console.log(`\nUser: ${msg}`);
      const response = await handleWhatsAppMessage(demoUser, msg);
      console.log(`Bot: ${response}`);
    }
  }

  runDemo();
}

module.exports = handleWhatsAppMessage;
