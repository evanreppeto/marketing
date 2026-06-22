import { describe, expect, it, vi } from "vitest";

vi.mock("./graph", () => ({ getBrainGraph: vi.fn() }));
vi.mock("@/lib/embeddings/gemini-embeddings", () => ({ embedText: vi.fn() }));

import { embedText } from "@/lib/embeddings/gemini-embeddings";
import { getBrainGraph } from "./graph";
import { getRecallMemory } from "./recall";

const graphMock = vi.mocked(getBrainGraph);
const embedMock = vi.mocked(embedText);

/** Build a minimal client mock with a controllable .rpc() */
function makeClientWithRpc(rpcResult: { data: unknown; error: null | { message: string } }) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as unknown as import("@/lib/supabase/server").TypedSupabaseClient;
}

function node(id: string, label: string, trustTier: string, kind = "learning") {
  return {
    id, kind, label, body: null, summary: null, persona: null,
    trustTier, confidence: null, refTable: null, refId: null, source: null,
    tags: [], createdBy: null, createdAt: null,
  };
}

describe("getRecallMemory", () => {
  it("queries the graph for trusted+observed only", async () => {
    graphMock.mockResolvedValue({ status: "live", nodes: [], edges: [], truncated: false } as never);
    await getRecallMemory("org_1", "hi");
    expect(graphMock).toHaveBeenCalledWith({ trustTiers: ["trusted", "observed"] }, undefined, "org_1");
  });

  it("ranks trusted before observed and attaches related lines from edges", async () => {
    graphMock.mockResolvedValue({
      status: "live",
      nodes: [
        node("o1", "Observed learning", "observed"),
        node("t1", "Flood angle", "trusted", "messaging_angle"),
        node("p1", "24/7 response", "trusted", "proof_point"),
      ],
      edges: [{ id: "e1", fromNodeId: "t1", toNodeId: "p1", relation: "proves", weight: null, trustTier: "trusted" }],
      truncated: false,
    } as never);
    const out = await getRecallMemory("org_1", "");
    expect(out[0].label).toBe("Flood angle"); // trusted first
    const angle = out.find((i) => i.label === "Flood angle")!;
    expect(angle.related).toEqual(["—proves→ 24/7 response (proof_point)"]);
  });

  it("returns [] when the graph is unavailable", async () => {
    graphMock.mockResolvedValue({ status: "unavailable", message: "down" } as never);
    expect(await getRecallMemory("org_1", "x")).toEqual([]);
  });
});

describe("getRecallMemory — semantic union", () => {
  it("REGRESSION GUARD: when embedText returns null, no rpc is called and result equals graph-only output", async () => {
    const graphNodes = [
      node("g1", "Graph-only node", "trusted", "learning"),
    ];
    graphMock.mockResolvedValue({
      status: "live",
      nodes: graphNodes,
      edges: [],
      truncated: false,
    } as never);
    embedMock.mockResolvedValue(null);

    const mockClient = makeClientWithRpc({ data: [], error: null });

    const out = await getRecallMemory("org_1", "some message", mockClient);

    // embedText was called (or maybe not if we guard early), but rpc MUST NOT be called
    expect(mockClient.rpc).not.toHaveBeenCalled();
    // Result should include the graph node
    expect(out.some((item) => item.label === "Graph-only node")).toBe(true);
  });

  it("UNION: semantic node not in graph window is added to candidates", async () => {
    const FAKE_VEC = Array.from({ length: 768 }, (_, i) => i / 768);
    const graphNodes = [
      node("g1", "Graph node one", "trusted", "learning"),
    ];
    graphMock.mockResolvedValue({
      status: "live",
      nodes: graphNodes,
      edges: [],
      truncated: false,
    } as never);
    embedMock.mockResolvedValue(FAKE_VEC);

    // RPC returns a semantic node NOT in the graph
    const mockClient = makeClientWithRpc({
      data: [
        { id: "s1", kind: "brand_fact", label: "Semantic result node", summary: null, tags: ["test"], trust_tier: "trusted", distance: 0.1 },
      ],
      error: null,
    });

    const out = await getRecallMemory("org_1", "flood response", mockClient);

    // Both the graph node and the semantic node should be present
    expect(out.some((item) => item.label === "Graph node one")).toBe(true);
    expect(out.some((item) => item.label === "Semantic result node")).toBe(true);
  });

  it("DEDUP: a semantic node id already in the graph is not duplicated", async () => {
    const FAKE_VEC = Array.from({ length: 768 }, (_, i) => i / 768);
    const graphNodes = [
      node("g1", "Graph node one", "trusted", "learning"),
    ];
    graphMock.mockResolvedValue({
      status: "live",
      nodes: graphNodes,
      edges: [],
      truncated: false,
    } as never);
    embedMock.mockResolvedValue(FAKE_VEC);

    // RPC returns the same node id as in the graph → should be deduped
    const mockClient = makeClientWithRpc({
      data: [
        { id: "g1", kind: "learning", label: "Graph node one", summary: null, tags: [], trust_tier: "trusted", distance: 0.0 },
      ],
      error: null,
    });

    const out = await getRecallMemory("org_1", "flood", mockClient);

    // The node should appear exactly once
    const matches = out.filter((item) => item.label === "Graph node one");
    expect(matches).toHaveLength(1);
  });
});
