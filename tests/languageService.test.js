const LanguageService = require("../src/languageService");

describe("LanguageService explicit language switching", () => {
  test("detects explicit Hindi switch request", () => {
    const result = LanguageService.detectExplicitLanguageSwitch(
      "hindi mai baat kijiye",
    );

    expect(result).toBeTruthy();
    expect(result.code).toBe("hi");
    expect(result.source).toBe("explicit_switch");
  });

  test("detects explicit English switch request", () => {
    const result = LanguageService.detectExplicitLanguageSwitch(
      "please speak in english",
    );

    expect(result).toBeTruthy();
    expect(result.code).toBe("en");
  });

  test("does not treat product-only English text as language switch", () => {
    const result = LanguageService.detectExplicitLanguageSwitch("Jacket");
    expect(result).toBeNull();
  });

  test("carries session language for ambiguous short reply", () => {
    const result = LanguageService.detectUserLanguage("ok", {
      user_language: "hi",
    });

    expect(result.code).toBe("hi");
    expect(result.source).toBe("session_carry");
  });

  test("auto-switches to English on clear English sentence", () => {
    const detected = LanguageService.detectUserLanguage(
      "Can you tell me the return policy",
      { user_language: "hi" },
    );

    const shouldSwitch = LanguageService.shouldAutoSwitchReplyLanguage(
      "Can you tell me the return policy",
      detected,
      "hi",
    );

    expect(shouldSwitch).toBe(true);
  });

  test("does not auto-switch on single English product word", () => {
    const detected = LanguageService.detectUserLanguage("Jacket", {
      user_language: "hi",
    });

    const shouldSwitch = LanguageService.shouldAutoSwitchReplyLanguage(
      "Jacket",
      detected,
      "hi",
    );

    expect(shouldSwitch).toBe(false);
  });

  test("auto-switches to Hinglish on Roman Hindi sentence", () => {
    const message = "Navy blue hai aapke paas kitne mai";
    const detected = LanguageService.detectUserLanguage(message, {
      user_language: "en",
    });

    const shouldSwitch = LanguageService.shouldAutoSwitchReplyLanguage(
      message,
      detected,
      "en",
    );

    expect(detected.code).toBe("hinglish");
    expect(shouldSwitch).toBe(true);
  });

  test("auto-switches to Hinglish on typo-heavy Roman Hindi", () => {
    const message = "muje uska prixe janana hai";
    const detected = LanguageService.detectUserLanguage(message, {
      user_language: "en",
    });

    const shouldSwitch = LanguageService.shouldAutoSwitchReplyLanguage(
      message,
      detected,
      "en",
    );

    expect(detected.code).toBe("hinglish");
    expect(shouldSwitch).toBe(true);
  });
});
