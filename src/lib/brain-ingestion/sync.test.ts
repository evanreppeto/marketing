import { describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/knowledge-graph/persistence", () => ({ upsertReferenceNode: vi.fn() }));
import { upsertReferenceNode } from "@/lib/knowledge-graph/persistence";
import { syncRecordToBrain, syncCrmRowToBrain } from "./sync";

const upsertMock = vi.mocked(upsertReferenceNode);
const ORG = "org-s-1";

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
