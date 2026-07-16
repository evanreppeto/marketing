import { describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { decideApprovalItem } from "./decisions";

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

const approvalItemId = "10000000-0000-4000-8000-000000000001";
const campaignId = "10000000-0000-4000-8000-000000000002";
const campaignAssetId = "10000000-0000-4000-8000-000000000003";

const orgId = "10000000-0000-4000-8000-0000000000ff";

const approvalItemRow = {
  id: approvalItemId,
  org_id: orgId,
  status: "pending_owner_approval",
  campaign_id: campaignId,
  campaign_asset_id: campaignAssetId,
  draft_output: "Draft from approval item",
  edited_output: null,
  item_type: "email_campaign_asset",
};

const campaignAssetRow = {
  id: campaignAssetId,
  status: "pending_approval",
  draft_body: "Draft from asset",
  edited_body: null,
  approved_body: null,
};

describe("decideApprovalItem", () => {
  it("approves an item, records a decision, updates the asset, and logs a campaign event", async () => {
    const supabase = createSupabaseQueryMock({
      approval_items: { data: approvalItemRow, error: null },
      campaign_assets: { data: campaignAssetRow, error: null },
      approval_decisions: { data: [], error: null },
      campaigns: { data: [], error: null },
      campaign_events: { data: [], error: null },
    });

    const result = await decideApprovalItem(
      {
        approvalItemId,
        action: "approve",
        reviewer: "Evan",
        notes: "Looks good.",
        editedOutput: "Edited final copy",
      },
      supabase,
    );

    expect(result).toMatchObject({
      approvalItemId,
      previousStatus: "pending_owner_approval",
      nextStatus: "approved",
      action: "approve",
    });
    expect(supabase.calls).toContainEqual(["from", "approval_items"]);
    expect(supabase.calls).toContainEqual(["eq", "id", approvalItemId]);
    expect(supabase.calls).toContainEqual([
      "update",
      expect.objectContaining({
        status: "approved",
        reviewed_by: "Evan",
        decision_notes: "Looks good.",
        edited_output: "Edited final copy",
      }),
    ]);
    expect(supabase.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        org_id: orgId,
        approval_item_id: approvalItemId,
        decision: "approved",
        previous_status: "pending_owner_approval",
        next_status: "approved",
      }),
    ]);
    expect(supabase.calls).toContainEqual([
      "update",
      expect.objectContaining({
        status: "approved",
        approved_by: "Evan",
        approved_body: "Edited final copy",
        dispatch_locked: false,
      }),
    ]);
    expect(supabase.calls).toContainEqual([
      "update",
      expect.objectContaining({
        status: "approved",
        launch_locked: true,
      }),
    ]);
    // org_id is NOT NULL with no column default: the event must carry the
    // approval item's org or the insert fails outright.
    expect(supabase.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        org_id: orgId,
        campaign_id: campaignId,
        event_type: "approval_decided",
      }),
    ]);
  });

  it("queues a revision task when revision is requested and Arc demo agent exists", async () => {
    const supabase = createSupabaseQueryMock({
      approval_items: { data: approvalItemRow, error: null },
      campaign_assets: { data: campaignAssetRow, error: null },
      approval_decisions: { data: [], error: null },
      campaigns: { data: [], error: null },
      campaign_events: { data: [], error: null },
      agents: { data: { id: "10000000-0000-4000-8000-000000000004" }, error: null },
      agent_tasks: { data: [], error: null },
    });

    await decideApprovalItem(
      {
        approvalItemId,
        action: "revise",
        reviewer: "Evan",
        notes: "Make it more direct.",
      },
      supabase,
    );

    expect(supabase.calls).toContainEqual(["eq", "key", "arc-demo"]);
    expect(supabase.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        status: "queued",
        task_type: "approval_revision",
        source_type: "approval_item",
        source_id: approvalItemId,
      }),
    ]);
  });

  it("throws when the approval item id is not a UUID", async () => {
    const supabase = createSupabaseQueryMock({});

    await expect(
      decideApprovalItem(
        {
          approvalItemId: "bad-id",
          action: "approve",
        },
        supabase,
      ),
    ).rejects.toThrow(/valid UUID/);
  });

  it("throws when the approval item cannot be found", async () => {
    const supabase = createSupabaseQueryMock({
      approval_items: { data: null, error: null },
    });

    await expect(
      decideApprovalItem(
        {
          approvalItemId,
          action: "approve",
        },
        supabase,
      ),
    ).rejects.toThrow(/item not found/);
  });
});
