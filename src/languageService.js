const axios = require("axios");

const LANGUAGE_NAMES = {
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

const SCRIPT_LANGUAGE_RULES = [
  { code: "bn", regex: /[\u0980-\u09FF]/ },
  { code: "pa", regex: /[\u0A00-\u0A7F]/ },
  { code: "gu", regex: /[\u0A80-\u0AFF]/ },
  { code: "or", regex: /[\u0B00-\u0B7F]/ },
  { code: "ta", regex: /[\u0B80-\u0BFF]/ },
  { code: "te", regex: /[\u0C00-\u0C7F]/ },
  { code: "kn", regex: /[\u0C80-\u0CFF]/ },
  { code: "ml", regex: /[\u0D00-\u0D7F]/ },
  { code: "hi", regex: /[\u0900-\u097F]/ },
];

const AI4BHARAT_LANG_CODES = {
  en: "eng_Latn",
  hi: "hin_Deva",
  bn: "ben_Beng",
  pa: "pan_Guru",
  gu: "guj_Gujr",
  or: "ory_Orya",
  ta: "tam_Taml",
  te: "tel_Telu",
  kn: "kan_Knda",
  ml: "mal_Mlym",
  mr: "mar_Deva",
};

const HINGLISH_MARKERS = new Set([
  "mujhe",
  "mera",
  "meri",
  "kya",
  "kaise",
  "kab",
  "kahan",
  "nahi",
  "haan",
  "acha",
  "accha",
  "chahiye",
  "batao",
  "jaldi",
  "bhai",
  "yaar",
  "kar",
  "karo",
  "krdo",
  "kr",
  "wali",
  "wala",
  "wale",
  "hai",
  "hain",
  "mat",
]);

const AMBIGUOUS_SHORT_REPLIES = new Set([
  "yes",
  "no",
  "ok",
  "okay",
  "sure",
  "haan",
  "ha",
  "nahi",
  "hmm",
  "h",
  "k",
  "theek",
  "thik",
]);

function normalizeLanguageCode(code) {
  if (!code) return "en";
  const value = String(code).trim().toLowerCase();

  if (value === "english") return "en";
  if (value === "hindi") return "hi";
  if (value === "odia") return "or";

  return value;
}

function pickTranslationText(payload) {
  if (!payload) return null;

  if (typeof payload === "string") {
    return payload.trim() || null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const extracted = pickTranslationText(item);
      if (extracted) return extracted;
    }
    return null;
  }

  const candidateFields = [
    "translation",
    "translated_text",
    "translation_text",
    "generated_text",
    "target",
    "text",
    "output",
  ];

  for (const field of candidateFields) {
    const value = payload[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const nestedFields = ["data", "result", "results", "translations"];
  for (const field of nestedFields) {
    const nested = payload[field];
    const extracted = pickTranslationText(nested);
    if (extracted) return extracted;
  }

  return null;
}

class LanguageService {
  static detectUserLanguage(message, session = {}) {
    const text = String(message || "").trim();
    if (!text) {
      return {
        code: normalizeLanguageCode(session.user_language || "en"),
        source: "empty",
        confidence: "LOW",
      };
    }

    for (const rule of SCRIPT_LANGUAGE_RULES) {
      if (rule.regex.test(text)) {
        return {
          code: rule.code,
          source: "script",
          confidence: "HIGH",
        };
      }
    }

    if (this.isLikelyHinglish(text)) {
      return {
        code: "hinglish",
        source: "romanized_hindi",
        confidence: "MEDIUM",
      };
    }

    if (
      this.isAmbiguousShortReply(text) &&
      session.user_language &&
      normalizeLanguageCode(session.user_language) !== "en"
    ) {
      return {
        code: normalizeLanguageCode(session.user_language),
        source: "session_carry",
        confidence: "MEDIUM",
      };
    }

    return {
      code: "en",
      source: "default",
      confidence: "MEDIUM",
    };
  }

  static isLikelyHinglish(message) {
    const text = String(message || "").trim();
    if (!text) return false;
    if (/[^\x00-\x7F]/.test(text)) return false;

    const words = text
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.replace(/[^a-z]/g, ""))
      .filter(Boolean);

    if (words.length === 0) return false;

    let markerHits = 0;
    for (const word of words) {
      if (HINGLISH_MARKERS.has(word)) markerHits += 1;
    }

    return markerHits >= 2 || (markerHits >= 1 && words.length <= 4);
  }

  static isAmbiguousShortReply(message) {
    const words = String(message || "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0 || words.length > 2) return false;
    return words.every((word) => AMBIGUOUS_SHORT_REPLIES.has(word));
  }

  static getLanguageName(languageCode) {
    const normalized = normalizeLanguageCode(languageCode);
    return LANGUAGE_NAMES[normalized] || "English";
  }

  static isTranslationConfigured() {
    return Boolean(
      process.env.AI4BHARAT_API_URL || process.env.HUGGINGFACE_API_KEY,
    );
  }

  static shouldUseAI4Bharat(languageCode) {
    const normalized = normalizeLanguageCode(languageCode);
    return (
      normalized !== "en" &&
      normalized !== "hinglish" &&
      this.isTranslationConfigured()
    );
  }

  static async translateToEnglish(text, sourceCode) {
    const normalizedSource = normalizeLanguageCode(sourceCode);
    if (!text || normalizedSource === "en" || normalizedSource === "hinglish") {
      return text;
    }

    return this.translate(text, normalizedSource, "en");
  }

  static async translateFromEnglish(text, targetCode) {
    const normalizedTarget = normalizeLanguageCode(targetCode);
    if (!text || normalizedTarget === "en" || normalizedTarget === "hinglish") {
      return text;
    }

    return this.translate(text, "en", normalizedTarget);
  }

  static async translate(text, sourceCode, targetCode) {
    const normalizedSource = normalizeLanguageCode(sourceCode);
    const normalizedTarget = normalizeLanguageCode(targetCode);

    if (!text || normalizedSource === normalizedTarget) {
      return text;
    }

    try {
      if (process.env.AI4BHARAT_API_URL) {
        const viaCustomApi = await this.translateViaCustomApi(
          text,
          normalizedSource,
          normalizedTarget,
        );
        if (viaCustomApi) return viaCustomApi;
      }

      if (process.env.HUGGINGFACE_API_KEY) {
        const viaHuggingFace = await this.translateViaHuggingFace(
          text,
          normalizedSource,
          normalizedTarget,
        );
        if (viaHuggingFace) return viaHuggingFace;
      }
    } catch (error) {
      console.warn("Language translation failed:", error.message);
    }

    return null;
  }

  static async translateViaCustomApi(text, sourceCode, targetCode) {
    const endpoint = process.env.AI4BHARAT_API_URL;
    if (!endpoint) return null;

    const headers = { "Content-Type": "application/json" };
    if (process.env.AI4BHARAT_API_KEY) {
      headers.Authorization = `Bearer ${process.env.AI4BHARAT_API_KEY}`;
    }

    const payload = {
      task: "translation",
      text,
      input: text,
      source_language: sourceCode,
      target_language: targetCode,
      sourceLanguage: sourceCode,
      targetLanguage: targetCode,
      source_lang: AI4BHARAT_LANG_CODES[sourceCode] || sourceCode,
      target_lang: AI4BHARAT_LANG_CODES[targetCode] || targetCode,
    };

    const response = await axios.post(endpoint, payload, {
      headers,
      timeout: 10000,
    });

    return pickTranslationText(response.data);
  }

  static async translateViaHuggingFace(text, sourceCode, targetCode) {
    const token = process.env.HUGGINGFACE_API_KEY;
    const sourceLang = AI4BHARAT_LANG_CODES[sourceCode];
    const targetLang = AI4BHARAT_LANG_CODES[targetCode];

    if (!token || !sourceLang || !targetLang) {
      return null;
    }

    const model =
      sourceCode === "en"
        ? process.env.AI4BHARAT_HF_EN_TO_INDIC_MODEL ||
          "ai4bharat/indictrans2-en-indic-1B"
        : process.env.AI4BHARAT_HF_INDIC_TO_EN_MODEL ||
          "ai4bharat/indictrans2-indic-en-1B";

    const endpoint = `https://api-inference.huggingface.co/models/${model}`;
    const payload = {
      inputs: text,
      parameters: {
        src_lang: sourceLang,
        tgt_lang: targetLang,
      },
    };

    const response = await axios.post(endpoint, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 12000,
    });

    return pickTranslationText(response.data);
  }
}

module.exports = LanguageService;
