const handleWhatsAppMessage = require('../src/index');

describe('Integration Tests', () => {
    test('testFlows', async () => {
        console.log("Running Integration Tests...");

        const user = "test_user_001";

        // Test 1: Greeting & Continuity
        console.log("Test 1: Greeting");
        const r1 = await handleWhatsAppMessage(user, "Hello");
        expect(r1.text).toBeTruthy();

        // Test 2: Product Query & Context
        console.log("Test 2: Product Context");
        await handleWhatsAppMessage(user, "Tell me about the hoodie");
        const r2 = await handleWhatsAppMessage(user, "Is it cotton?");
        expect(r2.text.toLowerCase()).toContain('cotton');

        // Test 3: Guardrails
        console.log("Test 3: Transactional Guardrails");
        const r3 = await handleWhatsAppMessage(user, "I want to cancel my order");
        expect(r3.text.toLowerCase()).toContain("cancel");

        // Test 4: Confirmation
        console.log("Test 4: Confirmation execution");
        const r4 = await handleWhatsAppMessage(user, "Yes");
        expect(r4.text).toBeTruthy();

        console.log("Integration Tests Completed Successfully!");
    });
});
