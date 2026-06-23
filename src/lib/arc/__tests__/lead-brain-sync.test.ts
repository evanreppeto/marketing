import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/knowledge-graph/persistence", () => ({
  createNode: vi.fn(),
  createEdge: vi.fn(),
}));

import { createEdge, createNode } from "@/lib/knowledge-graph/persistence";

import { syncArcLeadToBrain } from "../lead-brain-sync";

const nodeMock = vi.mocked(createNode);
const edgeMock = vi.mocked(createEdge);

const client = {} as never;
const orgId = "org-1";

function acceptedResult() {
  return {
    ok: true as const,
    status: "accepted" as const,
    routing: "needs_review" as const,
    persona: "persona_plumbing_partner",
    classification: {} as never,
    scores: { leadScore: 42 } as never,
    normalizedInput: {} as never,
    attribution: {} as never,
  };
}

beforeEach(() => {
  nodeMock.mockReset();
  edgeMock.mockReset();
  // Hand back a deterministic id per node so edges can be drawn.
  let n = 0;
  nodeMock.mockImplementation(async (input) => ({ ok: true, id: `node-${input.refTable}-${++n}` }));
  edgeMock.mockResolvedValue({ ok: true, id: "edge-1" });
});

describe("syncArcLeadToBrain", () => {
  it("creates company, contact, and lead crm_ref nodes that reference the rows", async () => {
    await syncArcLeadToBrain({
      input: {
        persona: "persona_plumbing_partner",
        source: "arc_discovery",
        company: { name: "Halsted Plumbing", partnerTier: "B" },
        contact: { firstName: "Dana", lastName: "Lee" },
        lossSignals: [],
      } as never,
      result: acceptedResult(),
      persisted: { companyId: "co-1", contactId: "ct-1", propertyId: null, leadId: "ld-1" },
      client,
      orgId,
    });

    expect(nodeMock).toHaveBeenCalledTimes(3);
    const kinds = nodeMock.mock.calls.map((c) => c[0].kind);
    expect(kinds).toEqual(["crm_ref", "crm_ref", "crm_ref"]);

    const byTable = Object.fromEntries(nodeMock.mock.calls.map((c) => [c[0].refTable, c[0]]));
    expect(byTable.companies).toMatchObject({ key: "crm:companies:co-1", refId: "co-1", label: "Halsted Plumbing" });
    expect(byTable.contacts).toMatchObject({ key: "crm:contacts:ct-1", refId: "ct-1", label: "Dana Lee" });
    expect(byTable.leads).toMatchObject({ key: "crm:leads:ld-1", refId: "ld-1", persona: "persona_plumbing_partner" });

    // All written as Arc (gating handled inside createNode).
    expect(nodeMock.mock.calls.every((c) => c[1]?.createdBy === "arc")).toBe(true);
  });

  it("draws belongs_to + relates_to edges between the freshly created nodes", async () => {
    const res = await syncArcLeadToBrain({
      input: {
        persona: "persona_plumbing_partner",
        source: "arc_discovery",
        company: { name: "Acme" },
        contact: { email: "d@acme.com" },
        lossSignals: [],
      } as never,
      result: acceptedResult(),
      persisted: { companyId: "co-1", contactId: "ct-1", propertyId: null, leadId: "ld-1" },
      client,
      orgId,
    });

    const relations = edgeMock.mock.calls.map((c) => c[0].relation);
    expect(relations).toEqual(["belongs_to", "belongs_to", "relates_to"]);
    expect(res.edgeIds.length).toBe(3);
  });

  it("only creates the lead node when there is no company or contact", async () => {
    await syncArcLeadToBrain({
      input: { persona: "persona_plumbing_partner", source: "arc_manual", lossSignals: [] } as never,
      result: acceptedResult(),
      persisted: { companyId: null, contactId: null, propertyId: null, leadId: "ld-9" },
      client,
      orgId,
    });
    expect(nodeMock).toHaveBeenCalledTimes(1);
    expect(nodeMock.mock.calls[0][0].refTable).toBe("leads");
    expect(edgeMock).not.toHaveBeenCalled();
  });

  it("does not throw when a node write fails (best-effort)", async () => {
    nodeMock.mockResolvedValue({ ok: false, error: "duplicate key" });
    const res = await syncArcLeadToBrain({
      input: { persona: "persona_plumbing_partner", source: "arc_manual", company: { name: "Acme" }, lossSignals: [] } as never,
      result: acceptedResult(),
      persisted: { companyId: "co-1", contactId: null, propertyId: null, leadId: "ld-1" },
      client,
      orgId,
    });
    // No ids captured, no edges drawn, but the call resolved cleanly.
    expect(res.nodeIds).toEqual({ company: null, contact: null, lead: null });
    expect(edgeMock).not.toHaveBeenCalled();
  });
});
