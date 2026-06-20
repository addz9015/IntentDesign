const BaseAgent = require("../core/baseAgent");
const supabase = require("../supabaseClient");

/**
 * AI Agent 3 — Return Policy Agent
 * --------------------------------
 * Handles product return / refund / exchange questions. ALL policy rules come
 * from the database (app_return_policies), so changing the policy only requires
 * a DB update — no code change. The agent:
 *   1. Detects whether the user wants the policy explained or an eligibility check.
 *   2. Fetches the relevant return policy for the tenant (and product category).
 *   3. For eligibility, fetches the customer's most recent purchase and evaluates
 *      it against the return window + category restrictions.
 *   4. Returns a structured result for ResponseGenerator.
 *
 * Designed to degrade gracefully: if app_return_policies (or a category column)
 * does not exist yet, it falls back to the tenant's file policy text so the bot
 * still answers instead of crashing.
 */

const RETURN_PATTERNS =
  /\b(return|refund|exchange|money\s*back|send\s*it\s*back|give\s*back)\b/i;
const POLICY_QUESTION_PATTERNS =
  /\b(policy|what\s+is\s+your|how\s+do\s+(i|we)|how\s+long|terms|conditions|rules)\b/i;
const ELIGIBILITY_PATTERNS =
  /\b(can\s+i|am\s+i|eligible|qualify|able\s+to|allowed\s+to|is\s+it\s+possible|return\s+this|return\s+my|return\s+it)\b/i;

class ReturnPolicyAgent extends BaseAgent {
  constructor() {
    super({ name: "ReturnPolicyAgent", intents: ["RETURN_POLICY"] });
  }

  /** Opt in for multi-domain coordination when return/refund words appear. */
  match(context) {
    return RETURN_PATTERNS.test(String(context.message || ""));
  }

  async handle(context) {
    const { message, session } = context;
    const tenantId = session.tenant_id;
    const lower = String(message || "").toLowerCase();

    const policies = await this.fetchPolicies(tenantId, session.tenant_key);

    const wantsEligibility =
      ELIGIBILITY_PATTERNS.test(lower) && !this.isPurePolicyQuestion(lower);

    if (!wantsEligibility) {
      // General policy explanation.
      return {
        type: "RETURN_POLICY",
        data: { policies },
        message: this.describePolicies(policies),
      };
    }

    // Eligibility check against the customer's most recent purchase.
    const purchase = await this.getMostRecentPurchase(session);
    if (!purchase) {
      return {
        type: "RETURN_POLICY",
        data: { policies },
        message:
          "I couldn't find a recent purchase on your account to check return eligibility. " +
          this.describePolicies(policies),
      };
    }

    const verdict = this.evaluateEligibility(purchase, policies);
    return {
      type: "RETURN_POLICY",
      data: { policies, purchase, verdict },
      message: verdict.message,
    };
  }

  isPurePolicyQuestion(lower) {
    // "what is your return policy" → explain, don't run eligibility
    return POLICY_QUESTION_PATTERNS.test(lower) && !/\bthis\b|\bmy\b|\bit\b/.test(lower);
  }

  /**
   * Read return policies from the DB for this tenant. Returns an array of policy
   * rows. Falls back to the tenant's file policy (policies.json) if the table is
   * missing, so the agent always has something to say.
   */
  async fetchPolicies(tenantId, tenantKey) {
    try {
      const { data, error } = await supabase
        .from("app_return_policies")
        .select("*")
        .eq("tenant_id", tenantId);

      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
      if (error) {
        console.warn(
          "ReturnPolicyAgent: app_return_policies not available, using file fallback:",
          error.message,
        );
      }
    } catch (err) {
      console.warn("ReturnPolicyAgent DB error, using file fallback:", err.message);
    }

    return this.filePolicyFallback(tenantKey);
  }

  filePolicyFallback(tenantKey) {
    try {
      const fs = require("fs");
      const path = require("path");
      const p = path.join(
        __dirname,
        "..",
        "..",
        "tenants",
        tenantKey || "urbanwear",
        "policies.json",
      );
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      // Normalize the flat file policy into a single pseudo-policy row.
      return [
        {
          category: null,
          return_window_days: 7,
          refundable: true,
          exchange_allowed: true,
          non_returnable: false,
          conditions:
            raw.cancellation_policy || raw.refund_policy || "Standard return policy applies.",
          _source: "file",
          _refund_text: raw.refund_policy,
          _cancellation_text: raw.cancellation_policy,
        },
      ];
    } catch (err) {
      return [
        {
          category: null,
          return_window_days: 7,
          refundable: true,
          exchange_allowed: true,
          non_returnable: false,
          conditions: "Returns are accepted within 7 days of delivery.",
          _source: "default",
        },
      ];
    }
  }

  /** Pick the policy row that applies to a product category (else the global one). */
  selectPolicyForCategory(policies, category) {
    if (!Array.isArray(policies) || policies.length === 0) return null;
    if (category) {
      const match = policies.find(
        (p) => (p.category || "").toLowerCase() === String(category).toLowerCase(),
      );
      if (match) return match;
    }
    // Global policy (category null/empty), else first row.
    return policies.find((p) => !p.category) || policies[0];
  }

  /**
   * Most recent purchase for the customer. Uses app_payments (status 'paid').
   * Joins to the product to read its category when available.
   */
  async getMostRecentPurchase(session) {
    if (!session.customer_id) return null;
    try {
      const { data, error } = await supabase
        .from("app_payments")
        .select("*")
        .eq("customer_id", session.customer_id)
        .eq("status", "paid")
        .order("paid_at", { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) return null;
      const payment = data[0];

      // Try to enrich with product category (column may not exist yet).
      let category = null;
      let productName = payment.product_name || null;
      const productId = payment.product_id || session.last_product;
      if (productId) {
        try {
          const { data: prod } = await supabase
            .from("app_products")
            .select("*")
            .eq("product_id", productId)
            .limit(1);
          if (prod && prod[0]) {
            category = prod[0].category || null;
            productName = productName || prod[0].name;
          }
        } catch (_) {
          /* category column may not exist; ignore */
        }
      }

      return {
        payment_id: payment.payment_id,
        purchase_date: payment.paid_at || payment.created_at,
        product_id: productId,
        product_name: productName,
        category,
        amount_cents: payment.amount_cents,
      };
    } catch (err) {
      console.warn("ReturnPolicyAgent.getMostRecentPurchase error:", err.message);
      return null;
    }
  }

  /** Core eligibility logic — purely DB-driven rules, no hardcoded windows. */
  evaluateEligibility(purchase, policies) {
    const policy = this.selectPolicyForCategory(policies, purchase.category);
    const productLabel = purchase.product_name || "your purchase";

    if (!policy) {
      return {
        eligible: false,
        reason: "no_policy",
        message: `I couldn't find a return policy that applies to ${productLabel}. Please contact support.`,
      };
    }

    if (policy.non_returnable || policy.refundable === false) {
      return {
        eligible: false,
        reason: "non_returnable",
        message: `Unfortunately, ${productLabel} falls under a non-returnable category. ${policy.conditions || ""}`.trim(),
      };
    }

    const windowDays = Number(policy.return_window_days);
    if (!Number.isFinite(windowDays) || windowDays <= 0) {
      // No window restriction defined → treat as eligible.
      return {
        eligible: true,
        reason: "eligible",
        message: `Yes, ${productLabel} is eligible for a return/refund. ${policy.conditions || ""}`.trim(),
      };
    }

    const purchaseDate = purchase.purchase_date
      ? new Date(purchase.purchase_date)
      : null;
    if (!purchaseDate || Number.isNaN(purchaseDate.getTime())) {
      return {
        eligible: true,
        reason: "unknown_date",
        message: `Based on our policy, ${productLabel} can be returned within ${windowDays} days of delivery. ${policy.conditions || ""}`.trim(),
      };
    }

    const daysSince = Math.floor(
      (Date.now() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const daysLeft = windowDays - daysSince;

    if (daysLeft >= 0) {
      return {
        eligible: true,
        reason: "within_window",
        days_left: daysLeft,
        message: `Yes — ${productLabel} is within the ${windowDays}-day return window (about ${daysLeft} day(s) left). ${policy.conditions || ""}`.trim(),
      };
    }

    return {
      eligible: false,
      reason: "window_expired",
      days_overdue: Math.abs(daysLeft),
      message: `Sorry, the ${windowDays}-day return window for ${productLabel} has passed (by ${Math.abs(daysLeft)} day(s)), so it's no longer eligible for a return/refund.`,
    };
  }

  describePolicies(policies) {
    if (!Array.isArray(policies) || policies.length === 0) {
      return "We accept returns within our standard return window. Please contact support for details.";
    }
    // File fallback shape: surface the human-readable text directly.
    const fileRow = policies.find((p) => p._source);
    if (fileRow) {
      const parts = [];
      if (fileRow._refund_text) parts.push(fileRow._refund_text);
      if (fileRow._cancellation_text) parts.push(fileRow._cancellation_text);
      if (parts.length) return parts.join(" ");
      return fileRow.conditions;
    }

    const lines = policies.map((p) => {
      const cat = p.category ? `${p.category}: ` : "";
      if (p.non_returnable || p.refundable === false) {
        return `${cat}non-returnable.`;
      }
      const win = p.return_window_days
        ? `returnable within ${p.return_window_days} days`
        : "returnable";
      const exch = p.exchange_allowed ? ", exchanges allowed" : "";
      return `${cat}${win}${exch}.${p.conditions ? " " + p.conditions : ""}`;
    });
    return `Here's our return policy: ${lines.join(" ")}`;
  }
}

module.exports = ReturnPolicyAgent;
