import { describe, expect, it } from "vitest";
import { mapMediaAssetForTest } from "../read-model";

describe("media asset virality passthrough", () => {
  it("carries the virality block from audit_payload onto the media asset", () => {
    const asset = mapMediaAssetForTest(
      {
        url: "https://x/a.mp4",
        source: "ai_generated",
        model: "marketing_studio_video",
        virality: { kind: "predicted", viralPotential: 71, hookScore: 80, sustain: 88, brainEngagement: 40, peakSecond: 2, disclaimer: "x" },
      },
      "campaign_asset",
      "attached",
    );
    expect(asset?.virality).toMatchObject({ kind: "predicted", viralPotential: 71 });
  });

  it("leaves virality null when absent", () => {
    const asset = mapMediaAssetForTest("https://x/b.png", "campaign_asset", "attached");
    expect(asset?.virality).toBeNull();
  });
});
