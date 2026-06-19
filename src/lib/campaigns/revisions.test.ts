import { describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { requestAssetRevision } from "./revisions";

vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org-1",
    orgSlug: "org",
    orgName: "Org",
    workspaceId: "workspace-1",
    workspaceKey: "default",
    workspaceSlug: "default",
    workspaceName: "Default",
    role: null,
    userId: null,
    source: "default-org",
  })),
}));

function findCalls(supabase: { calls: Array<[string, ...unknown[]]> }, method: string) {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

describe("requestAssetRevision", () => {
  it("records a revision request without ever unlocking outbound", async () => {
    const supabase = createSupabaseQueryMock({
      approval_items: { data: { id: "appr-1", status: "pending_owner_approval" }, error: null },
      approval_decisions: { data: null, error: null },
      campaign_assets: { data: null, error: null },
      campaign_events: { data: null, error: null },
      agents: { data: { id: "agent-1" }, error: null },
      agent_tasks: { data: { id: "task-1" }, error: null },
      agent_task_inputs: { data: null, error: null },
    });

    const result = await requestAssetRevision(
      { campaignId: "camp-1", assetId: "asset-1", instruction: "make the email shorter", operator: "Operator" },
      supabase,
    );

    expect(result).toEqual({ approvalItemId: "appr-1", agentTaskId: "task-1" });

    const inserts = findCalls(supabase, "insert");
    const updates = findCalls(supabase, "update");

    // approval decision logged as revision_requested
    expect(inserts).toContainEqual(expect.objectContaining({ decision: "revision_requested", next_status: "revision_requested" }));
    // campaign event on the timeline
    expect(inserts).toContainEqual(expect.objectContaining({ event_type: "approval_decided" }));
    // Arc is queued with the right task type
    expect(inserts).toContainEqual(expect.objectContaining({ task_type: "campaign_asset_revision", status: "queued" }));

    // the asset is flipped to revision_requested...
    expect(updates).toContainEqual({ status: "revision_requested" });
    // ...and NOTHING in the whole sequence touches dispatch_locked / unlocks outbound
    for (const arg of [...inserts, ...updates]) {
      expect(arg).not.toHaveProperty("dispatch_locked");
      expect(arg).not.toHaveProperty("launch_locked");
    }
  });

  it("still records the transition when no Arc agent is registered", async () => {
    const supabase = createSupabaseQueryMock({
      approval_items: { data: { id: "appr-1", status: "pending_owner_approval" }, error: null },
      agents: { data: null, error: null },
    });

    const result = await requestAssetRevision(
      { campaignId: "camp-1", assetId: "asset-1", instruction: "shift tone to urgency", operator: "Operator" },
      supabase,
    );

    expect(result.agentTaskId).toBeNull();
    expect(result.approvalItemId).toBe("appr-1");
    // no agent task was queued
    expect(findCalls(supabase, "insert")).not.toContainEqual(
      expect.objectContaining({ task_type: "campaign_asset_revision" }),
    );
  });

  it("surfaces a clear error when a write fails", async () => {
    const supabase = createSupabaseQueryMock({
      approval_items: { data: { id: "appr-1", status: "pending_owner_approval" }, error: null },
      approval_decisions: { data: null, error: { message: "permission denied" } },
    });

    await expect(
      requestAssetRevision(
        { campaignId: "camp-1", assetId: "asset-1", instruction: "tighten the CTA", operator: "Operator" },
        supabase,
      ),
    ).rejects.toThrow(/approval_decisions insert failed: permission denied/);
  });
});
