require('dotenv').config();
const readline = require('readline');
const handleWhatsAppMessage = require('./index');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You: '
});

const DEMO_USER = "cli_user_123";

console.log("--------------------------------------------");
console.log("🚀 Antigravity AI - Interactive Mode");
console.log("--------------------------------------------");
console.log("Type your message to chat with the AI.");
console.log("Commands: 'exit' to quit, 'clear' to reset session.");
console.log("--------------------------------------------");

rl.prompt();

rl.on('line', async (line) => {
    const input = line.trim();

    if (input.toLowerCase() === 'exit') {
        rl.close();
        return;
    }

    if (input.toLowerCase() === 'clear') {
        console.log("✨ Session cleared.");
        // Note: In this simple prototype, clearing session is just resetting the DEMO_USER key
        // but for now we just acknowledge it.
        rl.prompt();
        return;
    }

    if (!input) {
        rl.prompt();
        return;
    }

    try {
        const response = await handleWhatsAppMessage(DEMO_USER, input);
        console.log(`Bot: ${response}`);
    } catch (error) {
        console.log(`Bot: Sorry, I hit an error. check your console/logs.`);
    }

    rl.prompt();
}).on('close', () => {
    console.log('\nGoodbye! 👋');
    process.exit(0);
});
