const Groq = require("groq-sdk");
const LanguageService = require("./languageService");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const LANGUAGE_PROMPT_LABELS = {
  en: "English",
  hi: "Hindi",
  hinglish: "Hinglish",
  bn: "Bengali",
  pa: "Punjabi",
  gu: "Gujarati",
  or: "Odia",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  mr: "Marathi",
};

const EMOJI_BY_TYPE = {
  PRODUCT_QUERY: ["🛍️", "✨", "👍"],
  FAQ_QUERY: ["✅", "📦", "ℹ️"],
  TRANSACTION_SUCCESS: ["✅", "🎉", "🛒"],
  TRANSACTION_CANCELLED: ["👌", "🙂", "✅"],
  CONFIRMATION_REQUIRED: ["✅", "👍", "🙂"],
  SMALL_TALK: ["👋", "😊", "🙂"],
  INTERACTIVE_PAYMENT: ["💳", "✅", "🎉"],
  FALLBACK: ["🙂", "🙏", "✨"],
  DEFAULT: ["🙂", "✨", "👍"],
};

/**
 * Formats structured data from the engines into a concise context string for the AI.
 */
function formatContext(responseData) {
  if (!responseData) return "No specific context.";

  const { type, data, message, products } = responseData;

  switch (type) {
    case "PRODUCT_QUERY":
      if (data) {
        return `The user is asking about the ${data.name}. Details: Name=${data.name}, Price=${data.price}, Material=${data.material || "N/A"}, Sizes=${(data.sizes || []).join(", ")}, Colors=${(data.colors || []).join(", ")}.`;
      }
      if (products) {
        const productNames = products.map((p) => p.name).join(", ");
        return `The user is asking about products. Available products: ${productNames}.`;
      }
      return "The user is asking about a product, but no specific product was found.";
    case "FAQ_QUERY":
      return `FAQ Answer: ${data.answer}`;
    case "TRANSACTION_SUCCESS":
      return `Transaction successful: ${message}`;
    case "TRANSACTION_CANCELLED":
      return `Transaction cancelled: ${message}`;
    case "CONFIRMATION_REQUIRED":
      return `Awaiting user confirmation for: ${message}`;
    case "SMALL_TALK":
      return message
        ? `Small talk context: ${message}`
        : "The user is making small talk.";
    case "BROWSING_DECLINED":
      return message;
    default:
      return message || "General query.";
  }
}

function normalizePromptLanguage(languageCode) {
  const value = String(languageCode || "")
    .trim()
    .toLowerCase();
  if (!value) return "";
  if (value === "english") return "en";
  if (value === "hindi") return "hi";
  if (value === "odia") return "or";
  return value;
}

function detectLanguageFromMessage(message) {
  const text = String(message || "");

  if (/[\u0B00-\u0B7F]/.test(text)) return "or";
  if (/[\u0980-\u09FF]/.test(text)) return "bn";
  if (/[\u0A00-\u0A7F]/.test(text)) return "pa";
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu";
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta";
  if (/[\u0C00-\u0C7F]/.test(text)) return "te";
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn";
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (LanguageService.isLikelyHinglish(text)) return "hinglish";

  return "en";
}

function resolvePromptLanguage(userMessage, session, options) {
  const preferredLanguage =
    options?.replyLanguage ||
    session.reply_language_preference ||
    session.user_language ||
    "";
  const normalizedPreferred = normalizePromptLanguage(preferredLanguage);

  if (normalizedPreferred) {
    return normalizedPreferred;
  }

  return detectLanguageFromMessage(userMessage);
}

function buildLanguageRule(promptLanguage) {
  const normalized = normalizePromptLanguage(promptLanguage) || "en";
  const languageName =
    LANGUAGE_PROMPT_LABELS[normalized] ||
    LanguageService.getLanguageName(normalized);

  if (normalized === "hinglish") {
    return `!! LANGUAGE RULE - HIGHEST PRIORITY !!
Reply language for this turn: Hinglish.
You MUST reply ONLY in Hinglish.
- Use Roman script only (no Devanagari script).
- Keep a natural Hindi + English mix.
This rule overrides everything else.`;
  }

  return `!! LANGUAGE RULE - HIGHEST PRIORITY !!
Reply language for this turn: ${languageName}.
You MUST reply ONLY in ${languageName}.
This rule overrides everything else.`;
}

function getEmojiProbability(config = {}) {
  const rawProbability =
    process.env.RESPONSE_EMOJI_PROBABILITY ?? config.emoji_probability;
  const parsed = Number(rawProbability);

  if (!Number.isFinite(parsed)) {
    return 0.25;
  }

  return Math.min(1, Math.max(0, parsed));
}

function maybeAddRandomEmoji(text, responseData, config) {
  if (!text) return text;

  const trimmedText = String(text).trim();
  if (!trimmedText) return trimmedText;
  if (/[\u{1F300}-\u{1FAFF}]/u.test(trimmedText)) return trimmedText;

  const probability = getEmojiProbability(config);
  if (probability <= 0 || Math.random() > probability) {
    return trimmedText;
  }

  const pool = EMOJI_BY_TYPE[responseData?.type] || EMOJI_BY_TYPE.DEFAULT;
  const emoji = pool[Math.floor(Math.random() * pool.length)];
  return `${trimmedText} ${emoji}`;
}

/**
 * Response Generator (AI Formatting)
 * Uses rolling summary memory to maintain context without reading full history.
 * The LLM only sees a compact memory summary + the current query context.
 */
class ResponseGenerator {
  static async generate(
    userMessage,
    responseData,
    session,
    config,
    options = {},
  ) {
    const tone = config.tone || "friendly";
    const businessName = config.business_name || "Antigravity AI";
    const memorySummary = session.memory_summary || "";

    try {
      const formattedContext = formatContext(responseData);
      const isOrderRelated = [
        "CONFIRMATION_REQUIRED",
        "TRANSACTION_SUCCESS",
        "INTERACTIVE_PAYMENT",
      ].includes(responseData?.type);
      const isSmallTalk = responseData?.type === "SMALL_TALK";
      const promptLanguage = resolvePromptLanguage(
        userMessage,
        session,
        options,
      );
      const languageRule = buildLanguageRule(promptLanguage);
      const rejectedNames = session.rejected_product_names || [];

      const hasOrderSize = !!session.order_size;
      const hasOrderColor = !!session.order_color;
      const previousOrders = session.previous_orders || [];
      const isReturning =
        session.is_returning_customer && previousOrders.length > 0;

      const previousOrdersText = previousOrders
        .map((o) => {
          const name = o.product_name || "an item";
          const amount = o.amount_cents ? `₹${o.amount_cents / 100}` : "";
          return `- ${name} ${amount}`.trim();
        })
        .join("\n");

      // Build greeting instruction based on whether greeting was already shown
      let greetingInstruction = "";
      if (isSmallTalk) {
        if (!session.greeting_shown) {
          greetingInstruction =
            "- This is the start of the conversation. Greet the user briefly and IMMEDIATELY ask how you can help them with their shopping. DO NOT ask how their day is going. AVOID all non-shopping small talk.";
        } else {
          greetingInstruction =
            "- Acknowledge their message briefly and IMMEDIATELY redirect the conversation to shopping. DO NOT ask how their day is going. AVOID all non-shopping small talk.";
        }
      }

      const systemPrompt = `You are a helpful WhatsApp shopping assistant for ${businessName}.
Tone: ${tone}. Keep replies SHORT (1-3 sentences max). Do not add emojis on your own.

${languageRule}
${rejectedNames.length > 0 ? `\n!! REJECTED PRODUCTS - ABSOLUTE RULE !!\nThe user said NO to these. NEVER name, mention, or suggest them under any circumstances: ${rejectedNames.join(", ")}\n` : ""}
${greetingInstruction}
CUSTOMER INFO:
Name: ${session.customer_name || "Customer"}${isOrderRelated ? `\nCustomer ID: ${session.customer_id}` : ""}
${isReturning ? `\nRETURNING CUSTOMER - Previous orders:\n${previousOrdersText}\n- Greet them warmly and mention their last purchase.\n- If you reference their previous product, ALWAYS ask: "Would you like to order the same again, or shop for something new?"\n` : ""}
ALREADY COLLECTED FOR CURRENT PRODUCT (DO NOT ASK AGAIN):
${hasOrderSize ? `Size already selected: ${session.order_size}` : "Size: not yet collected"}
${hasOrderColor ? `Color already selected: ${session.order_color}` : "Color: not yet collected"}
!! CRITICAL: If size is marked collected, NEVER ask for size again. If color is marked collected, NEVER ask for color again. Ask only for what is still not collected, then move to order confirmation. !!

CONVERSATION MEMORY (what has been discussed so far):
${memorySummary || "(Start of conversation)"}

CURRENT QUERY CONTEXT:
${formattedContext}${session.last_product_name ? `\nLast product in context: ${session.last_product_name}` : ""}

PAYMENT RULES:
- Accepted payment methods: UPI and Credit/Debit Card.
- If user asks how to pay online, say: "You can pay via UPI or Credit/Debit card"
- When context type is INTERACTIVE_PAYMENT: confirm the order and say the payment QR code has been sent. Do NOT ask about payment methods.
- If user says "I have paid" or "paid": reply with a warm confirmation and end - "Payment confirmed! Your order is placed. Thank you for shopping with us!"

RULES:
- NEVER mention the Customer ID unless this is an active order/transaction.
- NEVER use placeholders like [product_name] or [size].
- If the user says "yes", "ok", "sure" - they are confirming or continuing the current product topic (${session.last_product_name || "last discussed product"}). Ask only for uncollected details, then confirm the order.
- If the user says "it", "that", "the one", resolve it using the last product in context above.
- Do NOT ask for anything already collected.
- If the user says "no", "not interested", "nope", or "nahi", stop suggesting that product. Acknowledge and offer other help.
${isSmallTalk ? "- During small talk: AVOID non-shopping small talk. Always steer the conversation back to shopping and our products." : "- Do NOT be pushy or repeat the same recommendation more than once."}`;

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        model: "llama-3.3-70b-versatile",
        max_tokens: 200,
      });

      return maybeAddRandomEmoji(
        chatCompletion.choices[0].message.content,
        responseData,
        config,
      );
    } catch (error) {
      console.error("Groq Generation Error:", error);
      return maybeAddRandomEmoji(
        this.mockGroqGeneration(responseData, config),
        responseData,
        config,
      );
    }
  }

  static mockGroqGeneration(responseData, config) {
    const safeResponseData = responseData || {};
    const safeConfig = config || {};
    const { type, data, message } = safeResponseData;
    const businessName = safeConfig.business_name || "our store";

    if (type === "PRODUCT_QUERY" && data) {
      return `The ${data.name} is available for ${safeConfig.currency || "INR"} ${data.price}. It's made of ${data.material}. Would you like to know about available sizes?`;
    }
    if (type === "FAQ_QUERY" && data) {
      return data.answer;
    }
    if (type === "CONFIRMATION_REQUIRED") {
      return message;
    }
    if (type === "TRANSACTION_SUCCESS") {
      return `Done! ${message}`;
    }
    if (type === "SMALL_TALK") {
      return `Hello from ${businessName}! How can I help you today?`;
    }

    return message || "I'm here to help! What's on your mind?";
  }
}

module.exports = ResponseGenerator;
