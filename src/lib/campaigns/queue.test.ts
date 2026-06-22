import { describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { queueCampaignBuildTask } from "./queue";

vi.mock("@/lib/arc-chat/notify", () => ({
  notifyArcCampaignTask: vi.fn(async () => true),
}));

vi.mock("@/lib/arc-chat/persistence", () => ({
  insertPendingArcMessage: vi.fn(async () => ({})),
}));

describe("queueCampaignBuildTask", () => {
  it("inserts a campaign_brief_draft task, creates a pending chat reply, and wakes Arc", async () => {
    const { notifyArcCampaignTask } = await import("@/lib/arc-chat/notify");
    const { insertPendingArcMessage } = await import("@/lib/arc-chat/persistence");
    const supabase = createSupabaseQueryMock({
      agents: { data: { id: "agent-1" }, error: null },
      agent_tasks: { data: { id: "task-1" }, error: null },
    });

    const taskId = await queueCampaignBuildTask(
      {
        agentName: "Arc",
        campaignId: "campaign-1",
        conversationId: "conversation-1",
        operator: "Operator",
        prompt: "Draft campaign pieces.",
        tenant: { org_id: "org-1", workspace_id: "workspace-1" },
      },
      supabase,
    );

    expect(taskId).toBe("task-1");
    expect(supabase.calls).toContainEqual(["from", "agent_tasks"]);
    expect(supabase.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        task_type: "campaign_brief_draft",
        campaign_id: "campaign-1",
        source_type: "campaign_directive",
        source_id: "campaign-1",
        org_id: "org-1",
        workspace_id: "workspace-1",
      }),
    ]);
    expect(insertPendingArcMessage).toHaveBeenCalledWith(
      { conversationId: "conversation-1", agentTaskId: "task-1" },
      supabase,
    );
    expect(notifyArcCampaignTask).toHaveBeenCalledWith(
      expect.objectContaining({
        agentTaskId: "task-1",
        campaignId: "campaign-1",
        conversationId: "conversation-1",
        message: "Draft campaign pieces.",
        taskType: "campaign_brief_draft",
      }),
    );
  });
});
