import { describe, expect, it } from "vitest";

import { previewRecall, type RecallPreviewNode } from "../brain-recall";

const n = (id: string, over: Partial<RecallPreviewNode> = {}): RecallPreviewNode => ({
  id,
  kind: "proof_point",
  label: id,
  summary: null,
  tags: [],
  trustTier: "trusted",
  ...over,
});

describe("previewRecall", () => {
  const nodes: RecallPreviewNode[] = [
    n("water", { label: "Water damage mitigation", kind: "service", tags: ["water"] }),
    n("emergency", { label: "24/7 emergency response", kind: "brand_fact", tags: ["emergency", "speed"] }),
    n("mold", { label: "Mold remediation", kind: "service", tags: ["mold"] }),
    n("storm", { label: "Spring storm prep", trustTier: "observed", tags: ["seasonal"] }),
    n("prop", { label: "Sub-2-hour guarantee", trustTier: "proposed", tags: ["speed"] }),
  ];
  const edges = [{ fromNodeId: "emergency", toNodeId: "water", relation: "governs" }];

  it("excludes proposed facts — only trusted/observed are recallable", () => {
    const r = previewRecall(nodes, edges, "flooded basement water emergency");
    expect(r.map((x) => x.id)).not.toContain("prop");
  });

  it("surfaces facts relevant to the message", () => {
    const r = previewRecall(nodes, edges, "mold problem in a rental");
    expect(r.map((x) => x.id)).toContain("mold");
  });

  it("attaches relationship lines from the graph", () => {
    const r = previewRecall(nodes, edges, "emergency response");
    const emerg = r.find((x) => x.id === "emergency");
    expect((emerg?.related?.length ?? 0)).toBeGreaterThan(0);
  });

  it("marks always-pulled trusted facts as core memory", () => {
    const r = previewRecall(nodes, edges, "");
    expect(r.some((x) => x.core)).toBe(true);
  });
});
