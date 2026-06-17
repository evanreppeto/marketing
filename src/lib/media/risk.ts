const RISK_RULES: Array<{ test: RegExp; flag: string }> = [
  { test: /\b(before|after|proof|result|results|guarantee|guaranteed|claim|approved|payout)\b/i, flag: "claim risk" },
  { test: /\b(address|name|face|person|people|family|homeowner|customer|client)\b/i, flag: "privacy/redaction" },
  { test: /\b(text|headline|logo|caption|words?|copy|sign|slogan)\b/i, flag: "embedded text" },
  { test: /\b(damage|flood|flooded|fire|mold|sewage|disaster|destroyed|wreckage)\b/i, flag: "unrealistic scene" },
];

/**
 * Heuristic risk-flag pass for an AI image prompt (v1). Surfaces likely review
 * concerns so the operator scrutinizes them before approving. Order-stable, deduped.
 */
export function deriveImageRiskFlags(prompt: string): string[] {
  const flags: string[] = [];
  for (const rule of RISK_RULES) {
    if (rule.test.test(prompt) && !flags.includes(rule.flag)) flags.push(rule.flag);
  }
  return flags;
}
