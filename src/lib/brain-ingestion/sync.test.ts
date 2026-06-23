import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/knowledge-graph/persistence", () => ({ upsertReferenceNode: vi.fn(), createEdgeIfAbsent: vi.fn() }));
import { upsertReferenceNode, createEdgeIfAbsent } from "@/lib/knowledge-graph/persistence";
import { syncRecordToBrain, syncCrmRowToBrain, resyncCrmIntoBrain } from "./sync";

const upsertMock = vi.mocked(upsertReferenceNode);
const edgeMock = vi.mocked(createEdgeIfAbsent);
const ORG = "org-s-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncCrmRowToBrain", () => {
  it("builds a node input from the row and upserts it as arc", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "n-1" });
    const res = await syncCrmRowToBrain("companies", { id: "c1", name: "Acme" }, { client: {} as never, orgId: ORG });
    expect(res).toEqual({ ok: true, id: "n-1" });
    const [input, deps] = upsertMock.mock.calls[0];
    expect(input.kind).toBe("crm_company");
    expect(input.key).toBe("crm:companies:c1");
    expect(deps).toMatchObject({ orgId: ORG });
  });
});

describe("syncRecordToBrain", () => {
  it("reads the raw row org-scoped then upserts", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "n-2" });
    const supabase = createSupabaseQueryMock({ companies: { data: { id: "c2", name: "Beta" }, error: null } });
    const res = await syncRecordToBrain("companies", "c2", { client: supabase as never, orgId: ORG });
    expect(res).toEqual({ ok: true, id: "n-2" });
    expect(upsertMock.mock.calls.at(-1)![0].refId).toBe("c2");
  });

  it("returns a soft error (does not throw) when the row is missing", async () => {
    const supabase = createSupabaseQueryMock({ companies: { data: null, error: null } });
    const res = await syncRecordToBrain("companies", "missing", { client: supabase as never, orgId: ORG });
    expect(res.ok).toBe(false);
  });
});

describe("syncEdgesForCrmRow", () => {
  it("resolves each intent's to-node by ref and writes an edge", async () => {
    edgeMock.mockResolvedValue({ ok: true, id: "e1" });
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: { id: "n-co" }, error: null } });
    const { syncEdgesForCrmRow } = await import("./sync");
    const res = await syncEdgesForCrmRow("contacts", "n-from", { id: "k1", company_id: "co1" }, { client: supabase as never, orgId: ORG });
    expect(res.created).toBe(1);
    const [edgeArg] = edgeMock.mock.calls[0];
    expect(edgeArg).toMatchObject({ fromNodeId: "n-from", toNodeId: "n-co", relation: "belongs_to" });
  });
  it("skips an intent whose to-node does not exist yet", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: null, error: null } });
    const { syncEdgesForCrmRow } = await import("./sync");
    const res = await syncEdgesForCrmRow("contacts", "n-from", { id: "k1", company_id: "co1" }, { client: supabase as never, orgId: ORG });
    expect(res.created).toBe(0);
    expect(edgeMock).not.toHaveBeenCalled();
  });
});

describe("resyncCrmIntoBrain", () => {
  it("tallies nodes then edges across tables", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "n" });
    edgeMock.mockResolvedValue({ ok: true, id: "e" });
    const supabase = createSupabaseQueryMock({
      companies: { data: [{ id: "c1" }], error: null },
      leads: { data: [{ id: "l1", company_id: "c1" }], error: null },
      knowledge_nodes: { data: { id: "n-any" }, error: null }, // ref resolution (edge pass + from-node)
    });
    const res = await resyncCrmIntoBrain({ client: supabase as never, orgId: ORG });
    expect(res.ok).toBe(true);
    expect(res.syncedNodes).toBe(2);
    expect(typeof res.syncedEdges).toBe("number");
    expect(res.truncated).toBe(false);
  });
  it("sets ok:false when a table read errors, without aborting", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "n" });
    edgeMock.mockResolvedValue({ ok: true, id: "e" });
    const supabase = createSupabaseQueryMock({
      companies: { data: null, error: { message: "boom" } as never },
      leads: { data: [{ id: "l1" }], error: null },
      knowledge_nodes: { data: { id: "n-any" }, error: null },
    });
    const res = await resyncCrmIntoBrain({ client: supabase as never, orgId: ORG });
    expect(res.ok).toBe(false);
    expect(res.syncedNodes).toBe(1);
  });
  it("counts rows without a string id as errors, not nodes", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "n" });
    edgeMock.mockResolvedValue({ ok: true, id: "e" });
    const supabase = createSupabaseQueryMock({
      companies: { data: [{ id: "c1" }, { name: "no id" }], error: null },
      knowledge_nodes: { data: { id: "n-any" }, error: null },
    });
    const res = await resyncCrmIntoBrain({ client: supabase as never, orgId: ORG });
    expect(res.syncedNodes).toBe(1);
    expect(res.errors).toBe(1);
  });
});
