/**
 * Computes the Jaccard Similarity between two sets of words.
 * This is much more robust than character-based similarity for short sentences.
 */
function getWordJaccardSimilarity(str1, str2) {
    const s1 = str1.toLowerCase().trim().split(/\s+/);
    const s2 = str2.toLowerCase().trim().split(/\s+/);

    const set1 = new Set(s1);
    const set2 = new Set(s2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
}

/**
 * Checks if a message matches any intent patterns via word-based fuzzy matching.
 */
function fuzzyMatchIntents(message, intents, threshold = 0.3) {
    const results = [];
    const msgWords = message.toLowerCase().trim().split(/\s+/);

    intents.forEach(intent => {
        let bestScore = 0;

        // Match against humanName as a proxy for the domain
        const score = getWordJaccardSimilarity(message, intent.humanName);

        // Also check if any high-value keywords are present
        const keywordMatch = (intent.humanName.toLowerCase().split(/\s+/)).some(word =>
            word.length > 3 && msgWords.includes(word)
        );

        const finalScore = keywordMatch ? Math.max(score, 0.4) : score;

        if (finalScore >= threshold) {
            results.push({
                intent: intent.name,
                humanName: intent.humanName,
                score: finalScore,
                matched_by: "FUZZY"
            });
        }
    });

    return results.sort((a, b) => b.score - a.score);
}

module.exports = { getWordJaccardSimilarity, fuzzyMatchIntents };
