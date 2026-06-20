const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const groq = process.env.GROQ_API_KEY
    ? new Groq({
        apiKey: process.env.GROQ_API_KEY
    })
    : null;

// Load teammate's regex patterns
const INTENT_PATTERNS = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'intents_config.json'), 'utf8'));

const SMALL_TALK_PATTERNS = [
    /\b(weather|rain|sunny|hot|cold|temperature)\b/i,
    /\b(how are you|how's it going|whats up|what's up|timepass|bored|boring)\b/i,
    /\b(just chatting|chat|talk to me|random)\b/i
];

const REMINDER_PATTERNS = [
    /\b(remind|reminder|follow up|follow-up|ping me)\b/i,
    /\b(call me back|message me later|ask me later)\b/i
];

// Return/refund/exchange questions go to the Return Policy Agent.
// NOTE: a bare "I want a refund" (action) is intentionally NOT caught here so it
// still flows to the TransactionEngine refund-confirmation guardrail. We only
// claim RETURN_POLICY for return/exchange and refund *questions*.
const RETURN_POLICY_PATTERNS = [
    /\breturn(s|ing)?\b/i,
    /\bexchange\b/i,
    /\breturn\s+policy\b/i,
    /\brefund\s+policy\b/i
];
const REFUND_QUESTION_CUES = /\b(can|could|am|are|is|eligible|qualify|able|how|what|when|policy|allowed)\b/i;

/**
 * Intent Classifier (AI powered via Groq + Local Regex)
 */
class IntentClassifier {
    static async classify(message, session) {
        const text = String(message || '').trim();

        if (REMINDER_PATTERNS.some((pattern) => pattern.test(text))) {
            return {
                intent_type: 'REMINDER',
                confidence: 'HIGH',
                source: 'rule'
            };
        }

        const mentionsReturnOrExchange = RETURN_POLICY_PATTERNS.some((pattern) => pattern.test(text));
        const isRefundQuestion = /\b(refund|money\s*back)\b/i.test(text) && REFUND_QUESTION_CUES.test(text);
        if (mentionsReturnOrExchange || isRefundQuestion) {
            return {
                intent_type: 'RETURN_POLICY',
                confidence: 'HIGH',
                source: 'rule'
            };
        }

        // Cancellation must beat the ORDER_NEW regex: "cancel my order" contains
        // "order", so the local "(want|place|buy).*order" pattern would otherwise
        // outscore "cancel.*order" and misroute it to a product/order flow.
        if (/\bcancel\b/i.test(text)) {
            return {
                intent_type: 'TRANSACTIONAL',
                confidence: 'HIGH',
                source: 'rule'
            };
        }

        if (SMALL_TALK_PATTERNS.some((pattern) => pattern.test(text))) {
            return {
                intent_type: 'SMALL_TALK',
                confidence: 'HIGH',
                source: 'rule'
            };
        }

        // Level 1: Fast Regex Pre-check (Teammate's logic)
        const localIntent = this.checkLocalRegex(message);

        // Fast-path: If an action is pending, treat confirmations/rejections as TRANSACTIONAL
        const lower = message.toLowerCase().trim();
        const isConfirmation = /^(yes|ha|sure|confirm|ok|okay|pl|place|do it|go ahead|yep|yup)$/.test(lower) || lower.includes('confirm') || lower.includes('place order');
        const isRejection = /^(no|nope|nahi|cancel|stop|dont|don't)$/.test(lower) || lower.includes('cancel');

        if (session.pending_action && (isConfirmation || isRejection)) {
            return {
                intent_type: 'TRANSACTIONAL',
                confidence: 'HIGH',
                source: 'state_shortcut'
            };
        }

        const isSimpleAffirmation = /^(yes|yeah|yep|yup|sure|ok|okay|correct|right|haan|ha|theek)$/i.test(lower);
        const isSimpleRejection = /^(no|nope|nahi|na)$/i.test(lower);

        // Fast-path: "yes/ok/sure" with a product in context → user wants to order
        // Route to TRANSACTIONAL so TransactionEngine can set pending_action = NEW_ORDER
        if (!session.pending_action && isSimpleAffirmation && session.last_product) {
            return {
                intent_type: 'TRANSACTIONAL',
                confidence: 'HIGH',
                source: 'state_shortcut'
            };
        }

        // Fast-path: "no" during a product conversation → KnowledgeEngine handles the rejection
        if (!session.pending_action && isSimpleRejection && session.last_intent === 'PRODUCT_QUERY') {
            return {
                intent_type: 'PRODUCT_QUERY',
                confidence: 'HIGH',
                source: 'state_shortcut'
            };
        }

        // Fast-path: explicit size or color answer — always route to PRODUCT_QUERY when product is in context
        const isSizeAnswer = /^(xs|s|m|l|xl|xxl)$/i.test(lower.trim());
        const isColorAnswer = /^(black|grey|gray|blue|white|red|green|yellow|pink|navy|maroon|brown|orange)$/i.test(lower.trim());
        if (session.last_product && (isSizeAnswer || isColorAnswer)) {
            return {
                intent_type: 'PRODUCT_QUERY',
                confidence: 'HIGH',
                source: 'state_shortcut'
            };
        }

        // Fast-path: short follow-up during a product conversation (size: "S", "M"; color: "blue"; etc.)
        // Excludes affirmations/rejections already handled above
        const words = lower.split(/\s+/);
        if (
            session.last_product &&
            !session.pending_action &&
            words.length <= 3 &&
            !isSimpleAffirmation &&
            !isSimpleRejection
        ) {
            return {
                intent_type: 'PRODUCT_QUERY',
                confidence: 'HIGH',
                source: 'state_shortcut'
            };
        }

        if (localIntent && localIntent !== 'UNKNOWN') {
            return {
                intent_type: localIntent,
                confidence: 'HIGH',
                source: 'regex'
            };
        }

        if (!groq) {
            return { ...this.mockGroqCall(message), source: 'fallback_no_api' };
        }

        // Level 2: AI Classification (Our logic)
        const allowedIntents = [
            'TRANSACTIONAL',
            'PRODUCT_QUERY',
            'FAQ_QUERY',
            'SMALL_TALK',
            'REMINDER',
            'RETURN_POLICY',
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
        if (!message) return "UNKNOWN";
        const cleanText = String(message).toLowerCase().trim();
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
