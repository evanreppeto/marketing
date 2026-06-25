import { describe, expect, it } from "vitest";

import { recallRelevance, type RecallCandidate } from "@/domain";
import { enrichRecall, type RecallGraph } from "@/domain";

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

describe("enrichRecall confidence", () => {
  it("attaches confidence + nodeId when a message is provided", () => {
    const selected: RecallCandidate[] = [cand({ id: "n1" })];
    const graph: RecallGraph = { nodes: [{ id: "n1", label: "Landlord persona playbook", kind: "note" }], edges: [] };
    const [item] = enrichRecall(selected, graph, { message: "landlord storm" });
    expect(item.nodeId).toBe("n1");
    expect(typeof item.confidence).toBe("number");
    expect(item.confidence).toBeGreaterThan(0);
  });

  it("omits confidence + nodeId when no message is provided (back-compat)", () => {
    const selected: RecallCandidate[] = [cand({ id: "n1" })];
    const graph: RecallGraph = { nodes: [{ id: "n1", label: "X", kind: "note" }], edges: [] };
    const [item] = enrichRecall(selected, graph);
    expect(item.confidence).toBeUndefined();
    expect(item.nodeId).toBeUndefined();
  });
});
