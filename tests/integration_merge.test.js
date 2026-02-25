const handleWhatsAppMessage = require('../src/index');
const fs = require('fs');
const path = require('path');

async function testMergedLogic() {
    console.log("🚀 Running Merged Integration Tests (Teammate Merge)...");

    const user = "919876543210"; // Advika, has 1500 due
    const tenantId = "urbanwear";

    // Test 1: Hindi Regex Check (Teammate's logic)
    console.log("\nTest 1: Hindi Regex Detection");
    // "mera order kaha hai" is in intents_config.json
    const r1 = await handleWhatsAppMessage(user, "mera order kaha hai");
    console.log(`Bot Response: ${r1}`);
    // Should trigger FAQ/Order status and notice the dues proactively

    // Test 2: VIP Tagging Logic
    console.log("\nTest 2: VIP Promotion Logic");
    // User already has 2 orders in sample data.
    // Triggering a successful order should promote them
    // Simulation: We assume checking a product and saying yes is an order for this prototype
    // (In our engine, TransactionEngine handles the 'SUCCESS' type)

    // We can directly call the router logic or simulate through index
    // For now, let's verify the customerService directly as it's the core of the merge
    const CustomerService = require('../src/customerService');
    CustomerService.updateOrderStats(tenantId, user); // 3rd order
    const updated = CustomerService.getOrCreateCustomer(tenantId, user);
    if (updated.tags.includes('vip')) {
        console.log("✅ VIP Promotion Successful!");
    } else {
        console.error("❌ VIP Promotion Failed!");
    }

    console.log("\nMerged Tests Completed!");
}

testMergedLogic().catch(console.error);
