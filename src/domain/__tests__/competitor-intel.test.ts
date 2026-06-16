import { describe, expect, it } from "vitest";

import { parseCompetitorIntelPayload, competitorIntelDedupeKey, scoreCompetitorActivity } from "../competitor-intel";

const valid = {
  source: "meta_ad_library",
  competitorName: "ServiceMaster Chicago",
  competitorUrl: "https://example-competitor.local",
  summary: "Running 4 storm-response video ads in Chicago metro.",
  topKeywords: ["water damage", "storm cleanup"],
  adCreatives: [{ headline: "Flooded?", body: "24/7", mediaUrl: "https://x.test/a.png" }],
  capturedAt: "2026-06-08T00:00:00.000Z",
  operator: "Arc",
};

describe("parseCompetitorIntelPayload", () => {
  it("accepts a valid payload and applies defaults", () => {
    const r = parseCompetitorIntelPayload(valid);
    expect(r.competitorName).toBe("ServiceMaster Chicago");
    expect(r.status).toBe("needs_review");
    expect(r.channelMix).toEqual({});
  });
  it("rejects an unknown source", () => {
    expect(() => parseCompetitorIntelPayload({ ...valid, source: "tiktok" })).toThrow();
  });
  it("rejects a blank competitorName", () => {
    expect(() => parseCompetitorIntelPayload({ ...valid, competitorName: "  " })).toThrow();
  });
});

describe("competitorIntelDedupeKey", () => {
  it("is stable for the same source+name+captured date", () => {
    const a = competitorIntelDedupeKey({ source: "meta_ad_library", competitorName: "Acme", capturedAt: "2026-06-08T10:00:00Z" });
    const b = competitorIntelDedupeKey({ source: "meta_ad_library", competitorName: "acme", capturedAt: "2026-06-08T23:00:00Z" });
    expect(a).toBe(b);
  });
});

describe("scoreCompetitorActivity", () => {
  it("rates more creatives as higher activity", () => {
    const low = scoreCompetitorActivity({ adCreatives: [] });
    const high = scoreCompetitorActivity({ adCreatives: [{}, {}, {}, {}, {}, {}] });
    expect(high.activityLevel).toBe("high");
    expect(low.activityLevel).toBe("low");
  });
});
