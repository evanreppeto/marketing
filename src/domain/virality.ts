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
    peakSecond: typeof raw.peak_second === "number" ? raw.peak_second : 0,
    ...(meta.dashboardUrl ? { dashboardUrl: meta.dashboardUrl } : {}),
    disclaimer: VIRALITY_DISCLAIMER,
    ...(meta.scoredAt ? { scoredAt: meta.scoredAt } : {}),
  };
}
