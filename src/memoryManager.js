const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

/**
 * Rolling Summary Memory Manager
 *
 * Instead of sending the entire chat history (which grows unbounded),
 * we maintain a single compressed "memory_summary" string per session.
 * After each turn, we update it with just the new exchange.
 * The LLM only ever reads ~100-200 tokens of context, not hundreds of lines.
 */
class MemoryManager {
    /**
     * Updates the rolling summary after a completed turn.
     * Compresses the previous summary + latest exchange into a new summary.
     *
     * @param {string} previousSummary - The existing summary (can be empty on first turn)
     * @param {string} userMessage - The latest user message
     * @param {string} botReply - The bot's reply to that message
     * @returns {Promise<string>} - The updated summary
     */
    static async updateSummary(previousSummary, userMessage, botReply) {
        const hasSummary = previousSummary && previousSummary.trim().length > 0;

        const prompt = `You are a memory management assistant. Your task is to maintain a compact running summary of a shopping conversation.

${hasSummary ? `PREVIOUS SUMMARY:\n${previousSummary}\n\n` : ''}LATEST EXCHANGE:
User: "${userMessage}"
Bot: "${botReply}"

Update the summary to reflect what has been discussed. Be extremely concise - max 3 bullet points. Focus on:
- Products mentioned and user's interest level
- Any pending actions (order, cancel, refund)
- User preferences (size, color, etc.)

Return ONLY the bullet points, no extra text.`;

        try {
            const result = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama-3.1-8b-instant', // Fast, cheap model for memory updates
                max_tokens: 150,
            });
            return result.choices[0].message.content.trim();
        } catch (error) {
            // On failure, build a simple fallback summary so we never crash
            const fallback = hasSummary
                ? `${previousSummary}\n- User said: "${userMessage.slice(0, 60)}"`
                : `- User said: "${userMessage.slice(0, 60)}"`;
            console.warn('MemoryManager: Groq summary update failed, using fallback.', error.message);
            return fallback;
        }
    }
}

module.exports = MemoryManager;
