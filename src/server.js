const express = require('express');
const bodyParser = require('body-parser');
const handleWhatsAppMessage = require('./index');
const WhatsAppService = require('./whatsappService');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

if (!VERIFY_TOKEN) {
    console.error("❌ ERROR: VERIFY_TOKEN is not set in .env!");
}

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
            console.warn(`⚠️ Webhook verification failed. Received token: ${token}, expected: ${VERIFY_TOKEN}`);
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

                        let text = "";

                        // Handle standard text messages
                        if (message.type === 'text') {
                            text = message.text.body;
                        }
                        // Handle Interactive button clicks
                        else if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
                            const buttonId = message.interactive.button_reply.id;
                            console.log(`🔘 Button Clicked: ${buttonId}`);

                            // Process payment button callbacks
                            if (buttonId.startsWith('PAID_')) {
                                const paymentId = buttonId.replace('PAID_', '');
                                const CustomerService = require('./customerService');
                                await CustomerService.updatePaymentStatus(paymentId, 'paid');
                                // Send confirmation directly — no AI needed
                                console.log(`✅ Payment confirmed for ${from}, sending confirmation`);
                                await WhatsAppService.sendMessage(from,
                                    `✅ *Payment Confirmed!*\n\nYour order has been successfully placed. 🎉\n\nThank you for shopping with us! We hope to see you again soon.\n\n*Happy Shopping!* 🛍️`
                                );
                                continue; // Skip AI processing for this message
                            } else if (buttonId.startsWith('CANCEL_')) {
                                const paymentId = buttonId.replace('CANCEL_', '');
                                const CustomerService = require('./customerService');
                                await CustomerService.updatePaymentStatus(paymentId, 'cancelled');
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
                            if (reply.interactive && reply.interactive.type === 'INTERACTIVE_PAYMENT') {
                                await WhatsAppService.sendInteractivePaymentMessage(from, reply.interactive.amount_cents, reply.interactive.payment_id);
                            }
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
