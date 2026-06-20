const LanguageService = require("./languageService");

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
  ALTERNATIVE_PRODUCTS: ["🛍️", "✨", "👍"],
  NEGOTIATION_OFFER: ["✅", "💬", "💸"],
  REMINDER_SET: ["🕒", "⏰"],
  REMINDER_INFO: ["⏰", "🔔", "🙂"],
  REMINDER_NEGOTIATION: ["🙏", "✅", "💬"],
  RETURN_POLICY: ["↩️", "📦", "ℹ️"],
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
    case "ALTERNATIVE_PRODUCTS":
      if (products && products.length > 0) {
        const productNames = products.map((p) => p.name).slice(0, 5).join(", ");
        return `User asked for other products. Suggest 2-3 options from: ${productNames}. Do NOT keep pushing the previously discussed product.`;
      }
      return "User asked for other products. Suggest a few alternatives and ask preference.";
    case "NEGOTIATION_OFFER":
      if (data) {
        return `User is negotiating for ${data.name}. Original price: ${data.original_price}. Best offer price: ${data.offered_price}. Share this offer briefly and ask if they want to place order.`;
      }
      return "User is negotiating price. Share best offer and ask for confirmation.";
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
    return 0;
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
      const promptLanguage = resolvePromptLanguage(
        userMessage,
        session,
        options,
      );
      const languageRule = buildLanguageRule(promptLanguage);
      const reviewLink = config?.review_link ? ` Please share your review here: ${config.review_link}` : "";
      const productName = responseData?.data?.name || session.last_product_name || "the product";
      const productPrice = responseData?.data?.price;
      const originalPrice = responseData?.data?.original_price;
      const offerPrice = responseData?.data?.offered_price;
      const productSizes = Array.isArray(responseData?.data?.sizes) ? responseData.data.sizes.filter(Boolean).join(", ") : "";
      const productColors = Array.isArray(responseData?.data?.colors) ? responseData.data.colors.filter(Boolean).join(", ") : "";
      const formattedContext = formatContext(responseData);

      let reply = "";

      switch (responseData?.type) {
        case "PRODUCT_QUERY":
          if (responseData?.data) {
            const details = [
              `${productName} is available for ${config.currency || "INR"} ${productPrice}`,
              responseData.data.material ? `Material: ${responseData.data.material}` : null,
              productSizes ? `Sizes: ${productSizes}` : null,
              productColors ? `Colors: ${productColors}` : null,
            ].filter(Boolean).join('. ');
            reply = `${details}. Are you also interested in buying?`;
          } else if (responseData?.message) {
            reply = `${responseData.message} Are you also interested in buying?`;
          } else {
            reply = "Which product are you interested in? Are you also interested in buying?";
          }
          break;
        case "FAQ_QUERY":
          reply = responseData?.data?.answer || responseData?.message || "I can help with product details, orders, payments, and reminders.";
          break;
        case "TRANSACTION_SUCCESS":
          reply = `${responseData?.message || "Done."}${reviewLink}`;
          break;
        case "TRANSACTION_CANCELLED":
          reply = responseData?.message || "Okay, I have cancelled that request.";
          break;
        case "CONFIRMATION_REQUIRED":
          reply = responseData?.message || "Should I go ahead and place the order?";
          break;
        case "INTERACTIVE_PAYMENT":
          reply = `${responseData?.message || "The payment QR code has been sent."}${reviewLink}`;
          break;
        case "NEGOTIATION_OFFER": {
          const finalOffer = offerPrice || productPrice;
          const lead = session.negotiation_attempts >= 2
            ? "This is our best price."
            : "I can offer";
          reply = `${lead} ${productName} for ${config.currency || "INR"} ${finalOffer}. Are you also interested in buying at this price?`;
          break;
        }
        case "ALTERNATIVE_PRODUCTS":
          reply = responseData?.message || "I can suggest other products if you want.";
          break;
        case "BROWSING_DECLINED":
          reply = responseData?.message || "I can help only with products, orders, payments, and reminders.";
          break;
        case "SMALL_TALK":
          reply = "I can help with products, prices, orders, payments, and reminders. Which product are you looking for?";
          break;
        case "REMINDER_SET":
          reply = `${responseData?.message || "Okay, I have set the reminder."} I can also help you with products, prices, orders, payments, and reviews.`;
          break;
        case "REMINDER_INFO":
          reply = responseData?.message || "I can set reminders and nudge you about pending payments.";
          break;
        case "REMINDER_NEGOTIATION":
          // Message is already a complete, tone-appropriate WhatsApp reply.
          reply = responseData?.message || "Thanks for your message. Let me know how you'd like to proceed.";
          break;
        case "RETURN_POLICY":
          reply = responseData?.message || "I can help with returns and refunds. Could you tell me which product?";
          break;
        case "FALLBACK":
        default:
          reply = responseData?.message || "I can help with products, prices, orders, payments, and reminders. Which product are you looking for?";
          break;
      }

      if (responseData?.type === "PRODUCT_QUERY" && responseData?.data && session.last_product_name) {
        const followUp = session.pending_action ? "" : "";
        reply = reply + followUp;
      }

      if (responseData?.type === "REMINDER_SET" && responseData?.follow_up) {
        reply = `${reply} ${responseData.follow_up}`.trim();
      }

      if (!reply) {
        reply = formattedContext || "I can help with products, prices, orders, payments, and reminders.";
      }

      return maybeAddRandomEmoji(reply, responseData, config);
    } catch (error) {
      console.error("Groq Generation Error:", error);
      return maybeAddRandomEmoji(this.mockGroqGeneration(responseData, config), responseData, config);
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
      return `I can help with products, prices, orders, payments, and reminders. Which product are you looking for?`;
    }
    if (type === "REMINDER_SET") {
      return message || "Okay, I have set the reminder.";
    }

    return message || "I can help with products, prices, orders, payments, and reminders. Which product are you looking for?";
  }
}

module.exports = ResponseGenerator;
