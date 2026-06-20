const BaseAgent = require("../core/baseAgent");
const ReminderEngine = require("../reminderEngine"); // reused for reactive parsing only
const ReminderStore = require("../reminders/reminderStore");
const llmClient = require("../services/llmClient");
const supabase = require("../supabaseClient");

/**
 * AI Agent 2 — Reminder Agent
 * ---------------------------
 * Two responsibilities:
 *
 *  (A) Reactive reminders — user types "remind me to X tomorrow at 9". Parsed
 *      and stored (Supabase app_reminders, JSON fallback) for the scheduler.
 *
 *  (B) Proactive payment reminders + negotiation — ported from the teammate's
 *      Python main.py. Reads transaction history (app_payments) from Supabase,
 *      finds dues, sends a staged reminder (warm → firm → escalation), and
 *      negotiates extensions / part-payment over WhatsApp. Business context
 *      (name, currency, late fee, escalation contact, tone) comes from the
 *      tenant config / DB instead of the hardcoded BUSINESSES dict.
 *
 * Extensible by `category`: payment, service, subscription, followup, purchase…
 * New proactive reminder sources can be added in scanProactive() without
 * touching the other agents.
 */
class ReminderAgent extends BaseAgent {
  constructor() {
    super({ name: "ReminderAgent", intents: ["REMINDER"] });
  }

  /**
   * Opt in when the user is replying to an active payment negotiation, or types
   * a reactive reminder request. Lets the router give reminders a pre-pass.
   */
  match(context) {
    if (context.session && context.session.active_payment_reminder) return true;
    return Boolean(ReminderEngine.parseReminder(context.message));
  }

  async handle(context) {
    const { message, session, config } = context;

    // (B) Continue an in-progress payment negotiation if one is active.
    if (session.active_payment_reminder) {
      return this.handleNegotiationReply(message, session, config);
    }

    // (A) Reactive "remind me ..." → schedule it.
    const parsed = ReminderEngine.parseReminder(message);
    if (parsed) {
      const reminderId = `rem_${Math.random().toString(16).slice(2, 10)}`;
      const reminder = {
        reminder_id: reminderId,
        tenant_id: session.tenant_id,
        customer_id: session.customer_id || null,
        user_phone: session.session_id,
        category: "custom",
        task: parsed.task,
        remind_at: parsed.remindAt.toISOString(),
        status: "scheduled",
        payload: { source_message: message },
        created_at: new Date().toISOString(),
      };
      await ReminderStore.create(reminder);

      const formattedTime = new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed.remindAt);
      const reviewLink = config?.review_link
        ? `\nPlease share your review here: ${config.review_link}`
        : "";

      return {
        type: "REMINDER_SET",
        data: reminder,
        message: `Okay, I will remind you on ${formattedTime} about ${parsed.task}.`,
        follow_up: `Are you also interested in buying something today?${reviewLink}`,
      };
    }

    // Classified as REMINDER but nothing actionable — be helpful.
    return {
      type: "REMINDER_INFO",
      message:
        "I can set reminders for you (e.g. \"remind me to reorder tomorrow at 6pm\") and I'll also nudge you about pending payments. What would you like me to remind you about?",
    };
  }

  // ─────────────────────────── Negotiation (ported main.py) ───────────────────

  /** Conversation stage based on number of customer turns. */
  static getStage(turnCount) {
    if (turnCount <= 0) return "initial_reminder — be warm and friendly";
    if (turnCount <= 2) return "first_followup — stay friendly but clear";
    if (turnCount <= 4) return "second_followup — neutral and firm";
    return "final_notice — strong but respectful, mention escalation contact";
  }

  static buildSystemPrompt(config, ctx, stage) {
    const biz = config.business_name || "our store";
    const currency = config.currency || "₹";
    const lateFee = config.late_fee != null ? config.late_fee : 50;
    const maxExt = config.max_extension_days != null ? config.max_extension_days : 3;
    const escalation = config.escalation_contact || "our support team";
    const tone = config.tone || "friendly and warm";

    return `You are an AI WhatsApp payment assistant for ${biz}.

BUSINESS CONTEXT:
- Business: ${biz}
- Currency symbol: ${currency}
- Late fee: ${currency}${lateFee} per day after due date
- Max extension allowed: ${maxExt} days only
- Escalation contact: ${escalation}
- Preferred tone: ${tone}

PAYMENT CONTEXT:
- Customer name: ${ctx.customerName}
- Amount due: ${currency}${ctx.amount}
- Due date: ${ctx.dueDate}
- Current conversation stage: ${stage}

STRICT RULES:
1. You ONLY represent ${biz}. Never mention or confuse with any other business.
2. Always address the customer by their name: ${ctx.customerName}
3. Keep replies SHORT — 2 to 4 sentences max, like a real WhatsApp message.
4. Use light emojis where suitable: 👍 ✅ 🙏
5. Never be rude or aggressive — always polite and professional.
6. Gradually increase firmness based on the stage hint below.
7. STAY ON TOPIC. Only discuss ${biz}, this payment, products, and orders. Do NOT
   engage in small talk or answer anything unrelated (weather, jokes, news, sports,
   personal questions, general chit-chat). If the customer goes off-topic, politely
   decline in ONE short line and steer back to the pending payment.

NEGOTIATION APPROACH:
- Customer says they'll pay now → thank them warmly, share a payment confirmation step.
- Customer promises to pay later → acknowledge, set a clear deadline.
- Customer asks for extension → grant up to ${maxExt} days, state the new deadline clearly.
- Customer says they have no money → empathize, offer 50% now + rest within ${maxExt} days.
- Customer keeps delaying → firm tone, mention escalation to ${escalation}.
- Customer is confused → explain the payment clearly and simply.

Stage hint (adjust your tone accordingly): ${stage}`;
  }

  /**
   * Generate the FIRST proactive payment reminder message for a due payment.
   * Used by the scheduler. Returns text (LLM if available, else a template).
   */
  static async composeInitialPaymentReminder(config, ctx) {
    const currency = config.currency || "₹";
    const stage = this.getStage(0);
    const system = this.buildSystemPrompt(config, ctx, stage);
    const opening = `Send the first payment reminder to ${ctx.customerName} for ${currency}${ctx.amount} due on ${ctx.dueDate}. Keep it short, friendly, and natural like a WhatsApp message.`;

    const llmText = await llmClient.chat([
      { role: "system", content: system },
      { role: "user", content: opening },
    ]);

    if (llmText) return llmText;

    return `Hi ${ctx.customerName}, a gentle reminder that a payment of ${currency}${ctx.amount} is due on ${ctx.dueDate}. Please let me know if you'd like to pay now. 🙏`;
  }

  /** Handle a customer reply during an active payment negotiation. */
  async handleNegotiationReply(message, session, config) {
    const neg = session.active_payment_reminder;
    neg.history = neg.history || [];
    neg.history.push({ role: "user", content: message });

    const turnCount = neg.history.filter((m) => m.role === "user").length;
    const stage = ReminderAgent.getStage(turnCount);
    const currency = config.currency || "₹";
    const ctx = {
      customerName: session.customer_name || "there",
      amount: (neg.amount_cents || 0) / 100,
      dueDate: neg.due_date || "the due date",
    };

    const system = ReminderAgent.buildSystemPrompt(config, ctx, stage);
    const llmText = await llmClient.chat([
      { role: "system", content: system },
      ...neg.history,
    ]);

    let reply = llmText;
    if (!reply) {
      // Deterministic fallback by simple keyword cues.
      const lower = message.toLowerCase();
      if (/(paid|done|sent|transferred)/.test(lower)) {
        reply = `Thank you, ${ctx.customerName}! 🙏 We'll confirm the payment of ${currency}${ctx.amount} shortly.`;
      } else if (/(extension|more time|later|tomorrow|next week)/.test(lower)) {
        const maxExt = config.max_extension_days != null ? config.max_extension_days : 3;
        reply = `No problem, ${ctx.customerName}. I can give you up to ${maxExt} more days. Please ensure the ${currency}${ctx.amount} is cleared by then. 👍`;
      } else {
        reply = `Thanks for your message, ${ctx.customerName}. The pending amount is ${currency}${ctx.amount}. Let me know how you'd like to proceed. 🙏`;
      }
    }

    neg.history.push({ role: "assistant", content: reply });
    neg.turn = turnCount;

    // End the negotiation once the customer indicates payment.
    if (/(paid|done|sent|transferred|completed)/i.test(message)) {
      session.active_payment_reminder = null;
    }

    return {
      type: "REMINDER_NEGOTIATION",
      data: { stage, payment_id: neg.payment_id },
      message: reply,
    };
  }

  // ─────────────────────────── Proactive scanning ─────────────────────────────

  /**
   * Find dues that need a proactive reminder for a tenant. Returns enriched
   * items { payment, customer } for the scheduler to send. Extend this method
   * to add new reminder categories (service, subscription, follow-up, …).
   */
  static async scanProactive(tenantId, now = new Date()) {
    const items = [];

    try {
      // Payment reminders: pending payments due on/before now, not over-reminded.
      const { data: payments, error } = await supabase
        .from("app_payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .not("due_date", "is", null)
        .lte("due_date", now.toISOString());

      if (error) {
        console.warn("ReminderAgent.scanProactive payments error:", error.message);
        return items;
      }

      const maxReminders = Number(process.env.MAX_PAYMENT_REMINDERS || 4);
      const minHoursBetween = Number(process.env.MIN_HOURS_BETWEEN_REMINDERS || 20);

      for (const p of payments || []) {
        if ((p.reminder_count || 0) >= maxReminders) continue;
        if (p.last_reminded) {
          const hoursSince =
            (now.getTime() - new Date(p.last_reminded).getTime()) / (1000 * 60 * 60);
          if (hoursSince < minHoursBetween) continue;
        }

        // Resolve the customer's phone.
        const { data: cust } = await supabase
          .from("app_customers")
          .select("*")
          .eq("customer_id", p.customer_id)
          .limit(1);
        const customer = cust && cust[0];
        if (!customer || !customer.phone) continue;

        items.push({ category: "payment", payment: p, customer });
      }
    } catch (err) {
      console.warn("ReminderAgent.scanProactive error:", err.message);
    }

    return items;
  }

  /** Stamp a payment as reminded (bumps reminder_count, sets last_reminded). */
  static async recordPaymentReminded(payment) {
    try {
      await supabase
        .from("app_payments")
        .update({
          last_reminded: new Date().toISOString(),
          reminder_count: (payment.reminder_count || 0) + 1,
        })
        .eq("payment_id", payment.payment_id);
    } catch (err) {
      console.warn("ReminderAgent.recordPaymentReminded error:", err.message);
    }
  }
}

module.exports = ReminderAgent;
