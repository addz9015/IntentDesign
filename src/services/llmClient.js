const Groq = require("groq-sdk");

/**
 * Shared LLM client (Groq)
 * ------------------------
 * Single place that talks to the model, so every agent uses the same provider,
 * model id, and error handling. Returns null when no API key is configured or
 * the call fails, letting callers fall back to deterministic templates (the bot
 * must never hard-crash because the LLM is unavailable).
 *
 * NOTE: The teammate's Python module used the OpenAI SDK pointed at Groq's
 * OpenAI-compatible endpoint. Here we use the native groq-sdk (already a Node
 * dependency) so there is one runtime and one client.
 */

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const llmClient = {
  isEnabled() {
    return Boolean(groq);
  },

  /**
   * Run a chat completion.
   * @param {Array<{role:string, content:string}>} messages
   * @param {{ temperature?:number, maxTokens?:number, json?:boolean }} [opts]
   * @returns {Promise<string|null>} assistant text, or null on failure
   */
  async chat(messages, opts = {}) {
    if (!groq) return null;
    try {
      const completion = await groq.chat.completions.create({
        model: MODEL,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 400,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      });
      return completion.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      console.warn("llmClient.chat failed:", err.message);
      return null;
    }
  },
};

module.exports = llmClient;
