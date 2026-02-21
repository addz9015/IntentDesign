function normalizeText(text = "") {
  return text
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "") // remove emojis
    .replace(/[^\w\s]/g, "") // remove punctuation
    .replace(/\s+/g, " ") // remove extra spaces
    .trim();
}

module.exports = normalizeText;
