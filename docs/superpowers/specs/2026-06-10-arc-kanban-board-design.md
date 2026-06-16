# Arc Task Board (Kanban) + Scheduler — Design

**Date:** 2026-06-10
**Status:** Approved design, pending implementation plan
**Author:** Evan Reppeto (with Claude)

## 1. Overview

A shared Kanban board at `/agent-operations` where the operator and the Arc
agent (surfaced as **Arc**) both create and move task cards, backed by the
**existing** `agent_tasks` lifecycle. Plus a scheduler so recurring work
(weekly persona refresh, daily lead sweeps) materializes into tasks
automatically.

This is **not greenfield.** The backend already exists:

- `agent_tasks` table + `agent_task_status` enum (`queued | running | blocked |
  needs_approval | completed | failed | canceled`), with `priority`, `due_at`,
  and `related_*` linkage columns already present.
- A bearer-gated agent API at `/api/v1/arc/tasks` with `claim / log /
  complete / block` — this is already "the agent reads the board for tasks."
- A read-only filterable **table** at `/agent-operations`
  (`agent-task-board.tsx`) and a rich task detail view at
  `/agent-operations/tasks/[id]`.
- An operator task-creation server action (`createMarkTaskAction`) — currently
  limited to 3 hardcoded templates.

The work is therefore: **(1)** turn the read-only table into a real Kanban
control surface, **(2)** make operator task creation free-form, and **(3)** add
the scheduler. The "agent reads the board" plumbing is done.

## 2. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Board's primary job | **Shared workspace** — operator and Arc both create & move cards |
| 2 | Tenancy scope | **Single-tenant now, multi-tenant-ready schema** (build for Big Shoulders; never block adding `workspace_id`) |
| 3 | Scheduler mechanism | **Pure domain fn + bearer-gated cron route**; trigger swappable (Vercel Cron now → Supabase scheduled fn later) |
| 4 | Columns / lanes / drag | **5 lifecycle columns, swimlanes per agent, drag = immediate state change** (with guardrails) |
| 5 | Schedule expression UI | **Friendly picker** (Daily / Weekly / Every N hours) primary; raw cron as a future power-user escape hatch |

## 3. Architecture & layering

Follows the app's existing `domain → lib → app` convention and the wired-feature
shape (vault / campaigns): real `"use server"` actions gated by
`requireOperator()` + `isSupabaseAdminConfigured()`, persisting through a
`src/lib/<feature>/` layer, with `revalidatePath`.

- `src/domain/arc-tasks.ts` (extend) — add `canTransition(from, to)` and the
  set of operator-allowed drag transitions. Pure, unit-tested.
- `src/domain/task-schedules.ts` (new) — `computeDueSchedules(schedules, now)`
  → `{ due: TaskPayload[], updatedNextRuns: {...} }`. Pure, I/O-free,
  unit-tested. Honors the `CLAUDE.md` rule: deterministic logic lives in the app
  layer, not Postgres.
- `src/lib/task-schedules/` (new) — persistence/read-model for schedules
  (`isSupabaseAdminConfigured()`-guarded).
- `src/app/agent-operations/` — new `task-kanban-board.tsx` client component,
  generalized `createTaskAction`, new `moveTaskAction`, `createScheduleAction`.
- `src/app/api/cron/materialize-tasks/route.ts` (new) — bearer/cron-secret-gated.

## 4. Data model

### 4.1 Reuse `agent_tasks` as-is
No change to the core task table. The 5 board columns map 1:1 to the
`agent_task_status` enum; `failed`/`canceled` collapse into a "Closed" tray.
Priority, `due_at`, `campaign_id`, `source_type/source_id`, `approval_item_id`
already exist and back the cards.

### 4.2 New table: `task_schedules`
Recurring task **definitions** (not instances). New timestamped migration;
shipped migrations untouched.

```
task_schedules
  id              uuid pk default gen_random_uuid()
  workspace_id    uuid null            -- multi-tenant readiness; NULL today
  agent_id        uuid not null references agents(id) on delete cascade
  objective       text not null
  task_type       text not null
  priority        agent_task_priority not null default 'medium'
  cadence         jsonb not null       -- normalized schedule (see 4.3)
  metadata        jsonb not null default '{}'  -- template payload for new tasks
  active          boolean not null default true
  next_run_at     timestamptz not null
  last_run_at     timestamptz
  created_at      timestamptz not null default now()
  updated_at      timestamptz not null default now()

  index on (active, next_run_at)
  index on (workspace_id)
```

`workspace_id` ships **now** (nullable) so productization adds RLS *policies*,
not columns.

### 4.3 `cadence` normalized format
Stores intent in a way that supports both the friendly picker and future cron:

```jsonc
{ "kind": "daily",  "at": "09:00", "tz": "America/Chicago" }
{ "kind": "weekly", "at": "09:00", "weekday": 1, "tz": "America/Chicago" }
{ "kind": "interval_hours", "every": 6 }
{ "kind": "cron",  "expr": "0 9 * * 1" }   // future power-user escape hatch
```

`computeDueSchedules` reads `cadence` + `next_run_at` to decide due-ness and
compute the next `next_run_at`. Deterministic: `now` is injected, never read
inside the domain layer.

## 5. Free-form task creation

Generalize `createMarkTaskAction` → `createTaskAction(formData)` accepting
free-form `objective`, `priority`, `assignee` (agent), and an optional linked
record (campaign / lead / CRM object). The 3 existing templates survive as
**quick-fill presets** in the "+ New task" modal. Same auth + persistence shape
it already has (inserts into `agent_tasks` + `agent_task_inputs` +
`agent_run_logs`, `requireOperator`-gated).

## 6. Kanban UI

- New client component `task-kanban-board.tsx`, default view at
  `/agent-operations`. The existing filterable table is preserved behind a
  **Board / Table** toggle (table is better at high volume — search + pagination
  already built).
- **Swimlanes = one row per agent**, rendered generically from the `agents`
  table (name, status dot, heartbeat, "outbound locked"). An "+ Add agent" lane
  expresses the multi-agent / multi-customer shape.
- **5 columns** = Queued → Running → Blocked → Needs approval → Completed.
  `failed`/`canceled` collapse into a muted "Closed" tray.
- **Cards**: objective, priority pill, risk pill, linked-record chip, `⟳
  Recurring` marker; click → existing `/agent-operations/tasks/[id]` detail.
- **Theme**: Obsidian & Gold tokens from `globals.css`. Status grammar enforced
  — green = ok, gold = attention/"needs you", **red = destructive only**. So
  priority/blocked/outbound-lock cues read as gold, risk·low is green, red is
  reserved for genuine high-risk/destructive.

## 7. State transitions & guardrails

- Server action `moveTaskAction(taskId, toStatus)`, `requireOperator`-gated.
- Validity decided by pure `canTransition(from, to)` in `arc-tasks.ts`
  (unit-tested). Illegal drops snap back in the UI.
- **Drag is immediate** (drop = committed state change) — but bounded:
  - Cannot drag a card into **Completed** while it has an open approval item.
  - Dragging *out of* **Needs approval** never auto-approves outbound — the
    outbound gate still lives in `/approvals`. The board move only changes task
    workflow state, never the approval decision.
- Every move writes an `agent_run_logs` entry for the audit trail.

## 8. Scheduler

- `computeDueSchedules(schedules, now)` (pure) decides which active schedules are
  due, produces the `agent_tasks` insert payloads, and returns updated
  `next_run_at` values.
- `/api/cron/materialize-tasks` (bearer/cron-secret-gated) loads active
  schedules, calls the domain fn, inserts due tasks (same shape as
  `createTaskAction`), updates `next_run_at` / `last_run_at`.
- Operator UI: a "Schedule" modal on the board with the **friendly picker**
  (Daily / Weekly / Every N hours), writing normalized `cadence`.
- **Trigger** is swappable without touching tested logic: Vercel Cron now → a
  Supabase scheduled function (or `pg_cron` + `pg_net` calling the route) when
  productized.

## 9. Productization & multi-tenant readiness (first-class)

The feature must be sellable to anyone running a Arc agent. Enforced
constraints — verified during implementation review:

1. **Workspace-scoped schema from day one.** New tables carry a nullable
   `workspace_id`; no single-tenant assumption is baked into a table shape.
2. **No new hardcoded "Arc"/"Big Shoulders".** Agent identity, name, and
   branding come from the `agents` table; board/cards/swimlanes render any agent
   generically. The existing `ensureMarkAgent` remains the only hardcoded seed
   and stays isolated.
3. **Per-agent-token-ready API.** New agent-facing code resolves "which
   agent/workspace owns this token" rather than assuming the single global
   `ARC_AGENT_API_TOKEN`, so each customer's agent authenticates into its own
   lane.
4. **Tenant-agnostic domain functions.** `canTransition` and
   `computeDueSchedules` operate purely on injected data — identical behavior
   for one workspace or many.
5. **No "all tasks" assumption in the UI.** Board queries filter by agent (and
   later workspace).

**Explicitly out of scope now** (separate future project): signup/onboarding,
billing, RLS policy enforcement, token→workspace resolution service. We build
*compatibility*, not tenancy.

## 10. Auth

- **Operator gate** (`requireOperator()`) on all board UI server actions
  (`createTaskAction`, `moveTaskAction`, `createScheduleAction`).
- **Bearer tokens** on the agent API (existing) and the new cron route
  (`checkBearerToken` / cron secret). The operator gate does not cover API/cron
  routes — they carry their own bearer, per `CLAUDE.md`.

## 11. Testing

Follows the wired-feature shape:

- Domain: `canTransition` (all legal/illegal pairs incl. guardrail cases) and
  `computeDueSchedules` (each `cadence.kind`, due/not-due, next-run math, DST
  edge) — unit-tested in `src/domain/__tests__/`.
- `lib/task-schedules` read-model/persistence tests (mocked Supabase).
- Cron route test (bearer rejection + materialization happy path).
- `moveTaskAction` / `createTaskAction` action tests (auth gate + persistence).

## 12. Out of scope

- Full multi-tenancy (see §9).
- Raw-cron editing UI (storage supports it; UI deferred).
- Cross-agent dependencies / task DAGs.
- Real-time websocket board updates (polling/`revalidatePath` is sufficient v1).

## 13. Open questions

None blocking. Cron-trigger host (Vercel Cron vs Supabase scheduled fn) is an
ops choice that does not affect the tested logic and can be decided at deploy.
