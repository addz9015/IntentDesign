const BaseAgent = require("../core/baseAgent");
const KnowledgeEngine = require("../knowledgeEngine");
const TransactionEngine = require("../transactionEngine");

/**
 * AI Agent 1 — Product Response Agent
 * -----------------------------------
 * Owns the product/shopping lifecycle:
 *   - Product questions, recommendations, availability (KnowledgeEngine + Supabase)
 *   - FAQ answers
 *   - Ordering, payment, cancellation (TransactionEngine, with guardrails)
 *
 * This is a thin orchestration wrapper around the existing, working engines —
 * the retrieval and transaction logic is intentionally unchanged so no current
 * behavior breaks. It simply gives the product domain a single clear boundary.
 */
class ProductAgent extends BaseAgent {
  constructor() {
    super({
      name: "ProductAgent",
      intents: ["PRODUCT_QUERY", "FAQ_QUERY", "TRANSACTIONAL"],
    });
  }

  async handle(context) {
    const { message, session, config, intentType } = context;

    if (intentType === "TRANSACTIONAL") {
      return TransactionEngine.handle(message, session, config);
    }

    // PRODUCT_QUERY and FAQ_QUERY both flow through the Knowledge Engine,
    // which decides between product retrieval and FAQ lookup internally.
    return KnowledgeEngine.handle(message, session, config);
  }
}

module.exports = ProductAgent;
