const IntentClassifier = require("./intentClassifier");
const KnowledgeEngine = require("./knowledgeEngine");
const TransactionEngine = require("./transactionEngine");
const FallbackEngine = require("./fallbackEngine");
const ResponseGenerator = require("./responseGenerator");
const SessionManager = require("./sessionManager");

/**
 * Request Router
 * Classifies intent then dispatches to the appropriate engine,
 * generates a natural language response, and returns the result.
 */
async function routeRequest(message, session, config, options = {}) {
  // 1. Classify intent
  const { intent_type } = await IntentClassifier.classify(message, session);

  // 2. Route to appropriate engine
  let responseData;
  switch (intent_type) {
    case "TRANSACTIONAL":
      responseData = await TransactionEngine.handle(message, session, config);
      break;
    case "PRODUCT_QUERY":
    case "FAQ_QUERY":
      responseData = await KnowledgeEngine.handle(message, session, config);
      break;
    case "SMALL_TALK":
      responseData = { type: "SMALL_TALK" };
      break;
    default:
      responseData = await FallbackEngine.handle(message, session, config);
  }

  // 3. Extract interactive payload (payment QR) if present - passed through to server
  let interactive = null;
  if (responseData && responseData.type === "INTERACTIVE_PAYMENT") {
    interactive = {
      type: "INTERACTIVE_PAYMENT",
      payment_id: responseData.payment_id,
      amount_cents: responseData.amount_cents,
    };
  }

  // 4. Persist any session state changes made by the engines
  SessionManager.saveSession(session.session_id, session);

  // 5. Generate natural language response via LLM
  const response = await ResponseGenerator.generate(
    message,
    responseData,
    session,
    config,
    options,
  );

  // 6. Mark greeting as shown if this was a greeting intent and greeting wasn't shown before
  if (intent_type === "SMALL_TALK" && !session.greeting_shown) {
    session.greeting_shown = true;
    SessionManager.saveSession(session.session_id, session);
  }

  return {
    intent: intent_type,
    response,
    interactive,
  };
}

module.exports = routeRequest;
