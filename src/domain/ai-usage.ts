/**
 * AI usage cost model — pure, deterministic, no I/O.
 *
 * Prices are ESTIMATES, maintained here as the single source of truth and stamped
 * with PRICING_VERSION onto each ledger row's metadata so historical rows stay
 * correct after a price change. All figures are cents.
 */

export const PRICING_VERSION = "2026-06-22";

export type AiUsageService = "arc_claude" | "gemini_image" | "gemini_video";

type ModelRate = { inputCentsPerMTok: number; outputCentsPerMTok: number };

/** Per-model token pricing, in cents per 1,000,000 tokens. */
const MODEL_PRICING: Record<string, ModelRate> = {
  "claude-opus-4-8": { inputCentsPerMTok: 1500, outputCentsPerMTok: 7500 },
  "claude-haiku-4-5": { inputCentsPerMTok: 100, outputCentsPerMTok: 500 },
};

/** Per-generation media pricing, in cents per unit. */
const MEDIA_PRICING: Record<Exclude<AiUsageService, "arc_claude">, number> = {
  gemini_image: 4,
  gemini_video: 200,
};

/** Resolve a model's token rate: exact id first, then a known-prefix match. */
export function resolveModelRate(model: string): ModelRate | null {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const [id, rate] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(id)) return rate;
  }
  return null;
}

export function isPricedModel(model: string): boolean {
  return resolveModelRate(model) !== null;
}

/** Estimated cost (cents) of a Claude turn. Unknown model -> 0. */
export function estimateClaudeCostCents(
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number {
  const rate = resolveModelRate(model);
  if (!rate) return 0;
  const inTok = inputTokens ?? 0;
  const outTok = outputTokens ?? 0;
  const cents = (inTok * rate.inputCentsPerMTok + outTok * rate.outputCentsPerMTok) / 1_000_000;
  return Math.round(cents);
}

/** Estimated cost (cents) of N media generations. Missing units -> 1. */
export function estimateMediaCostCents(
  service: Exclude<AiUsageService, "arc_claude">,
  units: number | null | undefined,
): number {
  const count = units ?? 1;
  return MEDIA_PRICING[service] * count;
}
