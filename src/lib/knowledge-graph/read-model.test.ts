import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { listNodes, listProposed, brainSummary } from "./read-model";

afterEach(() => {
  vi.unstubAllEnvs();
});

const NODES = [
  { id: "n-1", kind: "brand_fact", label: "We answer 24/7", trust_tier: "trusted", persona: null },
  { id: "n-2", kind: "brand_fact", label: "Mold draft", trust_tier: "proposed", persona: null },
  { id: "n-3", kind: "learning", label: "SMS wins", trust_tier: "observed", persona: "persona_homeowner_emergency" },
];

describe("listNodes", () => {
  it("returns mapped nodes when live", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: NODES, error: null } });
    const result = await listNodes({}, supabase as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0]).toMatchObject({ id: "n-1", kind: "brand_fact" });
  });

  it("reports unavailable on a Supabase error", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: null, error: { message: "boom" } } });
    const result = await listNodes({}, supabase as never, "org-1");
    expect(result.status).toBe("unavailable");
  });

  it("can suppress the empty-brain demo fallback", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: [], error: null } });
    const result = await listNodes({}, supabase as never, "org-1", { demoFallback: false });
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.nodes).toEqual([]);
  });

  it("serves an empty brain for an empty workspace when demo data is disabled (the default)", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "");
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: [], error: null } });
    const result = await listNodes({}, supabase as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.nodes).toEqual([]);
  });

  it("still serves the demo brain for an empty workspace when ARC_DEMO_DATA=1", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "1");
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: [], error: null } });
    const result = await listNodes({}, supabase as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.nodes.length).toBeGreaterThan(0);
  });

  it("hides archived nodes from a default read", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: NODES, error: null } });
    await listNodes({}, supabase as never, "org-1");
    expect(supabase.calls).toContainEqual(["neq", "trust_tier", "archived"]);
  });

  it("does not add the archived filter when an explicit tier is requested", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: NODES, error: null } });
    await listNodes({ trustTier: "trusted" }, supabase as never, "org-1");
    expect(supabase.calls).toContainEqual(["eq", "trust_tier", "trusted"]);
    expect(supabase.calls.some((c) => c[0] === "neq" && c[1] === "trust_tier")).toBe(false);
  });
});

describe("listProposed", () => {
  it("returns only the items awaiting a decision", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: { data: NODES.filter((n) => n.trust_tier === "proposed"), error: null },
    });
    const result = await listProposed(supabase as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.nodes.every((n) => n.trustTier === "proposed")).toBe(true);
  });
});

describe("brainSummary", () => {
  it("counts nodes by kind and tier", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: NODES, error: null } });
    const result = await brainSummary(supabase as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.total).toBe(3);
    expect(result.byTier.trusted).toBe(1);
    expect(result.byTier.proposed).toBe(1);
    expect(result.byKind.brand_fact).toBe(2);
  });
});
