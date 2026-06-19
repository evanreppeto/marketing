import { describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { enqueueArcChatTask } from "./enqueue";

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

vi.mock("@/lib/agent/connection", () => ({
  resolveAgentConnection: vi.fn().mockResolvedValue({
    agentKey: "arc",
  }),
}));

describe("enqueueArcChatTask", () => {
  it("persists Arc defaults as worker metadata on the queued task", async () => {
    const supabase = createSupabaseQueryMock({
      agents: { data: { id: "agent-1" }, error: null },
      agent_tasks: { data: { id: "task-1" }, error: null },
      agent_task_inputs: { data: null, error: null },
    });

    await enqueueArcChatTask(
      {
        conversationId: "conversation-1",
        messageId: "message-1",
        message: "Draft a partner campaign.",
        mentions: [],
        operator: "Operator",
        route: "standard",
        mode: "draft",
        command: "campaign",
        assistantTone: "friendly",
        assistantResponseStyle: "detailed",
        approvalStrictness: "strict",
      },
      supabase,
    );

    const taskInsert = supabase.calls.find(
      (call) => call[0] === "insert" && isRecord(call[1]) && call[1].task_type === "arc_chat_message",
    );

    expect(taskInsert?.[1]).toMatchObject({
      org_id: "org-1",
      workspace_id: "workspace-1",
      metadata: {
        model_route: "standard",
        mode: "draft",
        assistant_tone: "friendly",
        response_style: "detailed",
        approval_strictness: "strict",
        command: "campaign",
        outbound_locked: true,
      },
    });
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
