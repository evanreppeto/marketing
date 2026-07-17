import { describe, expect, it } from "vitest";
import {
  rankRecall,
  recallRelevance,
  selectRecall,
  traverseFrom,
  enrichRecall,
  type RecallCandidate,
  type GraphEdgeInput,
  type RecallGraph,
} from "../brain-recall";

function cand(id: string, label: string, extra: Partial<RecallCandidate> = {}): RecallCandidate {
  return { id, kind: "learning", label, summary: null, tags: [], trustTier: "trusted", ...extra };
}

describe("rankRecall", () => {
  it("returns the core set in input order, capped by coreLimit", () => {
    const c = [cand("1", "A"), cand("2", "B"), cand("3", "C")];
    const out = rankRecall(c, "", { coreLimit: 2, matchLimit: 0, cap: 15 });
    expect(out.map((r) => r.label)).toEqual(["A", "B"]);
  });

  it("adds keyword top-up matches beyond the core set", () => {
    const c = [
      cand("1", "Core one"),
      cand("2", "Core two"),
      cand("3", "Water damage angle", { summary: "use the flood response proof point" }),
      cand("4", "Unrelated node"),
    ];
    const out = rankRecall(c, "What's our best flood messaging?", { coreLimit: 2, matchLimit: 5, cap: 15 });
    const labels = out.map((r) => r.label);
    expect(labels).toContain("Core one");
    expect(labels).toContain("Core two");
    expect(labels).toContain("Water damage angle");
    expect(labels).not.toContain("Unrelated node");
  });

  it("does not duplicate a node that is already in core", () => {
    const c = [cand("1", "flood angle"), cand("2", "B")];
    const out = rankRecall(c, "flood", { coreLimit: 2, matchLimit: 5, cap: 15 });
    expect(out.filter((r) => r.label === "flood angle")).toHaveLength(1);
  });

  it("never exceeds the cap", () => {
    const c = Array.from({ length: 30 }, (_, i) => cand(String(i), `node ${i} flood`));
    const out = rankRecall(c, "flood", { coreLimit: 10, matchLimit: 5, cap: 12 });
    expect(out.length).toBeLessThanOrEqual(12);
  });

  it("empty message yields core only", () => {
    const c = [cand("1", "A"), cand("2", "B flood")];
    const out = rankRecall(c, "", { coreLimit: 1, matchLimit: 5, cap: 15 });
    expect(out.map((r) => r.label)).toEqual(["A"]);
  });

  it("empty candidates yields empty", () => {
    expect(rankRecall([], "anything")).toEqual([]);
  });

  it("maps to RecallItem shape (label, summary, kind)", () => {
    const out = rankRecall([cand("1", "A", { summary: "s", kind: "proof_point" })], "");
    expect(out[0]).toEqual({ label: "A", summary: "s", kind: "proof_point" });
  });
});

describe("selectRecall", () => {
  function c(id: string, label: string, extra: Partial<RecallCandidate> = {}) {
    return { id, kind: "learning", label, summary: null, tags: [], trustTier: "trusted", ...extra };
  }

  it("returns selected CANDIDATES (with ids), core in input order", () => {
    const out = selectRecall([c("1", "A"), c("2", "B"), c("3", "C")], "", { coreLimit: 2, matchLimit: 0, cap: 15 });
    expect(out.map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("adds keyword matches beyond core, by id", () => {
    const out = selectRecall(
      [c("1", "Core one"), c("2", "Core two"), c("3", "flood angle"), c("4", "unrelated")],
      "flood",
      { coreLimit: 2, matchLimit: 5, cap: 15 },
    );
    expect(out.map((x) => x.id)).toContain("3");
    expect(out.map((x) => x.id)).not.toContain("4");
  });
});

describe("selectRecall — semantic ranking", () => {
  function c(id: string, label: string, extra: Partial<RecallCandidate> = {}): RecallCandidate {
    return { id, kind: "learning", label, summary: null, tags: [], trustTier: "trusted", ...extra };
  }

  // The regression this whole path exists for: the operator paraphrases, so no
  // literal token matches, and only the vector search knows the node is relevant.
  it("selects a semantically-near node that shares no keyword with the message", () => {
    const out = selectRecall(
      [
        c("1", "Core one"),
        c("2", "Basement flooding playbook", { similarity: 0.91 }),
        c("3", "Invoice reminder cadence"),
      ],
      "what do we say when a customer's cellar fills with water",
      { coreLimit: 1, matchLimit: 5, cap: 15 },
    );
    expect(out.map((x) => x.id)).toContain("2");
    expect(out.map((x) => x.id)).not.toContain("3");
  });

  it("ranks a node both rankers found above one only a single ranker found", () => {
    const out = selectRecall(
      [
        c("core", "Core"),
        c("semantic-only", "Cellar water response", { similarity: 0.88 }),
        c("both", "Flood playbook", { summary: "flood response", similarity: 0.86 }),
      ],
      "flood",
      { coreLimit: 1, matchLimit: 5, cap: 15 },
    );
    const ranked = out.slice(1).map((x) => x.id);
    expect(ranked[0]).toBe("both");
    expect(ranked).toContain("semantic-only");
  });

  it("orders semantic matches by similarity, nearest first", () => {
    const out = selectRecall(
      [
        c("core", "Core"),
        c("far", "Far node", { similarity: 0.55 }),
        c("near", "Near node", { similarity: 0.95 }),
        c("mid", "Mid node", { similarity: 0.75 }),
      ],
      "some paraphrased question",
      { coreLimit: 1, matchLimit: 5, cap: 15 },
    );
    expect(out.slice(1).map((x) => x.id)).toEqual(["near", "mid", "far"]);
  });

  it("falls back to keyword-only ranking when no candidate carries a similarity", () => {
    const withoutSimilarity = selectRecall(
      [c("1", "Core"), c("2", "flood angle"), c("3", "unrelated")],
      "flood",
      { coreLimit: 1, matchLimit: 5, cap: 15 },
    );
    expect(withoutSimilarity.map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("keeps a semantic hit out of the block when the message is empty", () => {
    const out = selectRecall([c("1", "Core"), c("2", "Scored", { similarity: 0.99 })], "", {
      coreLimit: 1,
      matchLimit: 5,
      cap: 15,
    });
    expect(out.map((x) => x.id)).toEqual(["1"]);
  });

  it("does not mutate the caller's candidate array", () => {
    const input = [c("1", "Core"), c("2", "B", { similarity: 0.9 }), c("3", "C", { similarity: 0.95 })];
    const snapshot = input.map((x) => x.id);
    selectRecall(input, "question", { coreLimit: 1, matchLimit: 5, cap: 15 });
    expect(input.map((x) => x.id)).toEqual(snapshot);
  });
});

describe("recallRelevance — semantic confidence", () => {
  const base = (over: Partial<RecallCandidate> = {}): RecallCandidate => ({
    id: "n1",
    kind: "learning",
    label: "Basement flooding playbook",
    summary: null,
    tags: [],
    trustTier: "trusted",
    ...over,
  });

  it("scores a semantically-near node above an unscored one with the same wording", () => {
    const msg = "cellar full of water";
    expect(recallRelevance(base({ similarity: 0.95 }), msg)).toBeGreaterThan(recallRelevance(base(), msg));
  });

  it("treats similarity at or below the noise floor as no evidence", () => {
    const msg = "cellar full of water";
    expect(recallRelevance(base({ similarity: 0.7 }), msg)).toBe(recallRelevance(base(), msg));
    expect(recallRelevance(base({ similarity: 0.1 }), msg)).toBe(recallRelevance(base(), msg));
  });

  // Calibration guard. Measured against the live brain (gemini-embedding-2): unrelated
  // nodes cluster at ~0.62 median / ~0.69 p99, genuine matches reach ~0.83. A floor
  // that lets 0.62 through would hand most of the brain a spurious confidence bump.
  it("reads a typical unrelated node's similarity as noise, not evidence", () => {
    const msg = "cellar full of water";
    expect(recallRelevance(base({ similarity: 0.62 }), msg)).toBe(recallRelevance(base(), msg));
    expect(recallRelevance(base({ similarity: 0.83 }), msg)).toBeGreaterThan(recallRelevance(base(), msg));
  });

  it("stays within [0,1] at maximum similarity", () => {
    const score = recallRelevance(base({ similarity: 1 }), "basement flooding playbook");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("traverseFrom", () => {
  const edges: GraphEdgeInput[] = [
    { fromNodeId: "a", toNodeId: "b", relation: "proves" },
    { fromNodeId: "b", toNodeId: "c", relation: "targets" },
    { fromNodeId: "d", toNodeId: "a", relation: "governs" },
  ];

  it("finds 1-hop and 2-hop connections with direction + hops", () => {
    const conns = traverseFrom(["a"], edges, { depth: 2, maxPerSeed: 10 }).get("a")!;
    expect(conns).toEqual(
      expect.arrayContaining([
        { nodeId: "b", relation: "proves", direction: "out", hops: 1 },
        { nodeId: "d", relation: "governs", direction: "in", hops: 1 },
        { nodeId: "c", relation: "targets", direction: "out", hops: 2 },
      ]),
    );
  });

  it("respects depth (1 hop excludes 2-hop nodes)", () => {
    const conns = traverseFrom(["a"], edges, { depth: 1, maxPerSeed: 10 }).get("a")!;
    expect(conns.map((x) => x.nodeId)).not.toContain("c");
  });

  it("respects maxPerSeed", () => {
    const conns = traverseFrom(["a"], edges, { depth: 2, maxPerSeed: 1 }).get("a")!;
    expect(conns).toHaveLength(1);
  });

  it("is cycle-safe", () => {
    const cyclic: GraphEdgeInput[] = [
      { fromNodeId: "x", toNodeId: "y", relation: "relates_to" },
      { fromNodeId: "y", toNodeId: "x", relation: "relates_to" },
    ];
    const conns = traverseFrom(["x"], cyclic, { depth: 5, maxPerSeed: 10 }).get("x")!;
    expect(conns.map((c) => c.nodeId)).toEqual(["y"]);
  });

  it("returns an empty list for a seed with no edges", () => {
    expect(traverseFrom(["lonely"], edges).get("lonely")).toEqual([]);
  });
});

describe("enrichRecall", () => {
  const selected = [
    { id: "a", kind: "messaging_angle", label: "Flood angle", summary: "lead 24/7", tags: [], trustTier: "trusted" },
    { id: "z", kind: "learning", label: "Lonely", summary: null, tags: [], trustTier: "observed" },
  ];
  const graph: RecallGraph = {
    nodes: [
      { id: "a", label: "Flood angle", kind: "messaging_angle" },
      { id: "b", label: "24/7 response", kind: "proof_point" },
      { id: "z", label: "Lonely", kind: "learning" },
    ],
    edges: [{ fromNodeId: "a", toNodeId: "b", relation: "proves" }],
  };

  it("attaches outbound relation lines to connected nodes", () => {
    const out = enrichRecall(selected, graph, { enrichLimit: 5, relationsPerNode: 3 });
    const a = out.find((i) => i.label === "Flood angle")!;
    expect(a.related).toEqual(["—proves→ 24/7 response (proof_point)"]);
  });

  it("leaves nodes with no connections without a related field", () => {
    const out = enrichRecall(selected, graph, {});
    const z = out.find((i) => i.label === "Lonely")!;
    expect(z.related).toBeUndefined();
  });

  it("only enriches the top enrichLimit selected nodes", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`, kind: "learning", label: `N${i}`, summary: null, tags: [], trustTier: "trusted",
    }));
    const g: RecallGraph = {
      nodes: [...many.map((m) => ({ id: m.id, label: m.label, kind: m.kind })), { id: "t", label: "Target", kind: "proof_point" }],
      edges: many.map((m) => ({ fromNodeId: m.id, toNodeId: "t", relation: "proves" })),
    };
    const out = enrichRecall(many, g, { enrichLimit: 2 });
    expect(out.filter((i) => i.related).length).toBe(2);
  });

  it("renders inbound direction and a hop prefix for 2-hop", () => {
    const sel = [{ id: "a", kind: "learning", label: "A", summary: null, tags: [], trustTier: "trusted" }];
    const g: RecallGraph = {
      nodes: [
        { id: "a", label: "A", kind: "learning" },
        { id: "b", label: "B", kind: "learning" },
        { id: "c", label: "C", kind: "proof_point" },
      ],
      edges: [
        { fromNodeId: "d_b", toNodeId: "a", relation: "governs" },
        { fromNodeId: "a", toNodeId: "b", relation: "relates_to" },
        { fromNodeId: "b", toNodeId: "c", relation: "proves" },
      ],
    };
    const a = enrichRecall(sel, g, { depth: 2, maxPerSeed: 10 }).find((i) => i.label === "A")!;
    expect(a.related).toContain("—relates_to→ B (learning)");
    expect(a.related).toContain("(2-hop) —proves→ C (proof_point)");
  });
});

describe("enrichRecall carries recordedAt", () => {
  function c(id: string, label: string, extra: Partial<RecallCandidate> = {}): RecallCandidate {
    return { id, kind: "learning", label, summary: null, tags: [], trustTier: "observed", ...extra };
  }
  const emptyGraph = { nodes: [], edges: [] };

  it("keeps the timestamp so the prompt can date the fact", () => {
    // Dropping it here is how the date got lost before: the node has created_at,
    // but the candidate -> item mapping silently discarded it, so every recalled
    // fact reached the prompt reading as timeless.
    const [item] = enrichRecall([c("n1", "crm_total_leads", { recordedAt: "2026-07-17T12:00:00.000Z" })], emptyGraph);
    expect(item.recordedAt).toBe("2026-07-17T12:00:00.000Z");
  });

  it("omits recordedAt entirely when the candidate has none", () => {
    const [item] = enrichRecall([c("n1", "IICRC-certified technicians")], emptyGraph);
    expect(item.recordedAt).toBeUndefined();
    expect("recordedAt" in item).toBe(false);
  });

  it("keeps the timestamp alongside confidence/nodeId when a message is given", () => {
    const [item] = enrichRecall(
      [c("n1", "crm_total_leads", { recordedAt: "2026-07-17T12:00:00.000Z" })],
      emptyGraph,
      { message: "how many leads" },
    );
    expect(item.recordedAt).toBe("2026-07-17T12:00:00.000Z");
    expect(item.nodeId).toBe("n1");
  });
});
