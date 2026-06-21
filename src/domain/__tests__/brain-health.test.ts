import { describe, expect, it } from "vitest";

import { analyzeBrainHealth, type HealthEdgeInput, type HealthNodeInput } from "../brain-health";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

const node = (over: Partial<HealthNodeInput> & { id: string }): HealthNodeInput => ({
  kind: "proof_point",
  label: over.id,
  trustTier: "trusted",
  confidence: 90,
  createdAt: new Date(NOW).toISOString(),
  ...over,
});

describe("analyzeBrainHealth", () => {
  const nodes: HealthNodeInput[] = [
    node({ id: "arc", kind: "arc", label: "Arc", confidence: null }),
    node({ id: "connected", label: "Connected proof" }),
    node({ id: "orphan", label: "Orphan fact" }), // no edges
    node({ id: "stale", label: "Old stat", createdAt: new Date(NOW - 200 * DAY).toISOString() }),
    node({ id: "shaky", label: "Shaky fact", confidence: 45 }), // low confidence
    node({ id: "persona_lonely", kind: "persona", label: "Lonely Persona" }), // gap: <2 connections
    node({ id: "persona_ok", kind: "persona", label: "Supported Persona" }),
    node({ id: "prop", label: "Proposed fact", trustTier: "proposed", confidence: 40 }),
  ];
  const edges: HealthEdgeInput[] = [
    { fromNodeId: "arc", toNodeId: "connected" },
    { fromNodeId: "connected", toNodeId: "stale" },
    { fromNodeId: "connected", toNodeId: "shaky" },
    { fromNodeId: "arc", toNodeId: "persona_ok" },
    { fromNodeId: "connected", toNodeId: "persona_ok" },
    { fromNodeId: "arc", toNodeId: "persona_lonely" }, // only 1 connection -> gap
  ];

  const h = analyzeBrainHealth(nodes, edges, NOW, 90);

  it("flags orphan facts (no connections, excluding the hub)", () => {
    expect(h.orphans.map((o) => o.id)).toEqual(["orphan"]);
  });

  it("flags stale facts older than the threshold", () => {
    expect(h.stale.map((o) => o.id)).toContain("stale");
    expect(h.stale.map((o) => o.id)).not.toContain("connected");
  });

  it("flags low-confidence non-proposed facts", () => {
    expect(h.lowConfidence.map((o) => o.id)).toContain("shaky");
    expect(h.lowConfidence.map((o) => o.id)).not.toContain("prop"); // proposed handled by review queue
  });

  it("flags under-connected personas as coverage gaps", () => {
    expect(h.coverageGaps.map((o) => o.id)).toContain("persona_lonely");
    expect(h.coverageGaps.map((o) => o.id)).not.toContain("persona_ok");
  });

  it("counts proposed facts awaiting review", () => {
    expect(h.proposedCount).toBe(1);
  });

  it("produces a 0–100 health score that drops as issues accumulate", () => {
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.score).toBeLessThan(100);
    const clean = analyzeBrainHealth([node({ id: "arc", kind: "arc", confidence: null }), node({ id: "x" })], [{ fromNodeId: "arc", toNodeId: "x" }], NOW, 90);
    expect(clean.score).toBe(100);
  });
});
