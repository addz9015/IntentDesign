const intents = require("../config/intents.json");
const { logUnknownIntent } = require("../utils/unknownlogger");
const { fuzzyMatchIntents } = require("../utils/fuzzyMatch");

/**
 * Detects intent from a message with context support and fallbacks.
 * @param {string} message - User input
 * @param {Object} context - Optional context (e.g., { active_labels: ['order_related'] })
 */
function detectIntent(message, context = {}) {
  let bestMatch = {
    intent: "UNKNOWN",
    humanName: "Unknown",
    language: "unknown",
    confidence: "LOW",
    score: 0,
    priority: 999,
    matched_by: "NONE",
    suggestions: []
  };

  const matches = [];

  for (const intent of intents) {
    let priority = intent.priority || 5;

    // Context Boost: If context matches intent's boost labels, improve priority
    if (context.active_labels && intent.context_boost) {
      const hasOverlap = intent.context_boost.some(label => context.active_labels.includes(label));
      if (hasOverlap) {
        priority = Math.max(1, priority - 1); // Boost priority by 1 (shifter to lower number)
      }
    }

    // Layer 1: REGEX
    for (const pattern of intent.patterns) {
      const regex = new RegExp(pattern.regex, "i");

      if (regex.test(message)) {
        const score = pattern.regex.length;
        matches.push({
          intent: intent.name,
          humanName: intent.humanName,
          language: pattern.lang,
          score,
          priority,
          matched_by: "REGEX"
        });
      }
    }
  }

  // Layer 2: FUZZY (Only if no REGEX matches)
  if (matches.length === 0) {
    const fuzzyMatches = fuzzyMatchIntents(message, intents, 0.5);
    fuzzyMatches.forEach(fm => {
      matches.push({
        ...fm,
        priority: 5, // Fuzzy usually has lower priority
        language: "en" // Default to en for fuzzy
      });
    });
  }

  // Sort matches: Priority first, then Score
  matches.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.score - a.score;
  });

  if (matches.length > 0) {
    const top = matches[0];
    bestMatch = {
      ...top,
      confidence: top.matched_by === "REGEX" ? (top.score > 25 ? "HIGH" : "MEDIUM") : "LOW",
      suggestions: matches.slice(1, 4).map(m => m.humanName)
    };
  }

  // Fallback Logic: If no match or low confidence, provide top generic suggestions
  if (bestMatch.intent === "UNKNOWN") {
    logUnknownIntent(message, { confidence: bestMatch.confidence });
    bestMatch.suggestions = intents.slice(0, 3).map(i => i.humanName);
  }

  return bestMatch;
}

module.exports = detectIntent;
