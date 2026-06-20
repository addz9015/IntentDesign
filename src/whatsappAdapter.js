/**
 * WhatsApp Channel Adapter
 * -------------------------
 * Single seam for outbound WhatsApp messaging. All WhatsApp communication
 * goes through Meta's WhatsApp Cloud API (see whatsappService.js).
 *
 * This indirection is intentional: future channels (e.g. a second WhatsApp
 * provider, SMS, or Instagram DM) can be added behind this interface without
 * touching the agents, router, or server. It exposes the same surface every
 * caller already uses:
 *   - sendMessage(toPhone, text)
 *   - sendInteractivePaymentMessage(toPhone, amountCents, paymentId)
 *
 * NOTE: The previous OpenWA (browser-automation) adapter has been removed.
 *       Meta Cloud API is the only supported transport.
 */
module.exports = require("./whatsappService");
