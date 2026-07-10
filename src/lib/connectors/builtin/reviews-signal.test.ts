import { describe, expect, it } from "vitest";

import { getSignalSource } from "../registry";
import { configReviewSource, detectReviewOpportunities } from "./reviews-signal";
// Importing the barrel triggers registerSignalSource for the built-ins.
import "./index";

const NOW = "2026-07-10T12:00:00Z";

describe("reviews-signals connector", () => {
  it("self-registers as a signal source", () => {
    expect(getSignalSource("reviews-signals")?.key).toBe("reviews-signals");
  });

  it("configReviewSource reads seeded reviews from config and ignores malformed rows", async () => {
    const src = configReviewSource({ reviews: [{ id: "r1", rating: 1 }, { id: "", rating: 5 }, { nope: true }, "bad"] });
    const rows = await src.listRecentReviews(NOW);
    expect(rows.map((r) => r.id)).toEqual(["r1"]);
  });

  it("detects review_signal opportunities from the config source", async () => {
    const out = await detectReviewOpportunities({
      now: NOW,
      config: { reviews: [{ id: "neg", rating: 1, author: "Sam", postedAt: NOW }, { id: "pos", rating: 5, postedAt: NOW }] },
    });
    expect(out.map((c) => c.kind)).toEqual(["review_signal", "review_signal"]);
    expect(out.find((c) => c.subjectId === "neg")?.recommendedCampaignType).toBe("service_recovery");
    expect(out.find((c) => c.subjectId === "pos")?.recommendedCampaignType).toBe("referral_request");
  });

  it("proposes nothing when no reviews are configured (read-only, no invention)", async () => {
    expect(await detectReviewOpportunities({ now: NOW, config: {} })).toEqual([]);
  });

  it("honors an injected source (the live-provider seam)", async () => {
    const out = await detectReviewOpportunities({
      now: NOW,
      config: {},
      source: { listRecentReviews: async () => [{ id: "x", rating: 2, postedAt: NOW }] },
    });
    expect(out).toHaveLength(1);
    expect(out[0].subjectType).toBe("review");
  });
});
