import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep the module's heavy imports inert; we only exercise the draft-decision path.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({
  requireOperator: vi.fn(async () => undefined),
  getOperatorActor: vi.fn(async () => "Operator"),
}));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/agent-tasks/scope", () => ({
  getCurrentAgentTaskTenantFields: vi.fn(async () => ({ orgId: "org-1", workspaceId: "ws-1" })),
}));
vi.mock("@/lib/campaigns/decisions", () => ({
  decideAsset: vi.fn(async () => ({ assetId: "a1", decision: "approved", status: "approved" })),
}));
vi.mock("@/lib/campaigns/revisions", () => ({
  requestAssetRevision: vi.fn(async () => ({ ok: true })),
}));

import { getOperatorActor } from "@/lib/auth/operator";
import { decideAsset } from "@/lib/campaigns/decisions";
import { requestAssetRevision } from "@/lib/campaigns/revisions";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { decideArcDraftAction, requestArcDraftRevisionAction } from "./actions";

const configuredMock = vi.mocked(isSupabaseAdminConfigured);
const decideMock = vi.mocked(decideAsset);
const reviseMock = vi.mocked(requestAssetRevision);

beforeEach(() => {
  vi.clearAllMocks();
  configuredMock.mockReturnValue(true);
  vi.mocked(getOperatorActor).mockResolvedValue("Operator");
});

afterEach(() => vi.clearAllMocks());

describe("decideArcDraftAction", () => {
  it("records an approval via decideAsset when a backend is configured", async () => {
    const result = await decideArcDraftAction({ campaignId: "c1", assetId: "a1", decision: "approved" });
    expect(result).toEqual({ ok: true, persisted: true, status: "approved" });
    expect(decideMock).toHaveBeenCalledWith(expect.objectContaining({ campaignId: "c1", assetId: "a1", decision: "approved" }));
  });

  it("rejects an unknown decision before writing", async () => {
    const result = await decideArcDraftAction({ campaignId: "c1", assetId: "a1", decision: "launched" });
    expect(result).toEqual({ ok: false, error: "Unknown decision." });
    expect(decideMock).not.toHaveBeenCalled();
  });

  it("returns a persisted:false preview when no backend is configured (offline/demo)", async () => {
    configuredMock.mockReturnValue(false);
    const result = await decideArcDraftAction({ campaignId: "c1", assetId: "a1", decision: "declined" });
    expect(result).toEqual({ ok: true, persisted: false, status: "declined" });
    expect(decideMock).not.toHaveBeenCalled();
  });

  it("requires the campaign reference", async () => {
    const result = await decideArcDraftAction({ campaignId: "", assetId: "a1", decision: "approved" });
    expect(result.ok).toBe(false);
    expect(decideMock).not.toHaveBeenCalled();
  });
});

describe("requestArcDraftRevisionAction", () => {
  it("requests a revision via requestAssetRevision when configured", async () => {
    const result = await requestArcDraftRevisionAction({ campaignId: "c1", assetId: "a1", instruction: "Make the subject shorter." });
    expect(result).toEqual({ ok: true, persisted: true, status: "revision_requested" });
    expect(reviseMock).toHaveBeenCalledWith(expect.objectContaining({ campaignId: "c1", assetId: "a1" }));
  });

  it("rejects an empty instruction before writing", async () => {
    const result = await requestArcDraftRevisionAction({ campaignId: "c1", assetId: "a1", instruction: "   " });
    expect(result.ok).toBe(false);
    expect(reviseMock).not.toHaveBeenCalled();
  });
});
