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

        const url = `https://graph.facebook.com/v17.0/${phoneId}/messages`;

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
            console.error(`❌ FAILED to send to ${toPhone}:`, error.response ? error.response.data : error.message);
            throw error;
        }
    }
}

module.exports = WhatsAppService;
