const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function simulateWebhook() {
    console.log("🧪 Simulating WhatsApp Webhook...");
    const payloadPath = path.join(__dirname, '..', 'mock_payload.json');

    if (!fs.existsSync(payloadPath)) {
        console.error("❌ Error: mock_payload.json not found!");
        return;
    }

    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

    try {
        console.log("📡 Sending POST to http://localhost:5000/webhook...");
        const response = await axios.post('http://localhost:5000/webhook', payload);
        console.log("✅ Server Response Status:", response.status);
        console.log("✅ Server Response Body:", response.data);
        console.log("\nCheck your terminal for the AI processing logs!");
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error("❌ Error: Server not running! Please run 'npm run serve' first.");
        } else {
            console.error("❌ Error:", error.message);
        }
    }
}

simulateWebhook();
