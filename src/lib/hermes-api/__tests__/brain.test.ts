import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { markCreateNode, markCreateEdge } from "../brain";

const ORG = "org-1";

describe("markCreateNode", () => {
  it("creates a brand_fact as proposed (Mark can never self-trust)", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: { id: "n-1" }, error: null } });
    const result = await markCreateNode(
      { kind: "brand_fact", label: "We answer 24/7", trust_tier: "trusted" },
      { client: supabase as never, orgId: ORG },
    );
    expect(result).toEqual({ ok: true, id: "n-1" });
    const insert = supabase.calls.find(([m]) => m === "insert") as [string, Record<string, unknown>];
    expect(insert[1].trust_tier).toBe("proposed");
    expect(insert[1].created_by).toBe("mark");
  });

  it("returns a validation error for an unknown kind", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: null, error: null } });
    const result = await markCreateNode({ kind: "bogus", label: "x" }, { client: supabase as never, orgId: ORG });
    expect(result.ok).toBe(false);
  });
});

describe("markCreateEdge", () => {
  it("creates a validated edge", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_edges: { data: { id: "e-1" }, error: null } });
    const result = await markCreateEdge(
      { from_node_id: "a", to_node_id: "b", relation: "proves" },
      { client: supabase as never, orgId: ORG },
    );
    expect(result).toEqual({ ok: true, id: "e-1" });
  });
});
