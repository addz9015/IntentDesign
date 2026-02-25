const intents = require('../config/intents.json');

function lintRegex() {
    console.log("Starting Regex Governance Linting...");
    console.log("------------------------------------");

    const issues = [];
    const allRegex = [];

    intents.forEach(intent => {
        intent.patterns.forEach(pattern => {
            allRegex.push({
                intent: intent.name,
                priority: intent.priority,
                regex: pattern.regex,
                lang: pattern.lang
            });
        });
    });

    // 1. Check for Duplicate Regex
    const seenRegex = new Set();
    allRegex.forEach(item => {
        if (seenRegex.has(item.regex)) {
            issues.push(`[DUPLICATE] Regex "${item.regex}" found multiple times.`);
        }
        seenRegex.add(item.regex);
    });

    // 2. Overlap Detection (Simple Subset Check)
    // This is a complex problem, but we can check if one regex is literally 
    // contained within another or if they are identical but in different intents.
    for (let i = 0; i < allRegex.length; i++) {
        for (let j = i + 1; j < allRegex.length; j++) {
            const a = allRegex[i];
            const b = allRegex[j];

            if (a.regex === b.regex && a.intent !== b.intent) {
                issues.push(`[CONFLICT] Intent "${a.intent}" and "${b.intent}" share identical regex: "${a.regex}"`);
            }
        }
    }

    if (issues.length === 0) {
        console.log("✅ No obvious regex conflicts detected.");
    } else {
        console.log(`❌ Found ${issues.length} potential issues:`);
        issues.forEach(msg => console.log(` - ${msg}`));
    }
}

if (require.main === module) {
    lintRegex();
}

module.exports = { lintRegex };
