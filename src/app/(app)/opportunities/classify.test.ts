import { describe, expect, it } from "vitest";

import { classify } from "./classify";

describe("classify", () => {
  it("keys external-signal subjects off the subject type, not keywords", () => {
    expect(classify("Severe Thunderstorm Warning — Cook County", "weather_event")).toEqual({ icon: "weather", typeLabel: "Weather event" });
    expect(classify("ServPro launched a spring promo", "competitor_signal")).toEqual({ icon: "comp", typeLabel: "Competitor move" });
    expect(classify("Storm Rapid Response", "campaign")).toEqual({ icon: "repeat", typeLabel: "Repeat a winner" });
  });

  it("renders a feed_item as a news mention", () => {
    expect(classify("BBC Business: rates decision", "feed_item")).toEqual({ icon: "news", typeLabel: "News mention" });
  });

  // The regression this move is for: a news headline that contains a weather word must
  // NOT be classified as a weather event — the subject type wins.
  it("does not misclassify a news item about a storm as a weather event", () => {
    const out = classify("Local roofer News: how homeowners recover after a storm", "feed_item");
    expect(out).toEqual({ icon: "news", typeLabel: "News mention" });
  });

  it("falls back to keyword heuristics for CRM subjects", () => {
    expect(classify("Re-engage this dormant account", "lead").typeLabel).toBe("Lifecycle");
    expect(classify("Warm lead comparing estimates", "lead").typeLabel).toBe("Buyer intent");
    // No keyword hit → the subject-type fallbacks: a lead reads as a lead signal.
    expect(classify("Just a name", "lead")).toEqual({ icon: "user", typeLabel: "Lead signal" });
  });

  it("defaults to a generic opportunity when nothing matches", () => {
    expect(classify("nondescript", "unknown_subject")).toEqual({ icon: "user", typeLabel: "Opportunity" });
  });
});
