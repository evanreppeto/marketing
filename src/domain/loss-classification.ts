export const TARGET_LOSS_KEYWORDS = [
  "flood",
  "flooding",
  "standing water",
  "water backup",
  "storm surge",
  "burst pipe",
] as const;

export const NON_TARGET_LOSS_KEYWORDS = [
  "hail",
  "hail damage",
  "wind-only roof loss",
] as const;

export type TargetLossKeyword = (typeof TARGET_LOSS_KEYWORDS)[number];
export type NonTargetLossKeyword = (typeof NON_TARGET_LOSS_KEYWORDS)[number];

export type LossTargetClassification =
  | "target_water_loss"
  | "non_target_hail_or_wind_only"
  | "unknown";

export type LossRoutingRecommendation =
  | "elevate"
  | "standard_review"
  | "archive_low_priority";

export type LossClassificationResult = {
  classification: LossTargetClassification;
  routingRecommendation: LossRoutingRecommendation;
  matchedTargetKeywords: TargetLossKeyword[];
  matchedNonTargetKeywords: NonTargetLossKeyword[];
  normalizedSignals: string[];
};

export type LossSignalInput = string | readonly string[];

export function classifyLossSignals(
  input: LossSignalInput,
): LossClassificationResult {
  const normalizedSignals = normalizeSignals(input);
  const haystack = normalizedSignals.join(" ");
  const matchedTargetKeywords = findMatches(haystack, TARGET_LOSS_KEYWORDS);
  const matchedNonTargetKeywords = findMatches(haystack, NON_TARGET_LOSS_KEYWORDS);

  if (matchedTargetKeywords.length > 0) {
    return {
      classification: "target_water_loss",
      routingRecommendation: "elevate",
      matchedTargetKeywords,
      matchedNonTargetKeywords,
      normalizedSignals,
    };
  }

  if (matchedNonTargetKeywords.length > 0) {
    return {
      classification: "non_target_hail_or_wind_only",
      routingRecommendation: "archive_low_priority",
      matchedTargetKeywords,
      matchedNonTargetKeywords,
      normalizedSignals,
    };
  }

  return {
    classification: "unknown",
    routingRecommendation: "standard_review",
    matchedTargetKeywords,
    matchedNonTargetKeywords,
    normalizedSignals,
  };
}

function normalizeSignals(input: LossSignalInput): string[] {
  const signals = Array.isArray(input) ? input : [input];

  return signals
    .map((signal) => signal.trim().toLowerCase())
    .filter(Boolean);
}

function findMatches<const TKeyword extends string>(
  haystack: string,
  keywords: readonly TKeyword[],
): TKeyword[] {
  return keywords.filter((keyword) => containsKeyword(haystack, keyword));
}

function containsKeyword(haystack: string, keyword: string): boolean {
  const escapedKeyword = keyword
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const keywordPattern = new RegExp(`(^|[^a-z0-9])${escapedKeyword}([^a-z0-9]|$)`);

  return keywordPattern.test(haystack);
}
