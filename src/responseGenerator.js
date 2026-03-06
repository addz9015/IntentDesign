const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

/**
 * Formats structured data from the engines into a concise context string for the AI.
 */
function formatContext(responseData) {
    if (!responseData) return 'No specific context.';

    const { type, data, message, products } = responseData;

    switch (type) {
        case 'PRODUCT_QUERY':
            if (data) {
                return `The user is asking about the ${data.name}. Details: Name=${data.name}, Price=${data.price}, Material=${data.material || 'N/A'}, Sizes=${(data.sizes || []).join(', ')}, Colors=${(data.colors || []).join(', ')}.`;
            }
            if (products) {
                const productNames = products.map(p => p.name).join(', ');
                return `The user is asking about products. Available products: ${productNames}.`;
            }
            return 'The user is asking about a product, but no specific product was found.';
        case 'FAQ_QUERY':
            return `FAQ Answer: ${data.answer}`;
        case 'TRANSACTION_SUCCESS':
            return `Transaction successful: ${message}`;
        case 'TRANSACTION_CANCELLED':
            return `Transaction cancelled: ${message}`;
        case 'CONFIRMATION_REQUIRED':
            return `Awaiting user confirmation for: ${message}`;
        case 'SMALL_TALK':
            return 'The user is making small talk.';
        default:
            return message || 'General query.';
    }
}

/**
 * Response Generator (AI Formatting)
 * Uses rolling summary memory to maintain context without reading full history.
 * The LLM only sees a compact memory summary + the current query context.
 */
class ResponseGenerator {
    static async generate(userMessage, responseData, session, config) {
        const tone = config.tone || 'friendly';
        const businessName = config.business_name || 'Antigravity AI';
        const memorySummary = session.memory_summary || '';

        try {
            const formattedContext = formatContext(responseData);

            const systemPrompt = `You are a helpful WhatsApp shopping assistant for ${businessName}.
Tone: ${tone}. Keep replies SHORT (1-3 sentences max). Use emojis. If user writes in Hindi, reply in Hindi too. But if the user writes in english reply in english only.

CONVERSATION MEMORY (what has been discussed so far):
${memorySummary || '(This is the start of the conversation)'}

CURRENT QUERY CONTEXT:
${formattedContext}

RULES:
- NEVER use placeholders like [product_name] or [size].
- Refer to previously discussed products by name if relevant (from memory above).
- If the user says "it", "that", "the one", use the memory to figure out what they mean.
- Do NOT ask questions that are already answered in memory.
- If the user says "no", "not interested", "nope", "nahi", or any rejection, STOP suggesting that product. Acknowledge politely ("No problem! 😊") and ask if anything else can help. NEVER push the same product again.
- Do NOT be pushy or repeat the same recommendation more than once.
- NEVER reference or remind the user that they previously said no to something — just move on naturally.`;

            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                model: 'llama-3.3-70b-versatile',
                max_tokens: 200,
            });

            return chatCompletion.choices[0].message.content;
        } catch (error) {
            console.error("Groq Generation Error:", error);
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
