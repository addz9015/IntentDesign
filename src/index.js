const normalizeText = require("./normalizer/normalizeText");
const detectIntent = require("./detector/detectIntent");

function processMessage(message) {
  const clean = normalizeText(message);
  return detectIntent(clean);
}

// Manual test cases
const messages = [
  "mera order kaha hai",
  "where is my order",
  "mujhe order chahiye",
  "I want to place an order",
  "payment ho gaya",
  "cancel my order",
  "asdfghj",
];

messages.forEach((msg) => {
  console.log(msg, "=>", processMessage(msg));
});

module.exports = processMessage;
