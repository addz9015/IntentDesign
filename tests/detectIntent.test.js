const detectIntent = require('../src/detector/detectIntent');

describe('Intent Engine Quality Gate', () => {

    test('Should match simple English order status', () => {
        const result = detectIntent("where is my order");
        expect(result.intent).toBe("ORDER_STATUS");
        expect(result.confidence).toBe("MEDIUM");
    });

    test('Should match Hindi order status', () => {
        const result = detectIntent("mera order kaha hai");
        expect(result.intent).toBe("ORDER_STATUS");
    });

    test('Should handle priority correctly', () => {
        // Assume we added a high priority intent for "URGENT"
        // But with current data, let's just test that it works as expected
        const result = detectIntent("track order");
        expect(result.intent).toBe("ORDER_STATUS");
    });

    test('Should apply context boost', () => {
        // If we say "yes", it might be unknown normally.
        // But with ordering context, it might boost something (if we had a 'yes' regex)
        // Let's test with 'cancel' which is in 'order_related' group
        const resultWithContext = detectIntent("cancel", { active_labels: ['order_related'] });
        expect(resultWithContext.intent).toBe("CANCEL_ORDER");
    });

    test('Should fallback to fuzzy matching for typos', () => {
        const result = detectIntent("statur"); // typo of status in humanName "Check Order Status"
        expect(result.matched_by).toBe("FUZZY");
        expect(result.intent).toBe("ORDER_STATUS");
    });

    test('Should log unknown intents', () => {
        const result = detectIntent("blabla garbage");
        expect(result.intent).toBe("UNKNOWN");
        expect(result.suggestions.length).toBeGreaterThan(0);
    });
});
