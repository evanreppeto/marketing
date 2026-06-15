import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import {
  appendAgentRunLog,
  blockAgentTask,
  claimAgentTask,
  completeAgentTask,
  listAgentTasks,
  moveAgentTask,
} from "../tasks";

const TASK_ID = "40000000-0000-4000-8000-000000000001";

function taskRow(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    agent_id: "a0000000-0000-4000-8000-000000000001",
    objective: "Draft partner campaign",
    status,
    priority: "high",
    campaign_id: null,
    approval_item_id: null,
    source_type: null,
    source_id: null,
    created_at: "2026-06-09T09:00:00.000Z",
    updated_at: "2026-06-09T10:00:00.000Z",
    metadata: {},
    agents: { key: "mark", name: "Mark" },
    ...extra,
  };
}

function updateCalls(supabase: ReturnType<typeof createSupabaseQueryMock>) {
  return supabase.calls.filter(([method]) => method === "update");
}

describe("listAgentTasks", () => {
  it("normalizes rows and applies the status filter", async () => {
    const supabase = createSupabaseQueryMock({ agent_tasks: { data: [taskRow("queued")], error: null } });

    const tasks = await listAgentTasks({ status: "queued" }, supabase);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: TASK_ID, status: "pending", assignee: "mark", outbound_locked: true });
    expect(supabase.calls).toContainEqual(["eq", "status", "queued"]);
    expect(supabase.calls).toContainEqual(["order", "updated_at", { ascending: false }]);
  });

  it("returns [] for an unknown assignee without querying tasks", async () => {
    const supabase = createSupabaseQueryMock({ agents: { data: null, error: null } });

    const tasks = await listAgentTasks({ assignee: "ghost" }, supabase);

    expect(tasks).toEqual([]);
    expect(supabase.calls).not.toContainEqual(["from", "agent_tasks"]);
  });
});

describe("claimAgentTask", () => {
  it("claims only a queued task (queued -> running)", async () => {
    const supabase = createSupabaseQueryMock({ agent_tasks: { data: taskRow("queued"), error: null } });

    const result = await claimAgentTask(TASK_ID, supabase);

    expect(result.ok).toBe(true);
    expect(updateCalls(supabase)).toContainEqual([
      "update",
      expect.objectContaining({ status: "running" }),
    ]);
  });

  it("returns conflict when the task is not queued", async () => {
    const supabase = createSupabaseQueryMock({ agent_tasks: { data: taskRow("running"), error: null } });

    const result = await claimAgentTask(TASK_ID, supabase);

    expect(result).toMatchObject({ ok: false, reason: "conflict", currentStatus: "running" });
    expect(updateCalls(supabase)).toHaveLength(0);
  });

  it("returns not_found when the task is missing", async () => {
    const supabase = createSupabaseQueryMock({ agent_tasks: { data: null, error: null } });

    const result = await claimAgentTask(TASK_ID, supabase);

    expect(result).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("completeAgentTask", () => {
  it("completes a non-terminal task and stamps completed_at", async () => {
    const supabase = createSupabaseQueryMock({ agent_tasks: { data: taskRow("running"), error: null } });

    const result = await completeAgentTask(TASK_ID, { summary: "done" }, supabase);

    expect(result.ok).toBe(true);
    const [, patch] = updateCalls(supabase)[0] as [string, Record<string, unknown>];
    expect(patch.status).toBe("completed");
    expect(patch.completed_at).toEqual(expect.any(String));
    expect((patch.metadata as Record<string, unknown>).completion_summary).toBe("done");
  });

  it("returns conflict for an already-terminal task", async () => {
    const supabase = createSupabaseQueryMock({ agent_tasks: { data: taskRow("completed"), error: null } });

    const result = await completeAgentTask(TASK_ID, {}, supabase);

    expect(result).toMatchObject({ ok: false, reason: "conflict" });
    expect(updateCalls(supabase)).toHaveLength(0);
  });
});

describe("blockAgentTask", () => {
  it("blocks the task, stores the reason in metadata, and appends a run-log", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: taskRow("running"), error: null },
      agent_run_logs: { data: { id: "log-1" }, error: null },
    });

    const result = await blockAgentTask(TASK_ID, { reason: "waiting on assets" }, supabase);

    expect(result.ok).toBe(true);
    const [, patch] = updateCalls(supabase)[0] as [string, Record<string, unknown>];
    expect(patch.status).toBe("blocked");
    expect((patch.metadata as Record<string, unknown>).blocked_reason).toBe("waiting on assets");
    expect(supabase.calls).toContainEqual(["from", "agent_run_logs"]);
  });
});

describe("appendAgentRunLog", () => {
  it("inserts into agent_run_logs and never updates agent_tasks", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: { agent_id: "a1" }, error: null },
      agent_run_logs: { data: { id: "log-9" }, error: null },
    });

    const result = await appendAgentRunLog(TASK_ID, { message: "progress" }, supabase);

    expect(result).toMatchObject({ ok: true, logId: "log-9" });
    expect(supabase.calls).toContainEqual(["from", "agent_run_logs"]);
    // Logging must NOT change task lifecycle state.
    expect(updateCalls(supabase)).toHaveLength(0);
  });

  it("returns not_found when the task is missing", async () => {
    const supabase = createSupabaseQueryMock({ agent_tasks: { data: null, error: null } });

    const result = await appendAgentRunLog(TASK_ID, { message: "x" }, supabase);

    expect(result).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("moveAgentTask", () => {
  it("rejects a move out of a terminal state without writing", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: taskRow("completed"), error: null },
    });

    const result = await moveAgentTask(TASK_ID, "queued", supabase);

    expect(result).toEqual({ ok: false, reason: "rejected", code: "terminal" });
    expect(updateCalls(supabase)).toHaveLength(0);
  });

  it("blocks completing a task that still has an open approval", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: taskRow("running", { approval_item_id: "ap1" }), error: null },
      approval_items: { data: { status: "pending_owner_approval" }, error: null },
    });

    const result = await moveAgentTask(TASK_ID, "completed", supabase);

    expect(result).toEqual({ ok: false, reason: "rejected", code: "open_approval" });
    expect(updateCalls(supabase)).toHaveLength(0);
  });

  it("allows completing a task whose approval is resolved (approved)", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: taskRow("running", { approval_item_id: "ap1" }), error: null },
      approval_items: { data: { status: "approved" }, error: null },
      agent_run_logs: { data: { id: "log-move-2" }, error: null },
    });

    const result = await moveAgentTask(TASK_ID, "completed", supabase);

    expect(result.ok).toBe(true);
    const [, patch] = updateCalls(supabase)[0] as [string, Record<string, unknown>];
    expect(patch).toMatchObject({ status: "completed" });
    expect(patch.completed_at).toEqual(expect.any(String));
    expect(supabase.calls).toContainEqual(["from", "agent_run_logs"]);
  });

  it("records the completed move with a valid agent_run_status enum value", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: taskRow("running"), error: null },
      agent_run_logs: { data: { id: "log-move-3" }, error: null },
    });

    const result = await moveAgentTask(TASK_ID, "completed", supabase);

    expect(result.ok).toBe(true);
    const VALID_RUN_STATUSES = new Set(["queued", "running", "completed", "failed", "canceled"]);
    const logInsert = supabase.calls.find(
      ([method, payload]) =>
        method === "insert" &&
        typeof payload === "object" &&
        payload !== null &&
        "run_status" in payload,
    ) as [string, { run_status: string }] | undefined;
    expect(logInsert).toBeDefined();
    expect(VALID_RUN_STATUSES.has(logInsert![1].run_status)).toBe(true);
  });

  it("performs an allowed move and records an audit log", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: taskRow("queued", { started_at: null }), error: null },
      agent_run_logs: { data: { id: "log-move-1" }, error: null },
    });

    const result = await moveAgentTask(TASK_ID, "running", supabase);

    expect(result.ok).toBe(true);
    const [, patch] = updateCalls(supabase)[0] as [string, Record<string, unknown>];
    expect(patch).toMatchObject({ status: "running" });
    expect(patch.started_at).toEqual(expect.any(String));
    expect(supabase.calls).toContainEqual(["from", "agent_run_logs"]);
  });

  it("returns not_found for a missing task", async () => {
    const supabase = createSupabaseQueryMock({ agent_tasks: { data: null, error: null } });

    const result = await moveAgentTask(TASK_ID, "running", supabase);

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("disambiguates the agents embed (agent_tasks has two FKs to agents)", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: taskRow("queued", { started_at: null }), error: null },
      agent_run_logs: { data: { id: "log-move-4" }, error: null },
    });

    await moveAgentTask(TASK_ID, "running", supabase);

    // Every agent_tasks read/update must name the relationship, or PostgREST
    // throws "more than one relationship was found for 'agent_tasks' and 'agents'".
    const selects = supabase.calls.filter(([m]) => m === "select").map(([, arg]) => String(arg));
    const agentEmbeds = selects.filter((s) => s.includes("agents"));
    expect(agentEmbeds.length).toBeGreaterThan(0);
    for (const s of agentEmbeds) {
      expect(s).toContain("agents!");
      expect(s).not.toMatch(/(^|[^!])agents\(/);
    }
  });

  it("treats a failed audit-log insert as best-effort (move still succeeds)", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: taskRow("queued", { started_at: null }), error: null },
      agent_run_logs: { data: null, error: { message: "run-log table offline" } },
    });

    const result = await moveAgentTask(TASK_ID, "running", supabase);

    // The status change is the source of truth and already persisted; a failed
    // audit-log insert must not throw or report the move as failed.
    expect(result.ok).toBe(true);
    const [, patch] = updateCalls(supabase)[0] as [string, Record<string, unknown>];
    expect(patch).toMatchObject({ status: "running" });
  });
});
