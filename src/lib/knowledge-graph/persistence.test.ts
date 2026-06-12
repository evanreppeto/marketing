import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { createNode, createEdge, decideNode } from "./persistence";

const ORG = "org-1";

function insertPayload(supabase: ReturnType<typeof createSupabaseQueryMock>) {
  const call = supabase.calls.find(([method]) => method === "insert") as
    | [string, Record<string, unknown>]
    | undefined;
  return call?.[1];
}

describe("createNode", () => {
  it("forces Mark's brand_fact to proposed and stamps created_by", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: { id: "n-1" }, error: null } });

    const result = await createNode(
      { kind: "brand_fact", label: "We answer 24/7" },
      { client: supabase as never, orgId: ORG, createdBy: "mark" },
    );

    expect(result).toEqual({ ok: true, id: "n-1" });
    const payload = insertPayload(supabase)!;
    expect(payload.trust_tier).toBe("proposed");
    expect(payload.created_by).toBe("mark");
    expect(payload.org_id).toBe(ORG);
    expect(payload.approved_by).toBeNull();
  });

  it("records Mark's learning as observed", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: { id: "n-2" }, error: null } });
    await createNode(
      { kind: "learning", label: "Emergency persona replies fastest by SMS" },
      { client: supabase as never, orgId: ORG, createdBy: "mark" },
    );
    expect(insertPayload(supabase)!.trust_tier).toBe("observed");
  });

  it("trusts an operator-created brand_fact and stamps the approver", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: { id: "n-3" }, error: null } });
    await createNode(
      { kind: "brand_fact", label: "IICRC certified" },
      { client: supabase as never, orgId: ORG, createdBy: "operator", actor: "Operator" },
    );
    const payload = insertPayload(supabase)!;
    expect(payload.trust_tier).toBe("trusted");
    expect(payload.approved_by).toBe("Operator");
  });

  it("rejects invalid input before touching Supabase", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: null, error: null } });
    const result = await createNode(
      { kind: "nonsense", label: "" } as never,
      { client: supabase as never, orgId: ORG, createdBy: "mark" },
    );
    expect(result.ok).toBe(false);
    expect(supabase.calls.some(([m]) => m === "insert")).toBe(false);
  });
});

describe("createEdge", () => {
  it("inserts a validated edge as observed for Mark", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_edges: { data: { id: "e-1" }, error: null } });
    const result = await createEdge(
      { fromNodeId: "a", toNodeId: "b", relation: "proves" },
      { client: supabase as never, orgId: ORG, createdBy: "mark" },
    );
    expect(result).toEqual({ ok: true, id: "e-1" });
    const payload = insertPayload(supabase)!;
    expect(payload.relation).toBe("proves");
    expect(payload.trust_tier).toBe("observed");
  });

  it("refuses a self-loop", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_edges: { data: null, error: null } });
    const result = await createEdge(
      { fromNodeId: "a", toNodeId: "a", relation: "proves" },
      { client: supabase as never, orgId: ORG, createdBy: "mark" },
    );
    expect(result.ok).toBe(false);
    expect(supabase.calls.some(([m]) => m === "insert")).toBe(false);
  });
});

describe("decideNode", () => {
  it("approves a proposed node to trusted with an approver stamp", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: { data: { id: "n-1", trust_tier: "proposed" }, error: null },
    });
    const result = await decideNode("n-1", "approve", {
      client: supabase as never,
      orgId: ORG,
      actor: "Operator",
    });
    expect(result.ok).toBe(true);
    const updateCall = supabase.calls.find(([m]) => m === "update") as [string, Record<string, unknown>];
    expect(updateCall[1].trust_tier).toBe("trusted");
    expect(updateCall[1].approved_by).toBe("Operator");
  });
});
