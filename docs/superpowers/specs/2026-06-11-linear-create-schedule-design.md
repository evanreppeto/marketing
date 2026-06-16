# Linear-style Create & Schedule — Design

**Date:** 2026-06-11
**Status:** Approved (verbal "go")
**Surface:** Board toolbar create/schedule flow (`/board` + `/agent-operations`)

## Goal

Make the board's task-creation experience feel like Linear, tailored to a **non-technical** BSR operator, while keeping Arc the named doer and the human the approver. Three concrete asks from the user:

1. Linear-grade polish on the create flow (the "New task" button "looks awful").
2. Make the **Schedule** button actually work (it is currently disabled).
3. Keep everything approval-safe — nothing goes outbound.

## Scope

**In scope:** the toolbar action area in `src/app/agent-operations/board-view-switch.tsx`, the create dialog (`new-task-dialog.tsx`), a working schedule control, the `createTaskAction` backend, a `scheduled_for` column, a pure schedule-preset helper, read-model surfacing, and a subtle "Scheduled" chip on queued board cards.

**Out of scope:** full board-card redesign, column redesign, and the ticket view (already simplified in a prior commit). Recurring schedules (Phase 2 — data is modeled so it can be added without rework).

## Decisions (from brainstorming)

- **Scope:** "Create + Schedule flow" — tightest, highest-impact pass.
- **Schedule meaning:** "Both" — build one-time *"when Arc starts"* now; model data so recurrence can be added later with no rework.
- Scheduling is **folded into the create dialog** as a "When" control; the standalone **Schedule** button opens the same dialog with the When menu pre-opened.
- Keep a **`C` hotkey** to open New task (Linear signature; cheap, removable).

## Components & Architecture

Layering follows the repo convention: pure logic in `src/domain`, I/O in `src/lib`/server actions, UI in `src/app`.

### 1. Pure domain — `src/domain/task-schedule.ts`
```
type SchedulePreset = "now" | "few_hours" | "tomorrow_am" | "weekend" | "custom";
resolveScheduledFor(preset: SchedulePreset, now: Date, customIso?: string): string | null
```
- `now` → `null` (queue immediately, no scheduled gate).
- `few_hours` → `now + 3h`.
- `tomorrow_am` → next day at 09:00 local-to-UTC (computed from `now`).
- `weekend` → upcoming Saturday 09:00.
- `custom` → validate `customIso` parses; return its ISO, else `null`.
- `now` is **injected** (never `Date.now()` inside) so it is deterministic and unit-tested, mirroring `board-demo.ts`.
- Re-export from `src/domain/index.ts`.
- A `formatScheduleLabel(iso, now)` helper returns a friendly label ("Now", "In a few hours", "Tomorrow 9 AM", "Sat 9 AM", "Jun 14, 9:00 AM") for the pill and the card chip.

Unit tests in `src/domain/__tests__/task-schedule.test.ts`.

### 2. Backend — migration + action
- **Migration** `supabase/migrations/<ts>_agent_task_scheduled_for.sql`:
  - `alter table public.agent_tasks add column scheduled_for timestamptz;`
  - `create index agent_tasks_scheduled_for_idx on public.agent_tasks (scheduled_for) where scheduled_for is not null;`
  - SQL `comment on column` documenting the runner rule: *Arc only claims queued tasks where `scheduled_for` is null or `<= now()`. This gates start time only; it never authorizes outbound.*
- **`createTaskAction`** (`src/app/agent-operations/actions.ts`): accept a new optional `scheduledFor` form field (ISO string or empty). If present and parseable, write `scheduled_for`; add a run-log note ("Scheduled for <label>"). Empty/invalid → `null` (immediate queue). All other behavior (guardrails metadata, approval-required, no outbound) unchanged.

### 3. Read-model — `src/lib/agent-operations/read-model.ts`
- Add `scheduledFor: string | null` to `AgentOperationsTask`.
- Add `scheduled_for` to the `agent_tasks` select and to `AgentTaskRow`.
- Map it in `mapTask`.
- Extend `read-model.test.ts` to assert the field.

### 4. UI — toolbar + dialog
- **`board-view-switch.tsx`:** replace the disabled "Schedule" button with a real trigger; both Schedule and New task render through one shared dialog component. Tighten button proportions to Linear's `sm` scale.
- **`new-task-dialog.tsx`** becomes a client component owning:
  - `open` + `mode` (`"task" | "schedule"`) state; `mode === "schedule"` auto-opens the When menu.
  - Priority state (pill menu: Urgent/High/Medium/Low + color dots, default Medium) → hidden input `priority`.
  - When state (pill menu of presets + a `datetime-local` for "Pick date & time…") → resolves via `resolveScheduledFor` into hidden input `scheduledFor`.
  - Header with Arc's sphere avatar + reassurance line; friendly textarea label "What should Arc work on?"; footer with `⌘↵ to create` hint.
  - Keyboard: Esc closes, ⌘/Ctrl+↵ submits, autofocus textarea.
  - Global `C` hotkey (ignored while typing in an input/textarea) opens the dialog in task mode.
  - Submits the existing `createTaskAction` via `<form action=…>` (hidden inputs carry priority + scheduledFor).

### 5. Board card chip — `task-kanban-board.tsx`
- For a **queued** task whose `scheduledFor` is in the future, show a subtle "Scheduled · <label>" chip (calendar glyph) in the card's meta row, using `formatScheduleLabel`. No other card changes.

## Data flow

`Create dialog (client state)` → hidden inputs (`objective`, `priority`, `scheduledFor`) → `createTaskAction` (server, operator-gated) → `agent_tasks` row (`status=queued`, `scheduled_for`) + input + run-log → `revalidatePath` → read-model surfaces `scheduledFor` → board card renders the Scheduled chip.

## Error handling
- Empty objective → existing redirect to `?action=arc-task-error`.
- Unparseable/invalid `scheduledFor` → treated as immediate (`null`), never throws.
- Supabase not configured → existing `?action=not-configured` path.
- Past `customIso` → allowed but normalized to immediate (`null`) by `resolveScheduledFor` (a scheduled-in-the-past task should just run now).

## Testing
- `task-schedule.test.ts` — preset math + label formatting + invalid/custom handling (now injected).
- `read-model.test.ts` — `scheduledFor` mapped.
- UI verified via `pnpm build` + scoped eslint + manual check (no React component tests in repo).

## Verification notes (repo-specific)
- Scope eslint to changed files (`pnpm exec eslint <paths>`); `pnpm lint` reports vendored noise.
- `pnpm lint` does not typecheck — use `pnpm build`.
- Typed Supabase enums need literal unions; `priority` stays the existing `low|medium|high|urgent` union.

## Out-of-scope / Phase 2 (documented, not built)
- Recurring schedules: a future `agent_task_schedules` table (cadence + next-run) + a cron/edge job that inserts `agent_tasks` with `scheduled_for` set. The one-time `scheduled_for` column added here is forward-compatible and needs no migration rework.
