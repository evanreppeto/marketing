import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getBrainGraph } from "./graph";

const NODES = [
  { id: "n-1", kind: "brand_fact", label: "24/7", trust_tier: "trusted", persona: null },
  { id: "n-2", kind: "persona", label: "Emergency Homeowner", trust_tier: "trusted", persona: "persona_homeowner_emergency" },
  { id: "n-3", kind: "proof_point", label: "Before/after", trust_tier: "proposed", persona: null },
];
const EDGES = [
  { id: "e-1", from_node_id: "n-1", to_node_id: "n-2", relation: "governs", weight: null, trust_tier: "trusted" },
  { id: "e-2", from_node_id: "n-1", to_node_id: "n-9", relation: "relates_to", weight: null, trust_tier: "observed" },
];

function mock(nodes = NODES, edges = EDGES) {
  return createSupabaseQueryMock({
    knowledge_nodes: { data: nodes, error: null },
    knowledge_edges: { data: edges, error: null },
  });
}

describe("getBrainGraph", () => {
  it("returns nodes and edges, pruning edges with a missing endpoint", async () => {
    const result = await getBrainGraph({}, mock() as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ id: "e-1", fromNodeId: "n-1", toNodeId: "n-2" });
    expect(result.truncated).toBe(false);
  });

  it("reports unavailable when the node query errors", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: { data: null, error: { message: "boom" } },
      knowledge_edges: { data: [], error: null },
    });
    const result = await getBrainGraph({}, supabase as never, "org-1");
    expect(result.status).toBe("unavailable");
  });
});

describe("getBrainGraph — demo gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns unavailable (not demo) when flag is OFF and Supabase is unconfigured", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "0");
    // No client, no orgId → falls into unconfigured branch
    const result = await getBrainGraph({});
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.message).toMatch(/unavailable/i);
  });

  it("returns demo data when flag is ON and Supabase is unconfigured", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "1");
    const result = await getBrainGraph({});
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.nodes.length).toBeGreaterThan(0);
  });

  it("returns real empty live graph (not demo) when flag is OFF and DB is empty", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "0");
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: { data: [], error: null },
      knowledge_edges: { data: [], error: null },
    });
    const result = await getBrainGraph({}, supabase as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("returns demo data when flag is ON and DB is empty", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "1");
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: { data: [], error: null },
      knowledge_edges: { data: [], error: null },
    });
    const result = await getBrainGraph({}, supabase as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.nodes.length).toBeGreaterThan(0);
  });
});
