/**
 * Pure virality/creative scoring + ranking for Arc's ad variants. No I/O.
 *
 * `predicted` scores come from Higgsfield's video-only `virality_predictor`
 * (normalized 0..100 proxies). `proxy` scores are a computed creative-quality
 * signal for still images — Higgsfield has no image-virality model, and a fake
 * virality % on a still would violate augment-never-fabricate. The two are kept
 * structurally distinct so they are never compared or conflated.
 */

export const VIRALITY_DISCLAIMER = "Predictive proxy metrics, not guaranteed performance.";

export type PredictedViralityScore = {
  kind: "predicted";
  viralPotential: number; // 0..100
  hookScore: number; // 0..100, first 0-3s grab
  sustain: number; // 0..100 retention (high = low risk)
  brainEngagement: number; // 0..100
  peakSecond: number;
  dashboardUrl?: string;
  disclaimer: string;
  scoredAt?: string;
};

export type ProxyQualityScore = {
  kind: "proxy";
  qualityScore: number; // 0..100
  factors: string[];
  disclaimer: string;
  scoredAt?: string;
};

export type ViralityScore = PredictedViralityScore | ProxyQualityScore;

/** Raw `analysis.scores` block returned by virality_predictor (loose: fields drift). */
export type RawViralityScores = {
  viral_potential?: number;
  hook_score?: number;
  sustain?: number;
  brain_engagement?: number;
  peak_second?: number;
  [key: string]: unknown;
};

function clamp100(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeViralityPrediction(
  raw: RawViralityScores,
  meta: { dashboardUrl?: string; scoredAt?: string },
): PredictedViralityScore {
  return {
    kind: "predicted",
    viralPotential: clamp100(raw.viral_potential),
    hookScore: clamp100(raw.hook_score),
    sustain: clamp100(raw.sustain),
    brainEngagement: clamp100(raw.brain_engagement),
    peakSecond: Number.isFinite(raw.peak_second) ? (raw.peak_second as number) : 0,
    ...(meta.dashboardUrl ? { dashboardUrl: meta.dashboardUrl } : {}),
    disclaimer: VIRALITY_DISCLAIMER,
    ...(meta.scoredAt ? { scoredAt: meta.scoredAt } : {}),
  };
}

export type CreativeQualityInput = {
  riskFlags: string[];
  formatMatchesChannel: boolean;
  hasBrand: boolean;
  width: number | null;
  height: number | null;
};

/** A deterministic 0..100 creative-quality proxy for still images. Starts at 100
 *  and subtracts for risk flags, format mismatch, missing brand, and low resolution. */
export function creativeQualityScore(input: CreativeQualityInput): ProxyQualityScore {
  let score = 100;
  const factors: string[] = [];

  const flagCount = input.riskFlags.length;
  score -= flagCount * 15;
  factors.push(flagCount === 0 ? "0 risk flags" : `${flagCount} risk flag${flagCount > 1 ? "s" : ""}`);

  if (input.formatMatchesChannel) factors.push("format match");
  else score -= 20;

  if (input.hasBrand) factors.push("brand present");
  else score -= 10;

  const minSide = Math.min(input.width ?? 0, input.height ?? 0);
  if (minSide > 0 && minSide < 720) score -= 15;

  return {
    kind: "proxy",
    qualityScore: clamp100(score),
    factors,
    disclaimer: VIRALITY_DISCLAIMER,
  };
}

export type ScoredVariant = {
  id: string;
  kind: "video" | "image";
  score: ViralityScore;
};

export type RankedVariants = {
  ordered: ScoredVariant[];
  topK: ScoredVariant[];
  rationale: string;
};

function rankValue(score: ViralityScore): number {
  return score.kind === "predicted" ? score.viralPotential : score.qualityScore;
}

const WEAK_HOOK_THRESHOLD = 40;

/** Order variants best-first by their kind-appropriate score and take the top K.
 *  Videos rank by viralPotential, images by qualityScore; the two are never
 *  compared across kind by callers (a batch is single-kind). */
export function rankVariants(variants: ScoredVariant[], topK: number): RankedVariants {
  // Relies on Array.prototype.sort being stable (ES2019+) so equal-scored variants keep input order.
  const ordered = [...variants].sort((a, b) => rankValue(b.score) - rankValue(a.score));
  const best = ordered[0];
  let rationale = "No variants to rank.";
  if (best) {
    if (best.score.kind === "predicted") {
      rationale =
        best.score.hookScore < WEAK_HOOK_THRESHOLD
          ? `Top pick scores ${best.score.viralPotential}/100, but the hook is weak (${best.score.hookScore}/100) — the first 3s don't grab. Worth a stronger opener.`
          : `Top pick scores ${best.score.viralPotential}/100 with a solid hook (${best.score.hookScore}/100).`;
    } else {
      rationale = `Top pick passes the creative check at ${best.score.qualityScore}/100 (${best.score.factors.join(", ")}).`;
    }
  }
  return { ordered, topK: ordered.slice(0, Math.max(0, topK)), rationale };
}
