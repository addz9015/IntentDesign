const replies = require("../config/replies.json");

/**
 * Picks a random response based on the intent.
 * @param {string} intent - The detected intent name.
 * @returns {string} A random reply string.
 */
function getReply(intent) {
    const templates = replies[intent];

    if (templates && templates.length > 0) {
        return templates[Math.floor(Math.random() * templates.length)];
    }

    // Fallback if no specific templates found for this intent
    const fallbackTemplates = replies["UNKNOWN"];
    return fallbackTemplates[Math.floor(Math.random() * fallbackTemplates.length)];
}

module.exports = { getReply };
