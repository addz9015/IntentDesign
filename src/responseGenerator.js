const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

/**
 * Response Generator (AI Formatting)
 */
class ResponseGenerator {
    static async generate(userMessage, responseData, session, config) {
        const tone = config.tone || 'friendly';
        const businessName = config.business_name || 'Antigravity AI';

        try {
            // Teammate's original templates for baseline consistency
            const replyTemplates = {
                "GREETING": ["Hi 👋 Welcome!", "Hello 😊", "Hey there!"],
                "ORDER": ["Which product would you like to order?", "Please tell me the product name."],
                "PAYMENT": ["We accept UPI, debit/credit cards.", "Payment options include UPI and cards."],
                "HELP": ["I’m here to help 😊", "Could you explain your issue?"]
            };

            const prompt = `
                You are a helpful assistant for ${businessName}.
                Tone: ${tone}
                
                Context Data: ${JSON.stringify(responseData)}
                User Message: "${userMessage}"
                Session Context (Last Product): ${session.last_product || 'None'}
                
                Teammate Reply Guidelines (Follow this style):
                ${JSON.stringify(replyTemplates)}

                Generate a natural, conversational WhatsApp response based on the context data.
                - If there's a proactive PAYMENT_REMINDER, include it politely.
                - If the message is in Hindi/Hinglish, respond in a mix of Hindi and English (Hinglish).
                - Keep responses concise and use emojis where appropriate.
                - Do NOT use placeholders.
            `;

            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama-3.3-70b-versatile',
            });

            return chatCompletion.choices[0].message.content;
        } catch (error) {
            console.error("Groq Generation Error:", error);
            // Fallback to mock generation if API fails
            return this.mockGroqGeneration(responseData, config);
        }
    }

    static mockGroqGeneration(responseData, config) {
        const { type, data, message } = responseData;
        const businessName = config.business_name;

        if (type === 'PRODUCT_QUERY' && data) {
            return `The ${data.name} is available for ${config.currency} ${data.price}. It's made of ${data.material}. Would you like to know about available sizes?`;
        }

        if (type === 'FAQ_QUERY' && data) {
            return data.answer;
        }

        if (type === 'CONFIRMATION_REQUIRED') {
            return message;
        }

        if (type === 'TRANSACTION_SUCCESS') {
            return `Done! ${message}`;
        }

        if (type === 'SMALL_TALK') {
            return `Hello from ${businessName}! How can I help you today?`;
        }

        return message || "I'm here to help! What's on your mind?";
    }
}

module.exports = ResponseGenerator;
