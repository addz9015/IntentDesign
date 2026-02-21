function getConfidence(matchType) {
  if (matchType === "REGEX") return "HIGH";
  if (matchType === "KEYWORD") return "MEDIUM";
  return "LOW";
}

module.exports = getConfidence;
