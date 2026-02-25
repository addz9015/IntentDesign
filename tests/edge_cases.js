const processMessage = require('../src/index');

const edgeCases = [
    { name: "Pure Emojis", input: "👋😊", expectedIntent: "UNKNOWN" },
    { name: "Punctuation Only", input: "???!!!", expectedIntent: "UNKNOWN" },
    { name: "Extreme Typos", input: "statss", expectedIntent: "ORDER_STATUS" }, // Fuzzy should catch this
    { name: "Empty String", input: "", expectedIntent: "UNKNOWN" },
    { name: "Context Bias", input: "daam", context: { active_labels: ['ordering'] }, expectedIntent: "PRICE_QUERY" },
];

console.log("--- Edge Case Stress Test ---");
edgeCases.forEach(test => {
    const result = processMessage(test.input, test.context || {});
    const passed = result.intent === test.expectedIntent;
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${test.name}: "${test.input}" => ${result.intent} (${result.matched_by})`);
    if (!passed) console.log(`   Expected: ${test.expectedIntent}`);
});
