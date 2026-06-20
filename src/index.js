require("dotenv").config();
const {
  resolveTenant,
  resolveTenantKey,
  getTenantConfig,
} = require("./tenantResolver");
const SessionManager = require("./sessionManager");
const routeRequest = require("./core/agentRouter");
const MemoryManager = require("./memoryManager");
const CustomerService = require("./customerService");
const LanguageService = require("./languageService");

/**
 * Main Webhook Handler
 */
async function handleWhatsAppMessage(fromNumber, messageText) {
  try {
    // 1. Resolve Tenant
    //    tenantId is the INTEGER db id used for all Supabase queries.
    //    tenantKey is the STRING folder name used for file-based config.
    const tenantId = resolveTenant(fromNumber);
    const tenantKey = resolveTenantKey(fromNumber);
    const config = getTenantConfig(tenantId);

    // 2. Load/Initialize Session
    const session = SessionManager.getSession(fromNumber, tenantId);
    session.tenant_id = tenantId; // ensure stored sessions use the integer db id
    session.tenant_key = tenantKey;

    // 2x. Reset browsing state if this is a new conversation (inactive > 30 mins)
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
    const lastEntry = session.history[session.history.length - 1];
    const lastActivityMs = lastEntry
      ? Date.now() - new Date(lastEntry.timestamp).getTime()
      : SESSION_TIMEOUT_MS + 1;
    const isNewConversation = lastActivityMs > SESSION_TIMEOUT_MS;
    if (isNewConversation) {
      session.rejected_products = [];
      session.rejected_product_names = [];
      session.browsing_declined_count = 0;
      session.last_product = null;
      session.last_product_name = null;
      session.memory_summary = "";
      session.pending_action = null;
      session.order_size = null;
      session.order_color = null;
      session.negotiated_product_id = null;
      session.negotiated_price_cents = null;
      session.negotiation_attempts = 0;
      session.previous_orders_loaded = false;
      session.greeting_shown = false; // Reset greeting flag for new conversation
      session.user_language = "en";
      session.reply_language_preference = "en";
      console.log(
        `🔄 New conversation detected for ${fromNumber} — browsing state reset`,
      );
    }

    // 2a. Populate customer info if not already in session
    if (!session.customer_id) {
      try {
        const customer = await CustomerService.getOrCreateCustomer(
          tenantId,
          fromNumber,
        );
        session.customer_id = customer.customer_id;
        session.customer_name = customer.name;
        session.is_returning_customer = customer.tag === "frequent";
        SessionManager.saveSession(fromNumber, session);
      } catch (err) {
        console.warn("Could not load customer info:", err.message);
      }
    }

    // 2b. Load previous orders for returning customers (once per session)
    if (session.customer_id && !session.previous_orders_loaded) {
      try {
        const orders = await CustomerService.getRecentOrders(
          session.customer_id,
        );
        session.previous_orders = orders;
        session.previous_orders_loaded = true;
        SessionManager.saveSession(fromNumber, session);
      } catch (err) {
        console.warn("Could not load order history:", err.message);
        session.previous_orders_loaded = true;
      }
    }

    // 2c. Extract size/color from user message to avoid re-asking
    if (session.last_product) {
      const upper = messageText.toUpperCase().trim();
      if (["S", "M", "L", "XL", "XXL"].includes(upper)) {
        session.order_size = upper;
      }
      const colorKeywords = [
        "black",
        "grey",
        "gray",
        "blue",
        "white",
        "red",
        "green",
        "yellow",
        "pink",
        "navy",
        "maroon",
        "brown",
        "orange",
      ];
      const lowerMsg = messageText.toLowerCase().trim();
      if (colorKeywords.includes(lowerMsg)) {
        session.order_color =
          lowerMsg.charAt(0).toUpperCase() + lowerMsg.slice(1);
      }
    }

    // 3. Language adaptation with sticky reply language per session.
    //    Reply language changes only on explicit user request.
    const explicitLanguageSwitch = LanguageService.detectExplicitLanguageSwitch(
      messageText,
    );

    if (explicitLanguageSwitch) {
      session.reply_language_preference = explicitLanguageSwitch.code;
      session.user_language = explicitLanguageSwitch.code;
    }

    const detectedLanguage = LanguageService.detectUserLanguage(
      messageText,
      session,
    );

    const currentReplyLanguage =
      session.reply_language_preference || session.user_language || "en";

    let replyLanguage = currentReplyLanguage;

    if (
      !explicitLanguageSwitch &&
      LanguageService.shouldAutoSwitchReplyLanguage(
        messageText,
        detectedLanguage,
        currentReplyLanguage,
      )
    ) {
      replyLanguage = detectedLanguage.code;
    }

    session.user_language = replyLanguage;
    session.reply_language_preference = replyLanguage;

    let routingMessage = messageText;
    let llmReplyLanguage = replyLanguage;
    let translateReplyBack = false;

    if (LanguageService.shouldUseAI4Bharat(detectedLanguage.code)) {
      const translatedInput = await LanguageService.translateToEnglish(
        messageText,
        detectedLanguage.code,
      );

      if (translatedInput) {
        routingMessage = translatedInput;
        if (replyLanguage !== "en") {
          llmReplyLanguage = "en";
          translateReplyBack = true;
        }
      }
    }

    // 4. Route through AI Engines
    const result = await routeRequest(routingMessage, session, config, {
      replyLanguage: llmReplyLanguage,
    });

    // 5. Translate response back to the user's language when needed
    let finalResponseText = result.response;
    if (translateReplyBack) {
      const translatedReply = await LanguageService.translateFromEnglish(
        result.response,
        replyLanguage,
      );
      if (translatedReply) {
        finalResponseText = translatedReply;
      }
    }

    // 6. Update session with new state
    session.last_intent = result.intent;
    session.history.push({
      user: messageText,
      bot: finalResponseText,
      timestamp: new Date().toISOString(),
    });
    // Keep only last 10 turns to prevent unbounded disk growth
    if (session.history.length > 10) {
      session.history = session.history.slice(-10);
    }

    // 7. Update rolling summary asynchronously (fire-and-forget)
    //    We update AFTER saving so we don't delay the reply to the user.
    SessionManager.saveSession(fromNumber, session);

    MemoryManager.updateSummary(
      session.memory_summary,
      routingMessage,
      result.response,
    )
      .then((newSummary) => {
        session.memory_summary = newSummary;
        SessionManager.saveSession(fromNumber, session);
      })
      .catch((err) =>
        console.warn("Memory update failed silently:", err.message),
      );

    return {
      text: finalResponseText,
      interactive: result.interactive,
    };
  } catch (error) {
    console.error("Error handling message:", error);
    return {
      text: "I'm having a bit of trouble connecting to my brain right now. Please try again in a moment.",
      interactive: null,
    };
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
    "asdfghjkl",
  ];

  async function runDemo() {
    console.log("--- Antigravity AI Platform Demo ---");
    for (const msg of demoMessages) {
      console.log(`\nUser: ${msg}`);
      const response = await handleWhatsAppMessage(demoUser, msg);
      console.log(`Bot: ${response.text}`);
    }
  }

  runDemo();
}

module.exports = handleWhatsAppMessage;
