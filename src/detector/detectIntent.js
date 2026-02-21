const intents = require("../config/intents.json");

function detectIntent(message) {
  let bestMatch = {
    intent: "UNKNOWN",
    language: "unknown",
    confidence: "LOW",
    score: 0,
    matched_by: "NONE",
  };

  for (const intent of intents) {
    for (const pattern of intent.patterns) {
      const regex = new RegExp(pattern.regex, "i");

      if (regex.test(message)) {
        const score = pattern.regex.length; // specificity proxy

        if (score > bestMatch.score) {
          bestMatch = {
            intent: intent.name,
            language: pattern.lang,
            confidence: score > 25 ? "HIGH" : "MEDIUM",
            score,
            matched_by: "REGEX",
          };
        }
      }
    }
  }

  return bestMatch;
}

module.exports = detectIntent;
