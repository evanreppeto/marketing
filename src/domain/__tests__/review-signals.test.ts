import { describe, expect, it } from "vitest";

import { detectReviewSignalOpportunities, reviewSentiment, type ReviewInput } from "../review-signals";

const NOW = "2026-07-10T12:00:00Z";

function review(over: Partial<ReviewInput> = {}): ReviewInput {
  return { id: "r1", rating: 5, author: "Dana", provider: "google", location: "Oak Park", postedAt: NOW, url: "https://g.co/r/1", ...over };
}

describe("reviewSentiment", () => {
  it("buckets by star rating", () => {
    expect(reviewSentiment(1)).toBe("negative");
    expect(reviewSentiment(2)).toBe("negative");
    expect(reviewSentiment(3)).toBe("neutral");
    expect(reviewSentiment(4)).toBe("positive");
    expect(reviewSentiment(5)).toBe("positive");
  });
});

describe("detectReviewSignalOpportunities", () => {
  it("maps a fresh negative review to a high-urgency service-recovery candidate", () => {
    const [c] = detectReviewSignalOpportunities([review({ id: "neg", rating: 1, snippet: "Never showed up" })], { now: NOW });
    expect(c).toMatchObject({
      kind: "review_signal",
      subjectType: "review",
      subjectId: "neg",
      urgency: "high",
      confidence: 85,
      recommendedCampaignType: "service_recovery",
    });
    expect(c.evidence).toMatchObject({ rating: 1, sentiment: "negative", provider: "google", snippet: "Never showed up" });
    expect(c.evidence.evidence_urls).toEqual(["https://g.co/r/1"]);
  });

  it("maps a positive review to a low-urgency referral/testimonial candidate", () => {
    const [c] = detectReviewSignalOpportunities([review({ id: "pos", rating: 5 })], { now: NOW });
    expect(c).toMatchObject({ urgency: "low", confidence: 68, recommendedCampaignType: "referral_request" });
    expect(c.recommendedAction).toContain("testimonial");
  });

  it("downgrades an older negative review to medium urgency", () => {
    const tenDaysAgo = "2026-06-30T12:00:00Z";
    const [c] = detectReviewSignalOpportunities([review({ id: "old", rating: 2, postedAt: tenDaysAgo })], { now: NOW });
    expect(c.urgency).toBe("medium");
  });

  it("skips neutral (3★) reviews and stale ones beyond the window", () => {
    const stale = "2026-01-01T12:00:00Z";
    const out = detectReviewSignalOpportunities(
      [review({ id: "neu", rating: 3 }), review({ id: "stale", rating: 1, postedAt: stale })],
      { now: NOW },
    );
    expect(out).toEqual([]);
  });

  it("dedups by review id and carries the linkable company id in evidence", () => {
    const out = detectReviewSignalOpportunities(
      [review({ id: "dup", rating: 1, companyId: "co-1" }), review({ id: "dup", rating: 1 })],
      { now: NOW },
    );
    expect(out).toHaveLength(1);
    expect(out[0].evidence.companyId).toBe("co-1");
  });
});
