const express = require('express');
const bodyParser = require('body-parser');
const handleWhatsAppMessage = require('./index');
const WhatsAppService = require('./whatsappService');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

/**
 * GET Webhook Verification
 * Ported from teammate's Flask logic
 */
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ WEBHOOK_VERIFIED');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
});

/**
 * POST Webhook message receiver
 */
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        try {
            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {
                    const value = change.value;
                    if (value.messages) {
                        const message = value.messages[0];
                        const from = message.from;

                        if (message.type === 'text') {
                            const text = message.text.body;
                            console.log(`📥 Received from ${from}: ${text}`);

                            // 1. Process through our AI Multi-Tenant Engine
                            const replyText = await handleWhatsAppMessage(from, text);

                            // 2. Send back via real WhatsApp API
                            await WhatsAppService.sendMessage(from, replyText);
                        }
                    }
                }
            }
            res.status(200).send('EVENT_RECEIVED');
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
});
