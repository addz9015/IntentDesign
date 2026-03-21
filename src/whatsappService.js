const axios = require('axios');

/**
 * WhatsApp Service
 * Ported from teammate's Python logic (send_whatsapp_message)
 */
class WhatsAppService {
    static async sendMessage(toPhone, messageText) {
        const phoneId = process.env.PHONE_NUMBER_ID;
        const accessToken = process.env.WHATSAPP_TOKEN;

        if (!phoneId || !accessToken) {
            console.warn("⚠️ WhatsApp credentials missing. Skipping send.");
            return;
        }

        const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`;

        const payload = {
            messaging_product: "whatsapp",
            to: toPhone,
            type: "text",
            text: { body: messageText }
        };

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                }
            });
            console.log(`✅ SENT to ${toPhone}: ${messageText}`);
            return response.data;
        } catch (error) {
            const errorData = error.response ? error.response.data : error.message;
            console.error(`❌ FAILED to send to ${toPhone}:`, JSON.stringify(errorData, null, 2));
            // Do NOT throw — allow server to continue responding
            return null;
        }
    }
    static async sendInteractivePaymentMessage(toPhone, amountCents, paymentId) {
        const phoneId = process.env.PHONE_NUMBER_ID;
        const accessToken = process.env.WHATSAPP_TOKEN;

        if (!phoneId || !accessToken) {
            console.warn("⚠️ WhatsApp credentials missing. Skipping interactive send.");
            return;
        }

        const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`;
        const amountRs = amountCents / 100;

        // Generate a dummy QR code using a public API
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=test@upi&am=${amountRs}&pn=UrbanWear&tr=${paymentId}`;

        const payload = {
            messaging_product: "whatsapp",
            to: toPhone,
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "image",
                    image: {
                        link: qrUrl
                    }
                },
                body: {
                    text: `*Order Confirmed!*\n\nPlease pay *₹${amountRs}* using the QR code above.\n\nAfter paying, press the button below to confirm.`
                },
                footer: {
                    text: `Ref: ${paymentId}`
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: `PAID_${paymentId}`,
                                title: "✅ I have Paid"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: `CANCEL_${paymentId}`,
                                title: "❌ Cancel Payment"
                            }
                        }
                    ]
                }
            }
        };

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                }
            });
            console.log(`✅ SENT INTERACTIVE QR to ${toPhone}`);
            return response.data;
        } catch (error) {
            const errorData = error.response ? error.response.data : error.message;
            console.error(`❌ FAILED to send interactive message to ${toPhone}:`, JSON.stringify(errorData, null, 2));
            return null;
        }
    }
}

module.exports = WhatsAppService;
