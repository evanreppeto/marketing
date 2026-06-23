import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("./persistence", () => ({ createNode: vi.fn(), upsertReferenceEdge: vi.fn() }));
import { createNode, upsertReferenceEdge } from "./persistence";
import { proposeAudienceSegment } from "./audience";

const createNodeMock = vi.mocked(createNode);
const edgeMock = vi.mocked(upsertReferenceEdge);
const ORG = "org-a-1";

beforeEach(() => {
  createNodeMock.mockReset();
  edgeMock.mockReset();
  createNodeMock.mockResolvedValue({ ok: true, id: "seg-1" });
  edgeMock.mockResolvedValue({ ok: true, id: "e" });
});

describe("proposeAudienceSegment", () => {
  it("creates a proposed segment node (arc-authored) and links persona + only in-org evidence", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: [
        { data: { id: "persona-1" }, error: null }, // persona lookup
        { data: [{ id: "ev1" }], error: null }, // evidence verify — ev2 is foreign (absent)
      ],
    });
    const res = await proposeAudienceSegment(
      {
        label: "Flood-prone landlords",
        persona: "persona_landlord",
        criteria: "leads with flood loss in flood-zone properties",
        evidenceNodeIds: ["ev1", "ev2"],
      },
      { client: supabase as never, orgId: ORG },
    );

    expect(res).toEqual({ ok: true, nodeId: "seg-1", personaLinked: true, evidenceLinked: 1 });

    // Node is a `segment` (a gated kind → createNode lands it `proposed`), arc-authored.
    expect(createNodeMock.mock.calls[0]![0].kind).toBe("segment");
    expect(createNodeMock.mock.calls[0]![1]).toMatchObject({ orgId: ORG, createdBy: "arc" });

    // targets the persona, relates_to only the verified-in-org evidence id.
    expect(edgeMock).toHaveBeenCalledWith("seg-1", "persona-1", "targets", { client: expect.anything(), orgId: ORG });
    expect(edgeMock).toHaveBeenCalledWith("seg-1", "ev1", "relates_to", { client: expect.anything(), orgId: ORG });
    // The foreign id (ev2 — not in this org) is NEVER linked.
    expect(edgeMock).not.toHaveBeenCalledWith("seg-1", "ev2", "relates_to", expect.anything());
  });

  it("rejects a missing label before writing anything", async () => {
    const res = await proposeAudienceSegment({ label: "   " }, { client: {} as never, orgId: ORG });
    expect(res.ok).toBe(false);
    expect(createNodeMock).not.toHaveBeenCalled();
  });

  it("creates the node alone when no persona or evidence is supplied", async () => {
    const supabase = createSupabaseQueryMock({});
    const res = await proposeAudienceSegment(
      { label: "All homeowners" },
      { client: supabase as never, orgId: ORG },
    );
    expect(res).toEqual({ ok: true, nodeId: "seg-1", personaLinked: false, evidenceLinked: 0 });
    expect(edgeMock).not.toHaveBeenCalled();
  });

  it("propagates a node-creation failure", async () => {
    createNodeMock.mockResolvedValue({ ok: false, error: "validation failed" });
    const res = await proposeAudienceSegment({ label: "X" }, { client: {} as never, orgId: ORG });
    expect(res).toEqual({ ok: false, error: "validation failed" });
    expect(edgeMock).not.toHaveBeenCalled();
  });
});
