/**
 * BaseAgent
 * ---------
 * Common contract every specialized agent implements. The router treats agents
 * as interchangeable plugins: it asks each agent which intents it claims, lets
 * agents opt in to a message via match(), and calls handle() to produce a
 * structured result that ResponseGenerator turns into natural language.
 *
 * To add a NEW agent (e.g. a teammate's module):
 *   1. Create src/agents/<yourAgent>.js that extends BaseAgent.
 *   2. Declare the intent(s) it owns via the `intents` array.
 *   3. Implement handle(context).
 *   4. Register it in src/agents/index.js.
 * No router, server, or other-agent changes required.
 *
 * Context shape passed to match()/handle():
 *   {
 *     message:  string,        // the (possibly translated-to-English) user text
 *     session:  object,        // mutable conversation state (persisted by router)
 *     config:   object,        // resolved tenant config (tone, currency, ids...)
 *     options:  object,        // e.g. { replyLanguage }
 *   }
 *
 * handle() returns "responseData" — the SAME shape the legacy engines return, so
 * ResponseGenerator already knows how to format it, e.g.:
 *   { type: 'PRODUCT_QUERY', data, products }
 *   { type: 'INTERACTIVE_PAYMENT', payment_id, amount_cents, message }
 *   { type: 'RETURN_POLICY', data, message }
 *   { type: 'REMINDER_SET', data, message, follow_up }
 * Returning null/undefined means "I decline this message" (router falls through).
 */
class BaseAgent {
  /** @param {{name:string, intents?:string[]}} meta */
  constructor(meta = {}) {
    this.name = meta.name || this.constructor.name;
    // Intent types (from IntentClassifier) this agent is the primary owner of.
    this.intents = meta.intents || [];
  }

  /** Does this agent own the given classified intent type? */
  ownsIntent(intentType) {
    return this.intents.includes(intentType);
  }

  /**
   * Optional fast opt-in used for multi-domain coordination. Return true if this
   * agent can meaningfully answer the message even when it's NOT the primary
   * classified intent. Default: false (only handle when it owns the intent).
   * @returns {boolean}
   */
  // eslint-disable-next-line no-unused-vars
  match(context) {
    return false;
  }

  /**
   * Produce structured responseData for the message.
   * @returns {Promise<object|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async handle(context) {
    throw new Error(`${this.name}.handle() not implemented`);
  }
}

module.exports = BaseAgent;
