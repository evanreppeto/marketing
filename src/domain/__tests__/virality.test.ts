import { describe, expect, it } from "vitest";
import { normalizeViralityPrediction } from "../virality";

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
