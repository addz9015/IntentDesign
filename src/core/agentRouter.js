const IntentClassifier = require("../intentClassifier");
const ResponseGenerator = require("../responseGenerator");
const SessionManager = require("../sessionManager");
const FallbackEngine = require("../fallbackEngine");
const { getAgentForIntent, getSecondaryAgents } = require("../agents");
const ReminderAgent = require("../agents/reminderAgent");

/**
 * Agent Router (orchestrator)
 * ---------------------------
 * Thin coordinator that replaces the old switch-based router:
 *   1. Reminder pre-pass (active payment negotiation OR a reactive "remind me").
 *   2. Classify intent.
 *   3. Dispatch to the owning agent (ProductAgent / ReturnPolicyAgent /
 *      ReminderAgent). SMALL_TALK and UNKNOWN are handled inline as before.
 *   4. Multi-domain coordination: if another agent also matches, run it and
 *      aggregate the replies into one WhatsApp message.
 *   5. Generate natural-language response and return { intent, response, interactive }.
 *
 * Behavior for product/order/cancel/small-talk/fallback is intentionally
 * identical to the previous router — the agents wrap the same engines.
 */

// We keep a single ReminderAgent instance for the pre-pass.
const reminderAgent = new ReminderAgent();

function extractInteractive(responseData) {
  if (responseData && responseData.type === "INTERACTIVE_PAYMENT") {
    return {
      type: "INTERACTIVE_PAYMENT",
      payment_id: responseData.payment_id,
      amount_cents: responseData.amount_cents,
    };
  }
  return null;
}

async function routeRequest(message, session, config, options = {}) {
  const context = { message, session, config, options };

  // 1. Reminder pre-pass — preserves the old "reminder handled first" behavior
  //    and routes active payment-negotiation replies to the Reminder Agent.
  if (reminderAgent.match(context)) {
    const reminderData = await reminderAgent.handle(context);
    if (reminderData) {
      SessionManager.saveSession(session.session_id, session);
      const response = await ResponseGenerator.generate(
        message,
        reminderData,
        session,
        config,
        options,
      );
      return { intent: "REMINDER", response, interactive: null };
    }
  }

  // 2. Classify intent.
  const { intent_type } = await IntentClassifier.classify(message, session);

  // 3. Resolve the primary handler.
  const primaryAgent = getAgentForIntent(intent_type);
  let responseData;
  const contextWithIntent = { ...context, intentType: intent_type };

  if (primaryAgent) {
    responseData = await primaryAgent.handle(contextWithIntent);
  } else if (intent_type === "SMALL_TALK") {
    responseData = { type: "SMALL_TALK" };
  } else {
    // UNKNOWN / unmapped → fallback engine (logs the unknown message).
    responseData = await FallbackEngine.handle(message, session, config);
  }

  // 4. Multi-domain coordination: let other agents that explicitly match also
  //    contribute, then aggregate. Skipped for small-talk to avoid noise.
  let interactive = extractInteractive(responseData);
  let response;

  const secondary =
    intent_type === "SMALL_TALK"
      ? []
      : getSecondaryAgents(contextWithIntent, primaryAgent);

  // Persist any session changes from the primary agent before generating text.
  SessionManager.saveSession(session.session_id, session);

  const primaryText = await ResponseGenerator.generate(
    message,
    responseData,
    session,
    config,
    options,
  );

  if (secondary.length > 0) {
    const parts = [primaryText];
    for (const agent of secondary) {
      try {
        const extra = await agent.handle(contextWithIntent);
        if (!extra) continue;
        interactive = interactive || extractInteractive(extra);
        const extraText = await ResponseGenerator.generate(
          message,
          extra,
          session,
          config,
          options,
        );
        if (extraText && !parts.includes(extraText)) parts.push(extraText);
      } catch (err) {
        console.warn(`Secondary agent ${agent.name} failed:`, err.message);
      }
    }
    SessionManager.saveSession(session.session_id, session);
    response = parts.filter(Boolean).join("\n\n");
  } else {
    response = primaryText;
  }

  // 5. Mark greeting as shown (unchanged behavior).
  if (intent_type === "SMALL_TALK" && !session.greeting_shown) {
    session.greeting_shown = true;
    SessionManager.saveSession(session.session_id, session);
  }

  return { intent: intent_type, response, interactive };
}

module.exports = routeRequest;
