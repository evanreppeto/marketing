import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/knowledge-graph/persistence", () => ({
  upsertReferenceNode: vi.fn(),
  upsertReferenceEdge: vi.fn(),
}));
import { upsertReferenceEdge, upsertReferenceNode } from "@/lib/knowledge-graph/persistence";
import {
  syncRecordToBrain,
  syncCrmRowToBrain,
  syncCrmRowEdges,
  resyncCrmIntoBrain,
  syncCampaignToBrain,
  syncCampaignRecordToBrain,
  resyncCampaignsIntoBrain,
} from "./sync";

const upsertMock = vi.mocked(upsertReferenceNode);
const edgeMock = vi.mocked(upsertReferenceEdge);
const ORG = "org-s-1";

beforeEach(() => {
  edgeMock.mockReset();
  edgeMock.mockResolvedValue({ ok: true, id: "e-1" });
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

describe("resyncCrmIntoBrain", () => {
  it("tallies synced rows across tables and ignores tables with no rows", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "n" });
    const supabase = createSupabaseQueryMock({
      companies: { data: [{ id: "c1" }, { id: "c2" }], error: null },
      leads: { data: [{ id: "l1" }], error: null },
      // contacts/properties/jobs/outcomes default to []
    });
    const res = await resyncCrmIntoBrain({ client: supabase as never, orgId: ORG });
    expect(res).toEqual({ ok: true, synced: 3, linked: 0, errors: 0, truncated: false });
  });

  it("sets ok:false when a table read errors, without aborting the loop", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "n" });
    const supabase = createSupabaseQueryMock({
      companies: { data: null, error: { message: "boom" } as never },
      leads: { data: [{ id: "l1" }], error: null },
    });
    const res = await resyncCrmIntoBrain({ client: supabase as never, orgId: ORG });
    expect(res.ok).toBe(false);
    expect(res.synced).toBe(1); // leads still processed
  });

  it("counts rows without a string id as errors, not synced", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "n" });
    const supabase = createSupabaseQueryMock({
      companies: { data: [{ id: "c1" }, { name: "no id" }], error: null },
    });
    const res = await resyncCrmIntoBrain({ client: supabase as never, orgId: ORG });
    expect(res.synced).toBe(1);
    expect(res.errors).toBe(1);
  });
});

describe("syncCrmRowEdges", () => {
  it("resolves both ends and upserts an edge per FK + persona", async () => {
    // knowledge_nodes lookup returns ids for every (kind,key) referenced by the lead.
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: {
        data: [
          { id: "n-lead", key: "crm:leads:l1" },
          { id: "n-co", key: "crm:companies:co1" },
          { id: "n-persona", key: "persona_landlord" },
        ],
        error: null,
      },
    });
    const res = await syncCrmRowEdges(
      "leads",
      { id: "l1", company_id: "co1", persona: "persona_landlord" },
      { client: supabase as never, orgId: ORG },
    );
    expect(res).toEqual({ linked: 2, skipped: 0 });
    expect(edgeMock).toHaveBeenCalledWith("n-lead", "n-co", "belongs_to", { client: expect.anything(), orgId: ORG });
    expect(edgeMock).toHaveBeenCalledWith("n-lead", "n-persona", "targets", { client: expect.anything(), orgId: ORG });
  });

  it("skips an edge whose target node doesn't exist yet (no edge written)", async () => {
    // Only the lead's own node resolves; the company node is missing.
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: { data: [{ id: "n-lead", key: "crm:leads:l1" }], error: null },
    });
    const res = await syncCrmRowEdges("leads", { id: "l1", company_id: "co1" }, { client: supabase as never, orgId: ORG });
    expect(res).toEqual({ linked: 0, skipped: 1 });
    expect(edgeMock).not.toHaveBeenCalled();
  });

  it("does nothing for a row with no FKs or persona", async () => {
    const supabase = createSupabaseQueryMock({});
    const res = await syncCrmRowEdges("companies", { id: "c1", name: "Acme" }, { client: supabase as never, orgId: ORG });
    expect(res).toEqual({ linked: 0, skipped: 0 });
    expect(edgeMock).not.toHaveBeenCalled();
  });
});

describe("syncCampaignToBrain", () => {
  it("builds a campaign_ref node from the row and upserts it", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "cn-1" });
    const res = await syncCampaignToBrain(
      { id: "cmp1", name: "Fall Push", persona: "persona_landlord", restoration_focus: "water" },
      { client: {} as never, orgId: ORG },
    );
    expect(res).toEqual({ ok: true, id: "cn-1" });
    const [input, deps] = upsertMock.mock.calls.at(-1)!;
    expect(input.kind).toBe("campaign_ref");
    expect(input.key).toBe("campaign:cmp1");
    expect(deps).toMatchObject({ orgId: ORG });
  });
});

describe("syncCampaignRecordToBrain", () => {
  it("reads the campaign org-scoped, upserts the node, then links persona + CRM edges", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "cn-2" });
    const supabase = createSupabaseQueryMock({
      campaigns: { data: { id: "cmp2", name: "Beta", persona: "persona_landlord", company_id: "co1" }, error: null },
      knowledge_nodes: {
        data: [
          { id: "cn-2", key: "campaign:cmp2" },
          { id: "pn", key: "persona_landlord" },
          { id: "con", key: "crm:companies:co1" },
        ],
        error: null,
      },
    });
    const res = await syncCampaignRecordToBrain("cmp2", { client: supabase as never, orgId: ORG });
    expect(res).toEqual({ ok: true, id: "cn-2" });
    expect(upsertMock.mock.calls.at(-1)![0].refId).toBe("cmp2");
    expect(edgeMock).toHaveBeenCalledWith("cn-2", "pn", "targets", { client: expect.anything(), orgId: ORG });
    expect(edgeMock).toHaveBeenCalledWith("cn-2", "con", "relates_to", { client: expect.anything(), orgId: ORG });
  });

  it("returns a soft error when the campaign is missing", async () => {
    const supabase = createSupabaseQueryMock({ campaigns: { data: null, error: null } });
    const res = await syncCampaignRecordToBrain("missing", { client: supabase as never, orgId: ORG });
    expect(res.ok).toBe(false);
  });
});

describe("resyncCampaignsIntoBrain", () => {
  it("syncs a node per campaign and links each campaign's persona edge", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "cn" });
    const supabase = createSupabaseQueryMock({
      campaigns: {
        data: [
          { id: "cmp1", persona: "persona_landlord" },
          { id: "cmp2", persona: "persona_hoa_board" },
        ],
        error: null,
      },
      knowledge_nodes: {
        data: [
          { id: "cn1", key: "campaign:cmp1" },
          { id: "p1", key: "persona_landlord" },
          { id: "cn2", key: "campaign:cmp2" },
          { id: "p2", key: "persona_hoa_board" },
        ],
        error: null,
      },
    });
    const res = await resyncCampaignsIntoBrain({ client: supabase as never, orgId: ORG });
    expect(res).toEqual({ ok: true, synced: 2, linked: 2, errors: 0, truncated: false });
  });
});
