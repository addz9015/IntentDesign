const { logUnknownIntent } = require('./src/utils/unknownlogger');

const mocks = [
    "I want to tracked my order",
    "kaisa track kare isko",
    "order statuss",
    "how to cancel it",
    "can I pay by cash",
    "what is the daam for this",
    "how to washing product"
];

process.chdir(__dirname);

mocks.forEach(m => {
    logUnknownIntent(m, { test_run: true });
});

console.log("Generated 7 mock unknown logs.");
