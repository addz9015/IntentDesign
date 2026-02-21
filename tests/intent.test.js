const processMessage = require("../src/index");

describe("Intent Detection – Regex Based", () => {
  test("Hindi ORDER_STATUS intent", () => {
    const result = processMessage("mera order kaha hai");
    expect(result.intent).toBe("ORDER_STATUS");
    expect(result.language).toBe("hi");
  });

  test("English ORDER_STATUS intent", () => {
    const result = processMessage("where is my order");
    expect(result.intent).toBe("ORDER_STATUS");
    expect(result.language).toBe("en");
  });

  test("Hindi ORDER_NEW intent", () => {
    const result = processMessage("mujhe order chahiye");
    expect(result.intent).toBe("ORDER_NEW");
    expect(result.language).toBe("hi");
  });

  test("English ORDER_NEW intent", () => {
    const result = processMessage("I want to place an order");
    expect(result.intent).toBe("ORDER_NEW");
    expect(result.language).toBe("en");
  });

  test("Hindi PAYMENT intent", () => {
    const result = processMessage("payment ho gaya");
    expect(result.intent).toBe("PAYMENT");
    expect(result.language).toBe("hi");
  });

  test("English CANCEL_ORDER intent", () => {
    const result = processMessage("cancel my order");
    expect(result.intent).toBe("CANCEL_ORDER");
    expect(result.language).toBe("en");
  });

  test("UNKNOWN intent fallback", () => {
    const result = processMessage("asdfghjkl");
    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBe("LOW");
  });
});
