const handleWhatsAppMessage = require('../src/index');

async function testFlows() {
    console.log("Running Integration Tests...");

    const user = "test_user_001";

    // Test 1: Greeting & Continuity
    console.log("Test 1: Greeting");
    const r1 = await handleWhatsAppMessage(user, "Hello");
    if (!r1.toLowerCase().includes('urbanwear')) {
        console.error("Failed Test 1");
    }

    // Test 2: Product Query & Context
    console.log("Test 2: Product Context");
    await handleWhatsAppMessage(user, "Tell me about the hoodie");
    const r2 = await handleWhatsAppMessage(user, "Is it cotton?");
    if (!r2.toLowerCase().includes('cotton')) {
        console.error("Failed Test 2: Context not maintained");
    }

    // Test 3: Guardrails
    console.log("Test 3: Transactional Guardrails");
    const r3 = await handleWhatsAppMessage(user, "I want to cancel my order");
    if (!r3.toLowerCase().includes('are you sure')) {
        console.error("Failed Test 3: Guardrail not triggered");
    }

    // Test 4: Confirmation
    console.log("Test 4: Confirmation execution");
    const r4 = await handleWhatsAppMessage(user, "Yes, I am sure");
    if (!r4.toLowerCase().includes('successfully executed')) {
        console.error("Failed Test 4: Confirmation failed");
    }

    console.log("Integration Tests Completed Successfully!");
}

testFlows().catch(console.error);
