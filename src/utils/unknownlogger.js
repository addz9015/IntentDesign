const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../logs/unknown_intents.jsonl');

/**
 * Logs an unknown message for later analysis.
 * @param {string} message - The raw message from the user.
 * @param {Object} metadata - Additional context (confidence, timestamp, etc.)
 */
function logUnknownIntent(message, metadata = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        message: message,
        ...metadata
    };

    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n', 'utf8');
}

module.exports = { logUnknownIntent };
