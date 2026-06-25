import { describe, expect, it } from "vitest";

import { recallRelevance, type RecallCandidate } from "@/domain";

const cand = (over: Partial<RecallCandidate> = {}): RecallCandidate => ({
  id: "n1",
  kind: "note",
  label: "Landlord persona playbook",
  summary: "Re-engage landlords before storm season",
  tags: ["landlord", "storm"],
  trustTier: "trusted",
  ...over,
});

describe("recallRelevance", () => {
  it("returns a value in [0,1]", () => {
    const score = recallRelevance(cand(), "landlords going cold before storm season");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("scores trusted higher than observed for the same text overlap", () => {
    const msg = "landlord storm";
    expect(recallRelevance(cand({ trustTier: "trusted" }), msg)).toBeGreaterThan(
      recallRelevance(cand({ trustTier: "observed" }), msg),
    );
  });

  it("scores higher with more keyword overlap", () => {
    const strong = recallRelevance(cand(), "landlord storm playbook");
    const weak = recallRelevance(cand(), "unrelated invoice topic");
    expect(strong).toBeGreaterThan(weak);
  });

  it("never exceeds 1 even with heavy overlap", () => {
    const score = recallRelevance(cand(), "landlord storm playbook re-engage persona");
    expect(score).toBeLessThanOrEqual(1);
  });
});
