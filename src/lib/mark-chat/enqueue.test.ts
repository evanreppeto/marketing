import { describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { enqueueMarkChatTask } from "./enqueue";

vi.mock("@/lib/agent/connection", () => ({
  resolveAgentConnection: vi.fn().mockResolvedValue({
    agentKey: "mark",
  }),
}));

describe("enqueueMarkChatTask", () => {
  it("persists Mark defaults as worker metadata on the queued task", async () => {
    const supabase = createSupabaseQueryMock({
      agents: { data: { id: "agent-1" }, error: null },
      agent_tasks: { data: { id: "task-1" }, error: null },
      agent_task_inputs: { data: null, error: null },
    });

    await enqueueMarkChatTask(
      {
        conversationId: "conversation-1",
        messageId: "message-1",
        message: "Draft a partner campaign.",
        mentions: [],
        operator: "Operator",
        route: "claude-opus-4-8",
        mode: "draft",
        command: "campaign",
        assistantTone: "friendly",
        assistantResponseStyle: "detailed",
        approvalStrictness: "strict",
      },
      supabase,
    );

    const taskInsert = supabase.calls.find(
      (call) => call[0] === "insert" && isRecord(call[1]) && call[1].task_type === "mark_chat_message",
    );

    expect(taskInsert?.[1]).toMatchObject({
      metadata: {
        model_route: "claude-opus-4-8",
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
