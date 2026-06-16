import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import { claimChatTask, listQueuedChatTasks, reclaimStaleChatTasks } from "./inbox";

function calls(supabase: MockSupabase, method: string): Array<Record<string, unknown>> {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

function eqCalls(supabase: MockSupabase): Array<[string, ...unknown[]]> {
  return supabase.calls.filter(([m]) => m === "eq");
}

describe("claimChatTask", () => {
  it("atomically flips a queued chat task to running (claimed/processing)", async () => {
    const supabase = createSupabaseQueryMock({ agent_tasks: { data: { id: "t1" }, error: null } });

    const claimed = await claimChatTask("t1", supabase);

    expect(claimed).toBe(true);
    const update = calls(supabase, "update")[0];
    expect(update).toMatchObject({ status: "running" });
    expect(update.started_at).toEqual(expect.any(String));
    // Guarded on the task id AND a still-queued status so two workers can't both claim it.
    expect(eqCalls(supabase)).toContainEqual(["eq", "id", "t1"]);
    expect(eqCalls(supabase)).toContainEqual(["eq", "status", "queued"]);
  });

  it("reports not claimed when no queued row matched (already claimed elsewhere)", async () => {
    const supabase = createSupabaseQueryMock({ agent_tasks: { data: null, error: null } });

    const claimed = await claimChatTask("t1", supabase);

    expect(claimed).toBe(false);
  });
});

describe("listQueuedChatTasks", () => {
  it("only lists queued arc_chat_message tasks", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: {
        data: [{ id: "t1", objective: "hi", metadata: { conversation_id: "c1", message_id: "m1" }, created_at: "t" }],
        error: null,
      },
    });

    const items = await listQueuedChatTasks(20, supabase);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ agentTaskId: "t1", conversationId: "c1" });
    expect(eqCalls(supabase)).toContainEqual(["eq", "task_type", "arc_chat_message"]);
    expect(eqCalls(supabase)).toContainEqual(["eq", "status", "queued"]);
  });
});

describe("reclaimStaleChatTasks", () => {
  it("re-surfaces a running task past the cutoff and bumps its retry count", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: {
        data: [{ id: "t1", objective: "hi", metadata: { conversation_id: "c1" }, created_at: "t", retry_count: 1 }],
        error: null,
      },
    });

    const items = await reclaimStaleChatTasks({ staleMs: 1000, maxRetries: 3, limit: 20 }, supabase);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ agentTaskId: "t1", conversationId: "c1" });
    // Only stale (status='running', started_at < cutoff) tasks are considered.
    expect(eqCalls(supabase)).toContainEqual(["eq", "status", "running"]);
    expect(supabase.calls.some(([m, col]) => m === "lt" && col === "started_at")).toBe(true);
    // Re-stamp + bump retry without flipping status away from running.
    const restamp = calls(supabase, "update").find((u) => "retry_count" in u);
    expect(restamp).toMatchObject({ retry_count: 2 });
    expect(restamp?.started_at).toEqual(expect.any(String));
  });

  it("gives up on a task past the retry cap: fails the task and the pending bubble", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: {
        data: [{ id: "t1", objective: "hi", metadata: { conversation_id: "c1" }, created_at: "t", retry_count: 3 }],
        error: null,
      },
      arc_messages: {
        data: {
          id: "msg1",
          conversation_id: "c1",
          role: "arc",
          body: "",
          status: "pending",
          agent_task_id: "t1",
          mentions: [],
          metadata: {},
          created_at: "t",
        },
        error: null,
      },
    });

    const items = await reclaimStaleChatTasks({ staleMs: 1000, maxRetries: 3, limit: 20 }, supabase);

    expect(items).toHaveLength(0);
    // Both the task and its pending message are flipped to failed.
    expect(calls(supabase, "update").some((u) => u.status === "failed")).toBe(true);
  });
});
