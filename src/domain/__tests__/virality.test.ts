import { describe, expect, it } from "vitest";
import { creativeQualityScore, normalizeViralityPrediction } from "../virality";

// Captured live from mcp__higgsfield__virality_predictor on the BSR water-damage
// ad (job 0962ba9c…), raw_data.params.analysis.scores. See the design spec.
const SPIKED_SCORES = {
  sustain: 96,
  hook_score: 30,
  peak_score: 0.376742,
  peak_second: 0,
  overall_score: 44,
  viral_potential: 42,
  brain_engagement: 36,
  peak_frame_index: 0,
};

describe("normalizeViralityPrediction", () => {
  it("maps the real predictor payload into a predicted score", () => {
    const score = normalizeViralityPrediction(SPIKED_SCORES, {
      dashboardUrl: "https://example.com/dash.html",
      scoredAt: "2026-06-24T19:01:43Z",
    });
    expect(score).toEqual({
      kind: "predicted",
      viralPotential: 42,
      hookScore: 30,
      sustain: 96,
      brainEngagement: 36,
      peakSecond: 0,
      dashboardUrl: "https://example.com/dash.html",
      disclaimer: "Predictive proxy metrics, not guaranteed performance.",
      scoredAt: "2026-06-24T19:01:43Z",
    });
  });

  it("is tolerant of missing fields (clamps to 0, drops optional keys)", () => {
    const score = normalizeViralityPrediction({ viral_potential: 70 }, {});
    expect(score.kind).toBe("predicted");
    expect(score.viralPotential).toBe(70);
    expect(score.hookScore).toBe(0);
    expect(score.sustain).toBe(0);
    expect(score.dashboardUrl).toBeUndefined();
  });

  it("clamps out-of-range values into 0..100", () => {
    const score = normalizeViralityPrediction({ viral_potential: 250, hook_score: -5 }, {});
    expect(score.viralPotential).toBe(100);
    expect(score.hookScore).toBe(0);
  });
});

describe("creativeQualityScore", () => {
  it("rewards a clean, format-matched, branded image", () => {
    const score = creativeQualityScore({
      riskFlags: [],
      formatMatchesChannel: true,
      hasBrand: true,
      width: 1080,
      height: 1080,
    });
    expect(score.kind).toBe("proxy");
    expect(score.qualityScore).toBeGreaterThanOrEqual(90);
    expect(score.factors).toContain("0 risk flags");
  });

  it("penalizes risk flags and format mismatch", () => {
    const clean = creativeQualityScore({ riskFlags: [], formatMatchesChannel: true, hasBrand: true, width: 1080, height: 1080 });
    const risky = creativeQualityScore({
      riskFlags: ["embedded text", "claim risk"],
      formatMatchesChannel: false,
      hasBrand: false,
      width: 400,
      height: 400,
    });
    expect(risky.qualityScore).toBeLessThan(clean.qualityScore);
    expect(risky.kind).toBe("proxy");
  });

  it("never returns a viralPotential field (proxy is not a prediction)", () => {
    const score = creativeQualityScore({ riskFlags: [], formatMatchesChannel: true, hasBrand: true, width: 1080, height: 1080 });
    expect("viralPotential" in score).toBe(false);
  });
});
