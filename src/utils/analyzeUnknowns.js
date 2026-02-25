const fs = require('fs');
const path = require('path');
const intents = require('../config/intents.json');
const { fuzzyMatchIntents } = require('./fuzzyMatch');

const LOG_FILE = path.join(__dirname, '../../logs/unknown_intents.jsonl');

function analyzeUnknowns() {
    if (!fs.existsSync(LOG_FILE)) {
        console.log("No unknown intents logged yet.");
        return;
    }

    const data = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    const frequencyMap = {};

    data.forEach(line => {
        try {
            const entry = JSON.parse(line);
            const msg = entry.message.toLowerCase().trim();
            frequencyMap[msg] = (frequencyMap[msg] || 0) + 1;
        } catch (e) {
            // Skip invalid lines
        }
    });

    const sortedByFreq = Object.entries(frequencyMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    console.log("\n🚀 Smart Feedback Loop: Top 10 Unknowns");
    console.log("=========================================");

    sortedByFreq.forEach(([msg, count]) => {
        console.log(`\nMessage: "${msg}" (${count} occurrences)`);

        // Find closest existing intents
        const suggestions = fuzzyMatchIntents(msg, intents, 0.2);

        if (suggestions.length > 0) {
            const best = suggestions[0];
            console.log(`💡 Recommendation: Add to "${best.humanName}"`);
            console.log(`✅ Quick Fix: Add regex "\\b${msg}\\b" to ${best.intent}`);
        } else {
            console.log("⚠️ Recommendation: Create a brand new intent for this.");
        }
    });
    console.log("\n-----------------------------------------");
}

if (require.main === module) {
    analyzeUnknowns();
}

module.exports = { analyzeUnknowns };
