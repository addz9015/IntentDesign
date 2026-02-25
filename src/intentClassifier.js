const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Load teammate's regex patterns
const INTENT_PATTERNS = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'intents_config.json'), 'utf8'));

/**
 * Intent Classifier (AI powered via Groq + Local Regex)
 */
class IntentClassifier {
    static async classify(message, session) {
        // Level 1: Fast Regex Pre-check (Teammate's logic)
        const localIntent = this.checkLocalRegex(message);
        if (localIntent && localIntent !== 'UNKNOWN') {
            return {
                intent_type: localIntent,
                confidence: 'HIGH',
                source: 'regex'
            };
        }

        // Level 2: AI Classification (Our logic)
        const allowedIntents = [
            'TRANSACTIONAL',
            'PRODUCT_QUERY',
            'FAQ_QUERY',
            'SMALL_TALK',
            'UNKNOWN'
        ];

        try {
            const prompt = `
                You are an intent classifier for a WhatsApp shopping assistant.
                Classify the user's message into one of the following intents:
                ${allowedIntents.join(', ')}

                User Message: "${message}"
                Recent Session Intent: ${session.last_intent || 'None'}

                Return ONLY a JSON object:
                {
                    "intent_type": "INTENT",
                    "confidence": "HIGH|MEDIUM|LOW"
                }
            `;

            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                response_format: { type: 'json_object' }
            });

            const result = JSON.parse(chatCompletion.choices[0].message.content);
            return { ...result, source: 'ai' };
        } catch (error) {
            console.error("Groq Classification Error:", error);
            // Fallback to simpler logic if API fails
            return { ...this.mockGroqCall(message), source: 'fallback' };
        }
    }

    static checkLocalRegex(message) {
        const cleanText = message.toLowerCase().trim();
        let bestMatch = { intent: "UNKNOWN", score: 0 };

        for (const intent of INTENT_PATTERNS) {
            for (const pattern of intent.patterns) {
                const regex = new RegExp(pattern.regex, 'i');
                if (regex.test(cleanText)) {
                    const score = pattern.regex.length;
                    if (score > bestMatch.score) {
                        bestMatch = { intent: intent.name, score: score };
                    }
                }
            }
        }

        // Map teammate's intent names to our PRD intent names if necessary
        const map = {
            "ORDER_NEW": "PRODUCT_QUERY",
            "ORDER_STATUS": "FAQ_QUERY",
            "GREETING": "SMALL_TALK",
            "PAYMENT": "TRANSACTIONAL",
            "CANCEL_ORDER": "TRANSACTIONAL"
        };

        return map[bestMatch.intent] || bestMatch.intent;
    }

    static mockGroqCall(message) {
        const lower = message.toLowerCase();
        if (lower.includes('hoodie') || lower.includes('cotton') || lower.includes('price') || lower.includes('daam')) {
            return { intent_type: 'PRODUCT_QUERY', confidence: 'HIGH' };
        }
        if (lower.includes('cancel') || lower.includes('return') || lower.includes('refund')) {
            return { intent_type: 'TRANSACTIONAL', confidence: 'HIGH' };
        }
        if (lower.includes('yes') || lower.includes('confirm') || lower.includes('ha')) {
            // Added simple confirmation detection to mock for robustness
            return { intent_type: 'TRANSACTIONAL', confidence: 'HIGH' };
        }
        if (lower.includes('delivery') || lower.includes('cod') || lower.includes('cash on')) {
            return { intent_type: 'FAQ_QUERY', confidence: 'HIGH' };
        }
        if (lower.includes('hi') || lower.includes('hello')) {
            return { intent_type: 'SMALL_TALK', confidence: 'HIGH' };
        }
        return { intent_type: 'UNKNOWN', confidence: 'LOW' };
    }
}

module.exports = IntentClassifier;
