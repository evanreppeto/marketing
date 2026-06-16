# Arc Kanban Board Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only task table at `/agent-operations` with a shared Kanban board (swimlanes per agent, 5 lifecycle columns) where the operator can create free-form tasks and drag cards to change task state immediately, with guardrails that never bypass the outbound-approval gate.

**Architecture:** Pure transition logic lives in `src/domain/arc-tasks.ts` (unit-tested). Persistence (`moveAgentTask`) extends the existing `src/lib/arc-api/tasks.ts` lifecycle layer. Operator-facing mutations are `requireOperator()`-gated server actions in `src/app/agent-operations/actions.ts`. The board itself is a client component that calls those actions and refreshes. No core schema change — the board is backed by the existing `agent_tasks` table.

**Tech Stack:** Next.js 16 (React 19) server components + server actions, Supabase admin client, Vitest. Drag uses native HTML5 drag-and-drop (no new dependency).

**Scope note:** The scheduler (`task_schedules` table, `computeDueSchedules`, cron route, schedule UI) is **Plan 2** — a separate document. This plan ships a complete, usable board without it. The "Schedule" button is rendered but disabled (wired in Plan 2).

**Spec:** `docs/superpowers/specs/2026-06-10-arc-kanban-board-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/domain/arc-tasks.ts` | Add `canOperatorMoveTask` + drag transition map | Modify |
| `src/domain/__tests__/arc-tasks.test.ts` | Tests for the above | Modify |
| `src/lib/arc-api/tasks.ts` | Add `moveAgentTask` persistence | Modify |
| `src/lib/arc-api/__tests__/tasks.test.ts` | Tests for `moveAgentTask` | Modify |
| `src/app/agent-operations/actions.ts` | Add `moveTaskAction`, generalize creation to `createTaskAction` | Modify |
| `src/app/agent-operations/task-kanban-board.tsx` | Kanban UI: swimlanes, columns, cards, drag | Create |
| `src/app/agent-operations/board-view-switch.tsx` | Board/Table client toggle wrapper | Create |
| `src/app/agent-operations/new-task-dialog.tsx` | Free-form "+ New task" modal | Create |
| `src/app/agent-operations/page.tsx` | Render the switch instead of the bare table | Modify |

---

## Task 1: Operator drag-transition logic (domain)

**Files:**
- Modify: `src/domain/arc-tasks.ts`
- Test: `src/domain/__tests__/arc-tasks.test.ts`

The rules: an operator may drag a task between lifecycle columns, but (a) terminal states (`completed`/`failed`/`canceled`) are immovable, (b) a card cannot move **into** `completed` while it has an open approval item, and (c) moving **out of** `needs_approval` may go to `queued`/`running`/`blocked`/`canceled` but **never** straight to `completed` (the approval gate lives in `/approvals`, not the board).

- [ ] **Step 1: Write the failing test**

Add to the bottom of `src/domain/__tests__/arc-tasks.test.ts`:

```ts
import { canOperatorMoveTask } from "../arc-tasks";

describe("canOperatorMoveTask", () => {
  it("allows ordinary lifecycle drags", () => {
    expect(canOperatorMoveTask("queued", "running", { hasOpenApproval: false })).toEqual({ ok: true });
    expect(canOperatorMoveTask("blocked", "queued", { hasOpenApproval: false })).toEqual({ ok: true });
    expect(canOperatorMoveTask("running", "completed", { hasOpenApproval: false })).toEqual({ ok: true });
  });

  it("never moves a task out of a terminal state", () => {
    for (const from of ["completed", "failed", "canceled"] as const) {
      expect(canOperatorMoveTask(from, "queued", { hasOpenApproval: false })).toEqual({
        ok: false,
        reason: "terminal",
      });
    }
  });

  it("blocks completing a task that still has an open approval", () => {
    expect(canOperatorMoveTask("running", "completed", { hasOpenApproval: true })).toEqual({
      ok: false,
      reason: "open_approval",
    });
  });

  it("forbids dragging straight from needs_approval to completed", () => {
    expect(canOperatorMoveTask("needs_approval", "completed", { hasOpenApproval: false })).toEqual({
      ok: false,
      reason: "approval_gate",
    });
  });

  it("allows releasing a needs_approval task back into the workflow", () => {
    expect(canOperatorMoveTask("needs_approval", "queued", { hasOpenApproval: false })).toEqual({ ok: true });
    expect(canOperatorMoveTask("needs_approval", "canceled", { hasOpenApproval: false })).toEqual({ ok: true });
  });

  it("rejects an unknown / same-column target", () => {
    expect(canOperatorMoveTask("queued", "queued", { hasOpenApproval: false })).toEqual({
      ok: false,
      reason: "no_change",
    });
    expect(canOperatorMoveTask("queued", "banana", { hasOpenApproval: false })).toEqual({
      ok: false,
      reason: "invalid_target",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/arc-tasks.test.ts`
Expected: FAIL — `canOperatorMoveTask is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/domain/arc-tasks.ts`:

```ts
/** Columns an operator can drop a card into (Closed tray = canceled). */
export const OPERATOR_DROP_TARGETS = [
  "queued",
  "running",
  "blocked",
  "needs_approval",
  "completed",
  "canceled",
] as const;
export type OperatorDropTarget = (typeof OPERATOR_DROP_TARGETS)[number];

const OPERATOR_TERMINAL = new Set(["completed", "failed", "canceled"]);

export type MoveCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "terminal" | "no_change" | "invalid_target" | "open_approval" | "approval_gate";
    };

/**
 * Decide whether an operator drag from `from` to `to` is allowed. Pure: the
 * caller supplies `hasOpenApproval` (whether the task's linked approval item is
 * still open). Guardrails: terminal tasks are immovable; a task with an open
 * approval cannot be completed; a needs_approval task can never be dragged
 * straight to completed (approval happens in /approvals, not the board).
 */
export function canOperatorMoveTask(
  from: string,
  to: string,
  opts: { hasOpenApproval: boolean },
): MoveCheckResult {
  if (!(OPERATOR_DROP_TARGETS as readonly string[]).includes(to)) {
    return { ok: false, reason: "invalid_target" };
  }
  if (from === to) {
    return { ok: false, reason: "no_change" };
  }
  if (OPERATOR_TERMINAL.has(from)) {
    return { ok: false, reason: "terminal" };
  }
  if (from === "needs_approval" && to === "completed") {
    return { ok: false, reason: "approval_gate" };
  }
  if (to === "completed" && opts.hasOpenApproval) {
    return { ok: false, reason: "open_approval" };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/arc-tasks.test.ts`
Expected: PASS (all `canOperatorMoveTask` cases green).

- [ ] **Step 5: Commit**

```bash
git add src/domain/arc-tasks.ts src/domain/__tests__/arc-tasks.test.ts
git commit -m "feat(arc): operator drag-transition rules for the task board"
```

---

## Task 2: `moveAgentTask` persistence

**Files:**
- Modify: `src/lib/arc-api/tasks.ts`
- Test: `src/lib/arc-api/__tests__/tasks.test.ts`

Mirrors `claimAgentTask`/`blockAgentTask`: read row → resolve `hasOpenApproval` from the linked approval item → check `canOperatorMoveTask` → update status (+ timestamps) → write an `agent_run_logs` audit entry.

- [ ] **Step 1: Write the failing test**

Open `src/lib/arc-api/__tests__/tasks.test.ts`, look at the top to reuse its existing Supabase mock helper style, then add this block (it uses the same fake-client shape the file already uses for `claimAgentTask`; if the file builds a fresh stub per test, follow that local pattern instead):

```ts
import { moveAgentTask } from "../tasks";

describe("moveAgentTask", () => {
  it("rejects a move out of a terminal state without writing", async () => {
    const client = makeClient({
      taskRow: { id: "t1", agent_id: "a1", status: "completed", metadata: {}, approval_item_id: null },
    });
    const result = await moveAgentTask("t1", "queued", client);
    expect(result).toEqual({ ok: false, reason: "rejected", code: "terminal" });
    expect(client.updates).toHaveLength(0);
  });

  it("blocks completing a task that still has an open approval", async () => {
    const client = makeClient({
      taskRow: { id: "t1", agent_id: "a1", status: "running", metadata: {}, approval_item_id: "ap1" },
      approvalStatus: "needs_review",
    });
    const result = await moveAgentTask("t1", "completed", client);
    expect(result).toEqual({ ok: false, reason: "rejected", code: "open_approval" });
  });

  it("performs an allowed move and records an audit log", async () => {
    const client = makeClient({
      taskRow: { id: "t1", agent_id: "a1", status: "queued", metadata: {}, approval_item_id: null },
    });
    const result = await moveAgentTask("t1", "running", client);
    expect(result.ok).toBe(true);
    expect(client.updates[0]).toMatchObject({ status: "running" });
    expect(client.runLogInserts).toHaveLength(1);
  });

  it("returns not_found for a missing task", async () => {
    const client = makeClient({ taskRow: null });
    expect(await moveAgentTask("missing", "running", client)).toEqual({ ok: false, reason: "not_found" });
  });
});
```

If `tasks.test.ts` does not already export a reusable `makeClient`, add this helper near the top of the file (it models only the calls `moveAgentTask` makes):

```ts
function makeClient(opts: {
  taskRow: Record<string, unknown> | null;
  approvalStatus?: string;
}) {
  const updates: Record<string, unknown>[] = [];
  const runLogInserts: Record<string, unknown>[] = [];
  const client = {
    updates,
    runLogInserts,
    from(table: string) {
      if (table === "agent_tasks") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.taskRow, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { ...(opts.taskRow ?? {}), ...patch, agents: { key: "arc", name: "Arc" } },
                    error: null,
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === "approval_items") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { status: opts.approvalStatus ?? "approved" }, error: null }),
            }),
          }),
        };
      }
      if (table === "agent_run_logs") {
        return {
          insert: async (row: Record<string, unknown>) => {
            runLogInserts.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return client as unknown as import("@supabase/supabase-js").SupabaseClient & {
    updates: Record<string, unknown>[];
    runLogInserts: Record<string, unknown>[];
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/arc-api/__tests__/tasks.test.ts`
Expected: FAIL — `moveAgentTask is not exported`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/arc-api/tasks.ts`. Import `canOperatorMoveTask` and `type OperatorDropTarget` from `@/domain` (add them to the existing import from `@/domain` at the top). Then:

```ts
const OPEN_APPROVAL_STATUSES = new Set([
  "needs_compliance",
  "needs_review",
  "pending_approval",
  "pending_owner_approval",
  "revision_requested",
]);

export type MoveTaskResult =
  | { ok: true; task: NormalizedTask }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "rejected"; code: string };

async function hasOpenApproval(
  approvalItemId: string | null,
  client: SupabaseClient,
): Promise<boolean> {
  if (!approvalItemId) return false;
  const { data, error } = await client
    .from("approval_items")
    .select("status")
    .eq("id", approvalItemId)
    .maybeSingle();
  if (error) {
    throw new Error(`approval_items lookup failed: ${error.message}`);
  }
  const status = (data as { status: string | null } | null)?.status ?? null;
  return status !== null && OPEN_APPROVAL_STATUSES.has(status);
}

/**
 * Operator-driven board move (drag = immediate state change). Validates the
 * transition with the pure domain rule, applies status + timestamp updates,
 * and records an audit entry on the run-log timeline. Never touches approval
 * decisions or outbound locks.
 */
export async function moveAgentTask(
  taskId: string,
  toStatus: OperatorDropTarget,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MoveTaskResult> {
  const row = await readTaskRow(taskId, client);
  if (!row) return { ok: false, reason: "not_found" };

  const openApproval = await hasOpenApproval(row.approval_item_id, client);
  const check = canOperatorMoveTask(row.status ?? "queued", toStatus, { hasOpenApproval: openApproval });
  if (!check.ok) {
    return { ok: false, reason: "rejected", code: check.reason };
  }

  const patch: Record<string, unknown> = { status: toStatus };
  if (toStatus === "running" && !row.metadata?.started_at) patch.started_at = new Date().toISOString();
  if (toStatus === "completed") patch.completed_at = new Date().toISOString();

  const task = await updateAndNormalize(taskId, patch, client);

  const { error: logError } = await client.from("agent_run_logs").insert({
    task_id: taskId,
    agent_id: row.agent_id,
    run_status: toStatus === "completed" ? "succeeded" : "running",
    reasoning_summary: `Operator moved task to ${toStatus} from the board.`,
    metadata: { source: "operator_board_move", from_status: row.status, to_status: toStatus },
  });
  if (logError) {
    throw new Error(`move run-log insert failed: ${logError.message}`);
  }

  return { ok: true, task };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/arc-api/__tests__/tasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/arc-api/tasks.ts src/lib/arc-api/__tests__/tasks.test.ts
git commit -m "feat(arc): moveAgentTask persistence with approval guardrails"
```

---

## Task 3: `moveTaskAction` server action

**Files:**
- Modify: `src/app/agent-operations/actions.ts`

A thin, `requireOperator()`-gated wrapper the board calls on drop. Returns a serializable result so the client can snap a card back on rejection.

- [ ] **Step 1: Add the action**

Append to `src/app/agent-operations/actions.ts` (the file already imports `requireOperator`, `getSupabaseAdminClient`, `isSupabaseAdminConfigured`, and `revalidatePath`). Add an import for the persistence + type:

```ts
import { moveAgentTask } from "@/lib/arc-api";
import { type OperatorDropTarget, OPERATOR_DROP_TARGETS } from "@/domain";
```

Then add:

```ts
export type MoveTaskActionResult =
  | { ok: true; status: OperatorDropTarget }
  | { ok: false; message: string };

export async function moveTaskAction(taskId: string, toStatus: string): Promise<MoveTaskActionResult> {
  await requireOperator();

  if (!(OPERATOR_DROP_TARGETS as readonly string[]).includes(toStatus)) {
    return { ok: false, message: "That column is not a valid drop target." };
  }
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const result = await moveAgentTask(taskId, toStatus as OperatorDropTarget);
  if (!result.ok) {
    const message =
      result.reason === "not_found"
        ? "Task no longer exists."
        : result.code === "open_approval"
          ? "Resolve the approval in Activity before completing this task."
          : result.code === "approval_gate"
            ? "Approve this in Activity — it can't be completed straight from the board."
            : "That move isn't allowed.";
    return { ok: false, message };
  }

  revalidatePath("/agent-operations");
  revalidatePath("/");
  return { ok: true, status: toStatus as OperatorDropTarget };
}
```

(If `moveAgentTask` is not yet re-exported from `@/lib/arc-api`, add `export * from "./tasks";`-style re-export — check `src/lib/arc-api/index.ts` and add `moveAgentTask` to its exports if it lists names explicitly.)

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm lint`
Expected: no new errors referencing `moveTaskAction`.

- [ ] **Step 3: Commit**

```bash
git add src/app/agent-operations/actions.ts src/lib/arc-api/index.ts
git commit -m "feat(arc): moveTaskAction operator-gated board move"
```

---

## Task 4: Free-form `createTaskAction`

**Files:**
- Modify: `src/app/agent-operations/actions.ts`

Generalize creation beyond the 3 templates. Keep the templates as quick-fill presets (`taskKey` optional); accept free-form `objective`, `priority`, `taskType`. Reuse `ensureMarkAgent()` already in the file.

- [ ] **Step 1: Add the action**

Append to `src/app/agent-operations/actions.ts`:

```ts
const ALLOWED_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

export async function createTaskAction(formData: FormData): Promise<void> {
  await requireOperator();

  const objective = String(formData.get("objective") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "medium").trim().toLowerCase();
  const taskType = String(formData.get("taskType") ?? "operator_task").trim() || "operator_task";
  const priority = ALLOWED_PRIORITIES.has(priorityRaw) ? priorityRaw : "medium";

  if (objective.length === 0) {
    redirect("/agent-operations?action=arc-task-error");
  }
  if (!isSupabaseAdminConfigured()) {
    redirect("/agent-operations?action=not-configured");
  }

  const supabase = getSupabaseAdminClient();
  const agentId = await ensureMarkAgent();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("agent_tasks")
    .insert({
      agent_id: agentId,
      status: "queued",
      priority,
      objective,
      task_type: taskType,
      source_type: "operator_request",
      metadata: {
        runner_name: "Arc",
        requested_from: "agent_operations_board",
        requested_at: now,
        human_approval_required: true,
        outbound_dispatch_allowed: false,
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(`agent_tasks insert failed: ${error.message}`);
  }

  await supabase.from("agent_run_logs").insert({
    task_id: data.id,
    agent_id: agentId,
    run_status: "queued",
    reasoning_summary: "Task queued from the board. External runner has not picked it up yet.",
    metadata: { runner_name: "Arc", source: "operator_board_create" },
  });

  revalidatePath("/agent-operations");
  revalidatePath("/");
  redirect(`/agent-operations?action=arc-task-created&task=${data.id}`);
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/agent-operations/actions.ts
git commit -m "feat(arc): free-form createTaskAction for the board"
```

---

## Task 5: Kanban board client component

**Files:**
- Create: `src/app/agent-operations/task-kanban-board.tsx`

Swimlanes per agent, 5 columns + a Closed tray, native HTML5 drag. On drop it calls `moveTaskAction`; on rejection it shows the message and refreshes (the server is the source of truth, so `router.refresh()` snaps the card back).

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { moveTaskAction } from "./actions";
import { StatusPill } from "../_components/page-header";
import { type AgentOperationsAgent, type AgentOperationsTask } from "@/lib/agent-operations/read-model";

const COLUMNS: Array<{ key: string; label: string }> = [
  { key: "queued", label: "Queued" },
  { key: "running", label: "Running" },
  { key: "blocked", label: "Blocked" },
  { key: "needs_approval", label: "Needs approval" },
  { key: "completed", label: "Completed" },
];

const CLOSED_STATUSES = new Set(["failed", "canceled"]);

function priorityTone(p: string) {
  if (/high|urgent/i.test(p)) return "amber" as const;
  return "gray" as const;
}

export function TaskKanbanBoard({
  agents,
  tasks,
}: {
  agents: AgentOperationsAgent[];
  tasks: AgentOperationsTask[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // Group agents that actually have a key; the read-model agents carry `key`.
  const lanes = agents.length > 0 ? agents : inferLanes(tasks);

  function onDrop(toStatus: string) {
    const taskId = dragId;
    setDragId(null);
    if (!taskId) return;
    setError(null);
    startTransition(async () => {
      const result = await moveTaskAction(taskId, toStatus);
      if (!result.ok) setError(result.message);
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden">
      {error ? (
        <div className="border-b border-[var(--priority-border)] bg-[var(--priority-soft)] px-5 py-2 text-sm font-semibold text-[var(--priority-text)]">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        {lanes.map((lane) => {
          const laneTasks = tasks.filter((t) => t.agentKey === lane.key);
          const closed = laneTasks.filter((t) => CLOSED_STATUSES.has(t.status));
          return (
            <div className="border-b border-[var(--border-hairline)]" key={lane.key}>
              <div className="flex items-center gap-2 bg-[var(--surface-inset)] px-5 py-2.5">
                <span className="h-2 w-2 rounded-full bg-[var(--ok)] shadow-[0_0_0_3px_var(--ok-soft)]" />
                <span className="text-[13px] font-extrabold text-[var(--text-primary)]">{lane.name}</span>
                <span className="text-[11px] font-medium text-[var(--text-muted)]">· outbound locked</span>
              </div>

              <div className="grid min-w-[1000px] grid-cols-5">
                {COLUMNS.map((col) => {
                  const cards = laneTasks.filter((t) => t.status === col.key);
                  return (
                    <div
                      className="min-h-[150px] border-r border-[var(--border-hairline)] bg-[var(--canvas)] p-2.5 last:border-r-0"
                      key={col.key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(col.key)}
                    >
                      <div
                        className={`mb-2.5 flex items-center justify-between text-[10.5px] font-extrabold uppercase tracking-wider ${
                          col.key === "needs_approval" ? "text-[var(--accent-strong)]" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        <span>{col.label}</span>
                        <span className="rounded-full bg-[var(--surface-raised)] px-1.5 text-[10px]">{cards.length}</span>
                      </div>

                      {cards.map((task) => (
                        <article
                          className={`mb-2 cursor-grab rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2.5 ${
                            pending && dragId === task.fullId ? "opacity-50" : ""
                          }`}
                          draggable
                          key={task.fullId}
                          onDragStart={() => setDragId(task.fullId)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => router.push(task.href)}
                        >
                          <div className="text-[12.5px] font-semibold leading-snug text-[var(--text-primary)]">
                            {task.objective}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {task.risk ? <StatusPill tone={riskTone(task.risk)}>Risk·{task.risk}</StatusPill> : null}
                            {task.linkedObject && task.linkedObject !== "No linked record" ? (
                              <span className="rounded border border-[var(--border-panel)] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                                {task.linkedObject}
                              </span>
                            ) : null}
                            {task.approval && /approval/i.test(task.approval) ? (
                              <span className="text-[10px] font-extrabold text-[var(--accent-strong)]">⬢ Outbound</span>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  );
                })}
              </div>

              {closed.length > 0 ? (
                <div className="bg-[var(--surface-soft)] px-5 py-2 text-[11px] font-semibold text-[var(--text-muted)]">
                  ▾ Closed (failed · canceled): {closed.length}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function riskTone(risk: string) {
  if (/high|blocked/i.test(risk)) return "red" as const;
  if (/medium|warn/i.test(risk)) return "amber" as const;
  return "green" as const;
}

/** Fallback when the agents list is empty: derive lanes from the tasks. */
function inferLanes(tasks: AgentOperationsTask[]): AgentOperationsAgent[] {
  const seen = new Map<string, string>();
  for (const t of tasks) {
    if (!seen.has(t.agentKey)) seen.set(t.agentKey, t.agentName);
  }
  return [...seen.entries()].map(([key, name]) => ({
    key,
    name,
    purpose: "",
    status: "",
    currentTask: "",
    riskFlags: [],
    href: `/agent-operations/${key}`,
  }));
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm lint`
Expected: no new errors. (If `StatusPill` tone values differ, match the union already exported by `page-header.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/agent-operations/task-kanban-board.tsx
git commit -m "feat(arc): Kanban board component with swimlanes and drag"
```

---

## Task 6: New-task dialog + Board/Table switch

**Files:**
- Create: `src/app/agent-operations/new-task-dialog.tsx`
- Create: `src/app/agent-operations/board-view-switch.tsx`

- [ ] **Step 1: Create the new-task dialog**

`src/app/agent-operations/new-task-dialog.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

import { createTaskAction } from "./actions";
import { buttonClasses } from "../_components/page-header";

export function NewTaskDialog() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button className={buttonClasses({ variant: "primary" })} onClick={() => setOpen(true)} type="button">
        + New task
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
          onClick={() => setOpen(false)}
        >
          <form
            action={createTaskAction}
            className="w-full max-w-md rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-5 shadow-[var(--elev-raised)]"
            onClick={(e) => e.stopPropagation()}
            ref={formRef}
          >
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">New task for Arc</h2>
            <label className="mt-4 block text-sm font-semibold text-[var(--text-secondary)]">
              Objective
              <textarea
                className="mt-1 h-24 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2 text-sm text-[var(--text-primary)]"
                name="objective"
                placeholder="Enrich 20 plumbing partner leads in 606xx ZIPs…"
                required
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-[var(--text-secondary)]">
              Priority
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2 text-sm text-[var(--text-primary)]"
                defaultValue="medium"
                name="priority"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button className={buttonClasses({ variant: "ghost" })} onClick={() => setOpen(false)} type="button">
                Cancel
              </button>
              <button className={buttonClasses({ variant: "primary" })} type="submit">
                Queue task
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Create the Board/Table switch**

`src/app/agent-operations/board-view-switch.tsx`:

```tsx
"use client";

import { useState } from "react";

import { AgentTaskBoard } from "./agent-task-board";
import { NewTaskDialog } from "./new-task-dialog";
import { TaskKanbanBoard } from "./task-kanban-board";
import { type AgentOperationsAgent, type AgentOperationsTask } from "@/lib/agent-operations/read-model";

export function BoardViewSwitch({
  agents,
  tasks,
}: {
  agents: AgentOperationsAgent[];
  tasks: AgentOperationsTask[];
}) {
  const [view, setView] = useState<"board" | "table">("board");

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-3">
        <div className="flex overflow-hidden rounded-lg border border-[var(--border-panel)] text-xs font-bold">
          <button
            aria-pressed={view === "board"}
            className={`px-3 py-1.5 ${view === "board" ? "bg-[var(--surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
            onClick={() => setView("board")}
            type="button"
          >
            Board
          </button>
          <button
            aria-pressed={view === "table"}
            className={`px-3 py-1.5 ${view === "table" ? "bg-[var(--surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
            onClick={() => setView("table")}
            type="button"
          >
            Table
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="cursor-not-allowed rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] px-3 py-1.5 text-xs font-bold text-[var(--text-muted)]"
            disabled
            title="Scheduling arrives in the next release"
            type="button"
          >
            ⟳ Schedule
          </button>
          <NewTaskDialog />
        </div>
      </div>

      {view === "board" ? <TaskKanbanBoard agents={agents} tasks={tasks} /> : <AgentTaskBoard tasks={tasks} />}
    </div>
  );
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `pnpm lint`
Expected: no new errors. (`buttonClasses` variants must match those exported by `page-header.tsx` — if `"ghost"` isn't a variant, use the closest existing one.)

- [ ] **Step 4: Commit**

```bash
git add src/app/agent-operations/new-task-dialog.tsx src/app/agent-operations/board-view-switch.tsx
git commit -m "feat(arc): new-task dialog and board/table view switch"
```

---

## Task 7: Wire into the page

**Files:**
- Modify: `src/app/agent-operations/page.tsx`

Swap the bare `<AgentTaskBoard>` for `<BoardViewSwitch>`, passing the agents list too.

- [ ] **Step 1: Edit the page**

In `src/app/agent-operations/page.tsx`, replace the import:

```tsx
import { AgentTaskBoard } from "./agent-task-board";
```

with:

```tsx
import { BoardViewSwitch } from "./board-view-switch";
```

Then replace the board usage inside the first `WorkspacePanel` (currently `<AgentTaskBoard tasks={dashboard.tasks} />`) with:

```tsx
<BoardViewSwitch agents={dashboard.agents} tasks={dashboard.tasks} />
```

- [ ] **Step 2: Verify build + tests**

Run: `pnpm lint && pnpm test`
Expected: lint clean; full suite green.

- [ ] **Step 3: Manual verification**

Run: `pnpm dev`, open `http://localhost:3000/agent-operations`. Confirm:
- The board renders with a Arc swimlane and 5 columns.
- "+ New task" opens the dialog; queuing a task makes a card appear in **Queued**.
- Dragging a card from Queued → Running persists (refresh keeps it there).
- Dragging a card with an open approval into **Completed** shows the guardrail error and the card snaps back.
- The **Table** toggle still shows the original filterable table.
- The **Schedule** button is visibly disabled.

- [ ] **Step 4: Commit**

```bash
git add src/app/agent-operations/page.tsx
git commit -m "feat(arc): mount Kanban board on the agent-operations page"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** §6 board UI → Tasks 5–7; §5 free-form creation → Task 4; §7 transitions+guardrails → Tasks 1–3; §10 auth (`requireOperator`) → Tasks 3–4; §11 testing → Tasks 1–2 (domain + persistence). §4.2/§8 (`task_schedules`, scheduler) are **deferred to Plan 2** by design — the Schedule button is rendered disabled here.
- **Productization (§9):** no new hardcoded "Arc" in the rendering path (lanes derive from the `agents` table / task rows; `ensureMarkAgent` stays the isolated seed). Domain rule `canOperatorMoveTask` is tenant-agnostic. UI filters tasks by `agentKey` (never assumes a global list).
- **Type consistency:** `OperatorDropTarget` / `OPERATOR_DROP_TARGETS` / `canOperatorMoveTask` / `MoveTaskResult` / `moveAgentTask` / `moveTaskAction` / `createTaskAction` used consistently across Tasks 1→7. `AgentOperationsAgent` and `AgentOperationsTask` are the existing read-model exports.
- **Integration points (verified during authoring):** `@/domain/index.ts` already does `export * from "./arc-tasks"`, so the new symbols auto-export. `@/lib/arc-api/index.ts` already does `export * from "./tasks"`, so `moveAgentTask` auto-exports (no edit to `index.ts` needed in Task 3 — drop that `git add` of `index.ts`). `ButtonVariant` includes `"primary"` and `"ghost"`; `ThemeTone` = `amber | green | red | blue | gray | dark` — all tones used in Tasks 5–6 are valid.
```
