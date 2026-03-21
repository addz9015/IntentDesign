const detectIntent = require("../src/detector/detectIntent");

describe("Intent Detection – Regex Based", () => {
  test("Hindi ORDER_STATUS intent", () => {
    const result = detectIntent("mera order kaha hai");
    expect(result.intent).toBe("ORDER_STATUS");
    expect(result.language).toBe("hi");
  });

  test("English ORDER_STATUS intent", () => {
    const result = detectIntent("where is my order");
    expect(result.intent).toBe("ORDER_STATUS");
    expect(result.language).toBe("en");
  });

  test("Hindi ORDER_NEW intent", () => {
    const result = detectIntent("mujhe order chahiye");
    expect(result.intent).toBe("ORDER_NEW");
    expect(result.language).toBe("hi");
  });

  test("English ORDER_NEW intent", () => {
    const result = detectIntent("I want to place an order");
    expect(result.intent).toBe("ORDER_NEW");
    expect(result.language).toBe("en");
  });

  test("Hindi PAYMENT intent", () => {
    const result = detectIntent("payment ho gaya");
    expect(result.intent).toBe("PAYMENT");
    expect(result.language).toBe("hi");
  });

  test("English CANCEL_ORDER intent", () => {
    const result = detectIntent("cancel my order");
    expect(result.intent).toBe("CANCEL_ORDER");
    expect(result.language).toBe("en");
  });

  test("UNKNOWN intent fallback", () => {
    const result = detectIntent("asdfghjkl");
    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBe("LOW");
  });
});
