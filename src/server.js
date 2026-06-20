const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const handleWhatsAppMessage = require("./index");
const WhatsAppService = require("./whatsappAdapter");
const startReminderScheduler = require("./reminderScheduler");
const { resolveTenant, getTenantConfig } = require("./tenantResolver");

const app = express();

const PORT = process.env.PORT || 5000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET;

if (!VERIFY_TOKEN) {
  console.error("❌ ERROR: VERIFY_TOKEN is not set in .env!");
}
if (!META_APP_SECRET) {
  console.warn(
    "⚠️ META_APP_SECRET not set — incoming webhook payload signatures will NOT be verified. " +
      "Set it (Meta App → Settings → Basic → App Secret) to reject forged requests.",
  );
}

// Capture the raw request body so we can validate Meta's X-Hub-Signature-256.
app.use(
  bodyParser.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

/**
 * Verify the X-Hub-Signature-256 header against META_APP_SECRET (HMAC-SHA256 of
 * the raw body). Enforced only when META_APP_SECRET is configured, so existing
 * dev setups keep working. Uses a timing-safe comparison.
 */
function isValidSignature(req) {
  if (!META_APP_SECRET) return true; // not configured → skip (with the warning above)
  const signature = req.get("x-hub-signature-256");
  if (!signature || !req.rawBody) return false;
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", META_APP_SECRET)
      .update(req.rawBody)
      .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch (_) {
    return false;
  }
}

/**
 * GET Webhook Verification
 * Ported from teammate's Flask logic
 */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ WEBHOOK_VERIFIED");
      return res.status(200).send(challenge);
    } else {
      console.warn(
        `⚠️ Webhook verification failed. Received token: ${token}, expected: ${VERIFY_TOKEN}`,
      );
      return res.sendStatus(403);
    }
  }
});

/**
 * POST Webhook message receiver
 */
app.post("/webhook", async (req, res) => {
  if (!isValidSignature(req)) {
    console.warn("⚠️ Rejected webhook: invalid X-Hub-Signature-256");
    return res.sendStatus(401);
  }

  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    try {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (value.messages) {
            const message = value.messages[0];
            const from = message.from;

            let text = "";

            // Handle standard text messages
            if (message.type === "text") {
              text = message.text.body;
            }
            // Handle Interactive button clicks
            else if (
              message.type === "interactive" &&
              message.interactive.type === "button_reply"
            ) {
              const buttonId = message.interactive.button_reply.id;
              console.log(`🔘 Button Clicked: ${buttonId}`);

              // Process payment button callbacks
              if (buttonId.startsWith("PAID_")) {
                const paymentId = buttonId.replace("PAID_", "");
                const CustomerService = require("./customerService");
                await CustomerService.updatePaymentStatus(paymentId, "paid");
                const tenantId = resolveTenant(from);
                const config = getTenantConfig(tenantId);
                const reviewLink = config.review_link
                  ? `\n\nPlease share your review here: ${config.review_link}`
                  : "";
                // Send confirmation directly — no AI needed
                console.log(
                  `✅ Payment confirmed for ${from}, sending confirmation`,
                );
                await WhatsAppService.sendMessage(
                  from,
                  `Payment confirmed. Your order has been successfully placed.${reviewLink}`,
                );
                continue; // Skip AI processing for this message
              } else if (buttonId.startsWith("CANCEL_")) {
                const paymentId = buttonId.replace("CANCEL_", "");
                const CustomerService = require("./customerService");
                await CustomerService.updatePaymentStatus(
                  paymentId,
                  "cancelled",
                );
                text = "I want to cancel my order";
              }
            }

            if (text) {
              console.log(`📥 Received from ${from}: ${text}`);

              // 1. Process through our AI Multi-Tenant Engine
              const reply = await handleWhatsAppMessage(from, text);

              // 2. Send back via real WhatsApp API
              await WhatsAppService.sendMessage(from, reply.text);

              // 3. Send Interactive Payload if one exists
              if (
                reply.interactive &&
                reply.interactive.type === "INTERACTIVE_PAYMENT"
              ) {
                await WhatsAppService.sendInteractivePaymentMessage(
                  from,
                  reply.interactive.amount_cents,
                  reply.interactive.payment_id,
                );
              }
            }
          }
        }
      }
      res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      console.error("❌ ERROR Processing Webhook:", error);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(404);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server is listening on port ${PORT}`);
  console.log(`🔗 Webhook endpoint: /webhook`);
  startReminderScheduler(WhatsAppService);
});
