const ReminderStore = require("./reminders/reminderStore");
const ReminderAgent = require("./agents/reminderAgent");
const SessionManager = require("./sessionManager");
const { getTenantConfig, listTenants } = require("./tenantResolver");

/**
 * Reminder Scheduler
 * ------------------
 * Periodically:
 *   1. Delivers due reactive reminders (user-set "remind me ..." reminders).
 *   2. Scans Supabase for payment dues and sends proactive, staged payment
 *      reminders. When a proactive reminder is sent, it primes the customer's
 *      session (active_payment_reminder) so their next WhatsApp reply is routed
 *      to the Reminder Agent's negotiation flow.
 *
 * SCALING NOTE: This runs in-process via setInterval, which is fine for a single
 * instance. For horizontal scaling, move this into a dedicated worker / cron and
 * add a row-level claim (e.g. SELECT ... FOR UPDATE SKIP LOCKED or a status flip)
 * so multiple instances don't double-send. The data already lives in Supabase,
 * so extracting this loop requires no changes to the agents.
 */

let schedulerStarted = false;

function formatDate(value) {
  if (!value) return "the due date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(d);
}

async function deliverReactiveReminders(WhatsAppService) {
  const due = await ReminderStore.getDue();
  for (const reminder of due) {
    try {
      const config = safeConfig(reminder.tenant_id);
      const reviewLink = config?.review_link
        ? `\n\nPlease share your review here: ${config.review_link}`
        : "";
      const task = reminder.task || "your reminder";
      const text = `Reminder: ${task}. I can also help you with products, prices, orders, payments, and reviews.${reviewLink}`;

      await WhatsAppService.sendMessage(reminder.user_phone, text);
      await ReminderStore.markDelivered(reminder.reminder_id);
    } catch (error) {
      console.error(
        `Reminder delivery failed for ${reminder.reminder_id}:`,
        error.message,
      );
      await ReminderStore.markFailed(reminder.reminder_id, error.message);
    }
  }
}

async function deliverPaymentReminders(WhatsAppService) {
  for (const tenant of listTenants()) {
    let config;
    try {
      config = getTenantConfig(tenant.key);
    } catch (err) {
      console.warn(`Scheduler: no config for tenant ${tenant.key}:`, err.message);
      continue;
    }

    let dues = [];
    try {
      dues = await ReminderAgent.scanProactive(tenant.db_tenant_id);
    } catch (err) {
      console.warn(`Scheduler: scanProactive failed for ${tenant.key}:`, err.message);
      continue;
    }

    for (const { payment, customer } of dues) {
      try {
        const ctx = {
          customerName: customer.name && customer.name !== "New Customer" ? customer.name : "there",
          amount: (payment.amount_cents || 0) / 100,
          dueDate: formatDate(payment.due_date),
        };
        const text = await ReminderAgent.composeInitialPaymentReminder(config, ctx);

        await WhatsAppService.sendMessage(customer.phone, text);
        await ReminderAgent.recordPaymentReminded(payment);

        // Prime the negotiation session so the customer's reply is handled by
        // the Reminder Agent (staged negotiation) rather than re-classified.
        try {
          const session = SessionManager.getSession(customer.phone, tenant.db_tenant_id);
          session.tenant_id = tenant.db_tenant_id;
          session.tenant_key = tenant.key;
          session.customer_id = customer.customer_id;
          session.customer_name = customer.name;
          session.active_payment_reminder = {
            payment_id: payment.payment_id,
            amount_cents: payment.amount_cents,
            due_date: ctx.dueDate,
            history: [{ role: "assistant", content: text }],
            turn: 0,
          };
          SessionManager.saveSession(customer.phone, session);
        } catch (err) {
          console.warn("Scheduler: could not prime negotiation session:", err.message);
        }
      } catch (error) {
        console.error(
          `Payment reminder failed for ${payment.payment_id}:`,
          error.message,
        );
      }
    }
  }
}

function safeConfig(tenantRef) {
  try {
    return getTenantConfig(tenantRef);
  } catch (_) {
    return {};
  }
}

function startReminderScheduler(WhatsAppService) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const pollIntervalMs = Number(process.env.REMINDER_POLL_INTERVAL_MS || 60000);

  const runOnce = async () => {
    await deliverReactiveReminders(WhatsAppService);
    await deliverPaymentReminders(WhatsAppService);
  };

  runOnce().catch((error) => {
    console.error("Initial reminder scan failed:", error.message);
  });

  setInterval(() => {
    runOnce().catch((error) => {
      console.error("Reminder poll failed:", error.message);
    });
  }, pollIntervalMs);
}

module.exports = startReminderScheduler;
