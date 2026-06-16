# Linear-style Create & Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the board a Linear-grade, non-technical task-creation flow with a working Schedule control (one-time "when Arc starts"), keeping Arc the named doer and the human the approver.

**Architecture:** Pure scheduling math in `src/domain/task-schedule.ts` (now injected, unit-tested). A new `scheduled_for` column on `agent_tasks` (migration + hand-edited generated types). `createTaskAction` writes it. The read-model surfaces it. A redesigned client dialog (`new-task-dialog.tsx`) owns priority + "when" pill menus and renders BOTH the Schedule and New task buttons; the toolbar just mounts it. Queued cards show a subtle "Scheduled · …" chip.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, Supabase (typed client), Vitest (node env — no React component tests; UI verified via `pnpm build` + scoped eslint + manual). Package manager **pnpm**.

**Repo-specific verification notes:**
- `pnpm lint` scans vendored files (~31k pre-existing problems). **Always scope eslint to changed files.**
- `pnpm lint` does **not** typecheck. Use `pnpm build`.
- The Supabase client is **typed** via `src/lib/supabase/database.types.ts` — a new column must be added there or inserts/selects fail typecheck.
- Run one test file: `pnpm test <path>`.

---

## File Structure

**Create:**
- `src/domain/task-schedule.ts` — pure `resolveScheduledFor` + `formatScheduleLabel`.
- `src/domain/__tests__/task-schedule.test.ts` — unit tests.
- `supabase/migrations/20260611120000_agent_task_scheduled_for.sql` — adds `scheduled_for`.

**Modify:**
- `src/domain/index.ts` — re-export `task-schedule`.
- `src/lib/supabase/database.types.ts` — add `scheduled_for` to `agent_tasks` Row/Insert/Update.
- `src/app/agent-operations/actions.ts` — `createTaskAction` accepts/writes `scheduledFor`.
- `src/lib/agent-operations/read-model.ts` — surface `scheduledFor` (type + row type + select + map).
- `src/lib/agent-operations/read-model.test.ts` — assert `scheduledFor`.
- `src/app/agent-operations/new-task-dialog.tsx` — full Linear-style rewrite (both buttons + dialog).
- `src/app/agent-operations/board-view-switch.tsx` — drop the disabled Schedule button; mount `<NewTaskDialog />`.
- `src/app/agent-operations/task-kanban-board.tsx` — `scheduledFor` on demo task + "Scheduled" chip.

---

## Task 1: Pure schedule helper

**Files:**
- Create: `src/domain/task-schedule.ts`
- Test: `src/domain/__tests__/task-schedule.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/task-schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatScheduleLabel, resolveScheduledFor } from "../task-schedule";

const NOW = new Date("2026-06-11T12:00:00.000Z"); // Thursday

describe("resolveScheduledFor", () => {
  it("returns null for now", () => {
    expect(resolveScheduledFor("now", NOW)).toBeNull();
  });
  it("adds three hours for few_hours", () => {
    expect(resolveScheduledFor("few_hours", NOW)).toBe("2026-06-11T15:00:00.000Z");
  });
  it("uses next day at 09:00 UTC for tomorrow_am", () => {
    expect(resolveScheduledFor("tomorrow_am", NOW)).toBe("2026-06-12T09:00:00.000Z");
  });
  it("uses the upcoming Saturday 09:00 UTC for weekend", () => {
    expect(resolveScheduledFor("weekend", NOW)).toBe("2026-06-13T09:00:00.000Z");
  });
  it("rolls weekend forward when already past Saturday 9am", () => {
    const satNoon = new Date("2026-06-13T12:00:00.000Z");
    expect(resolveScheduledFor("weekend", satNoon)).toBe("2026-06-20T09:00:00.000Z");
  });
  it("accepts a future custom ISO", () => {
    expect(resolveScheduledFor("custom", NOW, "2026-07-01T14:30:00.000Z")).toBe("2026-07-01T14:30:00.000Z");
  });
  it("treats past / invalid / empty custom as now (null)", () => {
    expect(resolveScheduledFor("custom", NOW, "2020-01-01T00:00:00.000Z")).toBeNull();
    expect(resolveScheduledFor("custom", NOW, "not-a-date")).toBeNull();
    expect(resolveScheduledFor("custom", NOW, "")).toBeNull();
  });
});

describe("formatScheduleLabel", () => {
  it("labels null as Now", () => {
    expect(formatScheduleLabel(null, NOW)).toBe("Now");
  });
  it("labels same-day as Today", () => {
    expect(formatScheduleLabel("2026-06-11T15:00:00.000Z", NOW)).toBe("Today, 3:00 PM");
  });
  it("labels next day as Tomorrow", () => {
    expect(formatScheduleLabel("2026-06-12T09:00:00.000Z", NOW)).toBe("Tomorrow, 9:00 AM");
  });
  it("labels within a week as weekday", () => {
    expect(formatScheduleLabel("2026-06-13T09:00:00.000Z", NOW)).toBe("Sat, 9:00 AM");
  });
  it("labels beyond a week as month/day", () => {
    expect(formatScheduleLabel("2026-07-01T14:30:00.000Z", NOW)).toBe("Jul 1, 2:30 PM");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/task-schedule.test.ts`
Expected: FAIL — cannot resolve `../task-schedule`.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/task-schedule.ts`:

```ts
/** Pure scheduling math for the board's "When should Arc start?" control.
 *  `now` is injected so the logic stays deterministic and unit-tested. Times are
 *  computed in UTC for determinism; the external runner only gates on the value
 *  — it never authorizes outbound. */

export const SCHEDULE_PRESETS = ["now", "few_hours", "tomorrow_am", "weekend", "custom"] as const;

export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number];

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Resolve a preset (+ optional custom ISO) to an ISO start time, or null = "now". */
export function resolveScheduledFor(preset: SchedulePreset, now: Date, customIso?: string | null): string | null {
  switch (preset) {
    case "now":
      return null;
    case "few_hours":
      return new Date(now.getTime() + 3 * HOUR_MS).toISOString();
    case "tomorrow_am": {
      const d = new Date(now.getTime() + DAY_MS);
      d.setUTCHours(9, 0, 0, 0);
      return d.toISOString();
    }
    case "weekend": {
      const daysUntilSat = (6 - now.getUTCDay() + 7) % 7;
      const d = new Date(now.getTime() + daysUntilSat * DAY_MS);
      d.setUTCHours(9, 0, 0, 0);
      if (d.getTime() <= now.getTime()) d.setTime(d.getTime() + 7 * DAY_MS);
      return d.toISOString();
    }
    case "custom": {
      if (!customIso) return null;
      const t = new Date(customIso);
      if (Number.isNaN(t.getTime())) return null;
      if (t.getTime() <= now.getTime()) return null; // past = run now
      return t.toISOString();
    }
    default:
      return null;
  }
}

/** Friendly label for a scheduled ISO (or null) relative to `now`. */
export function formatScheduleLabel(iso: string | null, now: Date): string {
  if (!iso) return "Now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Now";
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(d);
  const startOfDay = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
  if (dayDiff <= 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  if (dayDiff < 7) {
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);
    return `${weekday}, ${time}`;
  }
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
  return `${monthDay}, ${time}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/task-schedule.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Re-export from the domain barrel**

In `src/domain/index.ts`, add alongside the other `export *` lines:

```ts
export * from "./task-schedule";
```

- [ ] **Step 6: Verify build + commit**

Run: `pnpm build`
Expected: compiles clean.

```bash
git add src/domain/task-schedule.ts src/domain/__tests__/task-schedule.test.ts src/domain/index.ts
git commit -m "feat(board): pure schedule preset helper"
```

---

## Task 2: Migration + generated types for `scheduled_for`

**Files:**
- Create: `supabase/migrations/20260611120000_agent_task_scheduled_for.sql`
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260611120000_agent_task_scheduled_for.sql`:

```sql
-- Add a one-time START gate for board tasks: when Arc should pick the task up.
-- This gates start time ONLY. It never authorizes outbound — outbound stays
-- behind human approval. The external runner (Arc) must only claim queued
-- tasks where scheduled_for is null or <= now().

alter table public.agent_tasks
  add column if not exists scheduled_for timestamptz;

comment on column public.agent_tasks.scheduled_for is
  'Optional one-time start gate. Arc only claims queued tasks where scheduled_for is null or <= now(). Gates start time only; never authorizes outbound.';

create index if not exists agent_tasks_scheduled_for_idx
  on public.agent_tasks (scheduled_for)
  where scheduled_for is not null;
```

- [ ] **Step 2: Add the column to the generated types**

In `src/lib/supabase/database.types.ts`, inside the `agent_tasks` block, add `scheduled_for` immediately after each `due_at` line:

In **Row** (after `due_at: string | null;`):

```ts
          scheduled_for: string | null;
```

In **Insert** (after `due_at?: string | null;`):

```ts
          scheduled_for?: string | null;
```

In **Update** (after `due_at?: string | null;`):

```ts
          scheduled_for?: string | null;
```

- [ ] **Step 3: Verify build + commit**

Run: `pnpm build`
Expected: compiles clean (the typed client now knows the column).

```bash
git add supabase/migrations/20260611120000_agent_task_scheduled_for.sql src/lib/supabase/database.types.ts
git commit -m "feat(board): scheduled_for column on agent_tasks"
```

---

## Task 3: `createTaskAction` writes `scheduledFor`

**Files:**
- Modify: `src/app/agent-operations/actions.ts`

Context: `createTaskAction` is at `src/app/agent-operations/actions.ts:156-231`. It reads `objective`/`priority`/`taskType`, inserts an `agent_tasks` row (`status: "queued"`), an input, and a run log, then `revalidatePath` + redirect.

- [ ] **Step 1: Parse `scheduledFor` from the form**

In `createTaskAction`, just after the `priority` const is computed (after line 164, before the `if (objective.length === 0)` check), add:

```ts
  const scheduledForRaw = String(formData.get("scheduledFor") ?? "").trim();
  let scheduledFor: string | null = null;
  if (scheduledForRaw) {
    const parsed = new Date(scheduledForRaw);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
      scheduledFor = parsed.toISOString();
    }
  }
```

- [ ] **Step 2: Write the column on insert**

In the `.from("agent_tasks").insert({ ... })` object (lines 179-193), add `scheduled_for` right after `task_type: taskType,`:

```ts
      scheduled_for: scheduledFor,
```

And inside that insert's `metadata: { ... }` object, add after `outbound_dispatch_allowed: false,`:

```ts
        scheduled_for: scheduledFor,
```

- [ ] **Step 3: Note the schedule in the run log**

In the `.from("agent_run_logs").insert({ ... })` object (lines 215-225), replace the `reasoning_summary` line:

```ts
    reasoning_summary: "Task queued from the board. External runner has not picked it up yet.",
```

with:

```ts
    reasoning_summary: scheduledFor
      ? `Task queued from the board, scheduled to start ${scheduledFor}. External runner has not picked it up yet.`
      : "Task queued from the board. External runner has not picked it up yet.",
```

- [ ] **Step 4: Verify build + scoped lint + commit**

Run: `pnpm build`
Expected: compiles clean.

Run: `pnpm exec eslint src/app/agent-operations/actions.ts`
Expected: no errors.

```bash
git add src/app/agent-operations/actions.ts
git commit -m "feat(board): createTaskAction stores scheduled start time"
```

---

## Task 4: Read-model surfaces `scheduledFor`

**Files:**
- Modify: `src/lib/agent-operations/read-model.ts`
- Test: `src/lib/agent-operations/read-model.test.ts`

Context: `AgentOperationsTask` at lines 30-48 (has `dueAt` at line 44). `AgentTaskRow` at lines 111-127 (has `due_at` at line 122). The dashboard select is at line 277. `mapTask` returns its object at lines 571-591 (`dueAt: task.due_at ?? null,` at line 587). `normalizeTaskRow` spreads `...row`, so the field passes through.

- [ ] **Step 1: Extend the mapping test (write the failing assertion)**

In `src/lib/agent-operations/read-model.test.ts`, in the first test's `agent_tasks` mock row, add `scheduled_for` right after the `due_at` line (line 40):

```ts
            scheduled_for: "2026-06-20T09:00:00.000Z",
```

Then in the `dashboard.tasks[0]` assertion `toMatchObject({ ... })` (around lines 110-119), add after the `dueAt:` line:

```ts
      scheduledFor: "2026-06-20T09:00:00.000Z",
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/agent-operations/read-model.test.ts`
Expected: FAIL — `tasks[0].scheduledFor` is undefined.

- [ ] **Step 3: Add `scheduledFor` to the public task type**

In `AgentOperationsTask` (lines 30-48), add after `dueAt: string | null;`:

```ts
  scheduledFor: string | null;
```

- [ ] **Step 4: Add `scheduled_for` to the row type**

In `AgentTaskRow` (lines 111-127), add after `due_at: string | null;`:

```ts
  scheduled_for: string | null;
```

- [ ] **Step 5: Select the column**

In the dashboard `agent_tasks` select string (line 277), add `scheduled_for` after `due_at`. Change:

```ts
          "id,agent_id,status,priority,objective,task_type,source_type,source_id,campaign_id,approval_item_id,due_at,completed_at,created_at,updated_at,metadata",
```

to:

```ts
          "id,agent_id,status,priority,objective,task_type,source_type,source_id,campaign_id,approval_item_id,due_at,scheduled_for,completed_at,created_at,updated_at,metadata",
```

- [ ] **Step 6: Map it**

In `mapTask`'s returned object (lines 571-591), add after `dueAt: task.due_at ?? null,`:

```ts
    scheduledFor: task.scheduled_for ?? null,
```

- [ ] **Step 7: Keep the board demo literal type-valid**

`AgentOperationsTask` now **requires** `scheduledFor`, which breaks the inline `demoTask` literal in `src/app/agent-operations/task-kanban-board.tsx` until it is updated. Patch it now so the build stays green. In the `demoTask` object literal (lines 167-187), add after `dueAt: null,`:

```tsx
        scheduledFor: null,
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm test src/lib/agent-operations/read-model.test.ts`
Expected: PASS.

- [ ] **Step 9: Verify build + commit**

Run: `pnpm build`
Expected: compiles clean (the demo literal now satisfies the extended type).

```bash
git add src/lib/agent-operations/read-model.ts src/lib/agent-operations/read-model.test.ts src/app/agent-operations/task-kanban-board.tsx
git commit -m "feat(board): surface scheduledFor in the read-model"
```

---

## Task 5: Linear-style create + schedule dialog

**Files:**
- Modify (full rewrite): `src/app/agent-operations/new-task-dialog.tsx`

Context: this component currently renders one "+ New task" button + a centered modal. It will now render BOTH a Schedule button and a New task button, plus the redesigned dialog with priority + "when" pill menus. It depends on `resolveScheduledFor` / `formatScheduleLabel` / `SchedulePreset` (Task 1, via `@/domain`), `MarkAvatar`, and the existing `createTaskAction`.

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `src/app/agent-operations/new-task-dialog.tsx` with:

```tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";

import { MarkAvatar } from "@/app/arc/_components/arc-avatar";
import { formatScheduleLabel, resolveScheduledFor, type SchedulePreset } from "@/domain";

import { createTaskAction } from "./actions";
import { buttonClasses } from "../_components/page-header";

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent", dot: "var(--priority)" },
  { value: "high", label: "High", dot: "var(--warn)" },
  { value: "medium", label: "Medium", dot: "var(--accent)" },
  { value: "low", label: "Low", dot: "var(--text-muted)" },
] as const;

const WHEN_OPTIONS: ReadonlyArray<{ value: SchedulePreset; label: string }> = [
  { value: "now", label: "Now" },
  { value: "few_hours", label: "In a few hours" },
  { value: "tomorrow_am", label: "Tomorrow morning" },
  { value: "weekend", label: "This weekend" },
  { value: "custom", label: "Pick date & time…" },
];

type MenuKey = "priority" | "when" | null;

export function NewTaskDialog() {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<MenuKey>(null);
  const [priority, setPriority] = useState<(typeof PRIORITY_OPTIONS)[number]["value"]>("medium");
  const [whenPreset, setWhenPreset] = useState<SchedulePreset>("now");
  const [customIso, setCustomIso] = useState("");

  function openDialog(mode: "task" | "schedule") {
    setOpen(true);
    setMenu(mode === "schedule" ? "when" : null);
  }

  function closeDialog() {
    setOpen(false);
    setMenu(null);
  }

  // Esc closes the open menu first, then the dialog.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenu((current) => {
        if (current) return null;
        setOpen(false);
        return null;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // "C" opens a new task (Linear-style), unless the user is typing in a field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (open) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "c" && event.key !== "C") return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      event.preventDefault();
      openDialog("task");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const priorityOption = PRIORITY_OPTIONS.find((option) => option.value === priority)!;
  const scheduledForValue =
    whenPreset === "now" ? "" : resolveScheduledFor(whenPreset, new Date(), customIso || null) ?? "";
  const whenLabel =
    whenPreset === "custom"
      ? scheduledForValue
        ? formatScheduleLabel(scheduledForValue, new Date())
        : "Pick a time…"
      : WHEN_OPTIONS.find((option) => option.value === whenPreset)!.label;

  return (
    <>
      <button
        className={buttonClasses({ variant: "ghost", size: "sm", className: "gap-1.5" })}
        onClick={() => openDialog("schedule")}
        type="button"
      >
        <CalendarIcon />
        Schedule
      </button>
      <button
        className={buttonClasses({ variant: "primary", size: "sm", className: "gap-1.5" })}
        onClick={() => openDialog("task")}
        type="button"
      >
        <PlusIcon />
        New task
        <kbd className="ml-1 hidden rounded border border-[var(--on-accent)]/30 px-1 text-[10px] font-bold leading-4 opacity-80 sm:inline">
          C
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--overlay)] p-4 pt-[12vh]"
          onClick={closeDialog}
        >
          <form
            action={createTaskAction}
            className="w-full max-w-lg rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-raised)]"
            onClick={(event) => event.stopPropagation()}
          >
            <input type="hidden" name="priority" value={priority} />
            <input type="hidden" name="scheduledFor" value={scheduledForValue} />

            <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-5 py-4">
              <MarkAvatar size={28} />
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">New task for Arc</h2>
                <p className="text-xs text-[var(--text-muted)]">Arc prepares the work. You approve anything that goes out.</p>
              </div>
            </div>

            <div className="px-5 py-4">
              <label className="block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                What should Arc work on?
                <textarea
                  autoFocus
                  name="objective"
                  required
                  placeholder="Find plumbing partners in 606xx ZIPs and prepare approval-ready recommendations…"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
                  }}
                  className="mt-1.5 h-28 w-full resize-none rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:border-[var(--accent-border)] focus-visible:outline-none"
                />
              </label>

              <div className="relative mt-3 flex flex-wrap items-center gap-2">
                <PillButton active={menu === "priority"} onClick={() => setMenu(menu === "priority" ? null : "priority")}>
                  <span className="h-2 w-2 rounded-full" style={{ background: priorityOption.dot }} />
                  {priorityOption.label}
                  <Chevron />
                </PillButton>
                <PillButton active={menu === "when"} onClick={() => setMenu(menu === "when" ? null : "when")}>
                  <CalendarIcon />
                  {whenLabel}
                  <Chevron />
                </PillButton>

                {menu ? <div className="fixed inset-0 z-[1]" onClick={() => setMenu(null)} /> : null}

                {menu === "priority" ? (
                  <Menu>
                    {PRIORITY_OPTIONS.map((option) => (
                      <MenuItem
                        key={option.value}
                        selected={option.value === priority}
                        onClick={() => {
                          setPriority(option.value);
                          setMenu(null);
                        }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: option.dot }} />
                        {option.label}
                      </MenuItem>
                    ))}
                  </Menu>
                ) : null}

                {menu === "when" ? (
                  <Menu>
                    {WHEN_OPTIONS.map((option) => (
                      <MenuItem
                        key={option.value}
                        selected={option.value === whenPreset}
                        onClick={() => {
                          setWhenPreset(option.value);
                          if (option.value !== "custom") setMenu(null);
                        }}
                      >
                        {option.label}
                      </MenuItem>
                    ))}
                    {whenPreset === "custom" ? (
                      <div className="border-t border-[var(--border-hairline)] p-2">
                        <input
                          type="datetime-local"
                          value={customIso}
                          onChange={(event) => setCustomIso(event.target.value)}
                          className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2 text-xs text-[var(--text-primary)]"
                        />
                      </div>
                    ) : null}
                  </Menu>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border-hairline)] px-5 py-4">
              <span className="text-[11px] text-[var(--text-muted)]">
                <kbd className="rounded border border-[var(--border-panel)] px-1 font-bold">⌘</kbd>
                <kbd className="ml-0.5 rounded border border-[var(--border-panel)] px-1 font-bold">↵</kbd> to create
              </span>
              <div className="flex gap-2">
                <button className={buttonClasses({ variant: "ghost", size: "sm" })} onClick={closeDialog} type="button">
                  Cancel
                </button>
                <button className={buttonClasses({ variant: "primary", size: "sm" })} type="submit">
                  {whenPreset === "now" ? "Create task" : "Schedule task"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
        active
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "border-[var(--border-panel)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
      }`}
    >
      {children}
    </button>
  );
}

function Menu({ children }: { children: ReactNode }) {
  return (
    <div className="absolute left-0 top-full z-[2] mt-1.5 w-56 overflow-hidden rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] py-1 shadow-[var(--elev-raised)]">
      {children}
    </div>
  );
}

function MenuItem({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-medium ${
        selected ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]"
      }`}
    >
      {children}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify build + scoped lint**

Run: `pnpm build`
Expected: compiles clean.

Run: `pnpm exec eslint src/app/agent-operations/new-task-dialog.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/agent-operations/new-task-dialog.tsx
git commit -m "feat(board): Linear-style create + schedule dialog"
```

---

## Task 6: Wire the toolbar (drop the dead Schedule button)

**Files:**
- Modify: `src/app/agent-operations/board-view-switch.tsx`

Context: the right-side action group (lines 40-50) currently renders a **disabled** Schedule button followed by `<NewTaskDialog />`. The dialog now owns both buttons, so the disabled one is removed.

- [ ] **Step 1: Replace the action group**

In `src/app/agent-operations/board-view-switch.tsx`, replace this block:

```tsx
        <div className="flex items-center gap-2">
          <button
            className="cursor-not-allowed rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] px-3 py-1.5 text-xs font-bold text-[var(--text-muted)]"
            disabled
            title="Scheduling arrives in the next release"
            type="button"
          >
            Schedule
          </button>
          <NewTaskDialog />
        </div>
```

with:

```tsx
        <div className="flex items-center gap-2">
          <NewTaskDialog />
        </div>
```

- [ ] **Step 2: Verify build + scoped lint**

Run: `pnpm build`
Expected: compiles clean (no unused symbols).

Run: `pnpm exec eslint src/app/agent-operations/board-view-switch.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/agent-operations/board-view-switch.tsx
git commit -m "feat(board): mount the unified create/schedule controls in the toolbar"
```

---

## Task 7: "Scheduled" chip on queued cards

**Files:**
- Modify: `src/app/agent-operations/task-kanban-board.tsx`

Context: `task-kanban-board.tsx` imports from `@/domain` at line 9 (`initialDemoFrame, nextDemoFrame, type DemoStatus`). The `demoTask` literal already carries `scheduledFor: null` (added in Task 4 Step 7). The `Card` component is at lines 312-398; its bottom meta row (due date + live presence) is at lines 387-395.

- [ ] **Step 1: Import `formatScheduleLabel`**

Change the `@/domain` import (line 9):

```tsx
import { initialDemoFrame, nextDemoFrame, type DemoStatus } from "@/domain";
```

to:

```tsx
import { formatScheduleLabel, initialDemoFrame, nextDemoFrame, type DemoStatus } from "@/domain";
```

- [ ] **Step 2: Compute the scheduled label in `Card`**

In the `Card` component, after the `pct` const is computed (after line 332), add:

```tsx
  const scheduledLabel =
    task.status === "queued" && task.scheduledFor && new Date(task.scheduledFor).getTime() > Date.now()
      ? formatScheduleLabel(task.scheduledFor, new Date())
      : null;
```

- [ ] **Step 3: Render the chip in the bottom row**

Replace the bottom meta row (lines 387-395):

```tsx
      <div className="mt-2 flex items-center justify-between pl-7">
        <span className="text-[10px] font-medium text-[var(--text-muted)]">{formatDue(task.dueAt)}</span>
        {working ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--accent-strong)]">
            <span className="kanban-presence" />
            Arc · live
          </span>
        ) : null}
      </div>
```

with:

```tsx
      <div className="mt-2 flex items-center justify-between pl-7">
        {scheduledLabel ? (
          <span className="text-[10px] font-semibold text-[var(--accent-strong)]">Scheduled · {scheduledLabel}</span>
        ) : (
          <span className="text-[10px] font-medium text-[var(--text-muted)]">{formatDue(task.dueAt)}</span>
        )}
        {working ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--accent-strong)]">
            <span className="kanban-presence" />
            Arc · live
          </span>
        ) : null}
      </div>
```

- [ ] **Step 4: Verify build + scoped lint**

Run: `pnpm build`
Expected: compiles clean.

Run: `pnpm exec eslint src/app/agent-operations/task-kanban-board.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/agent-operations/task-kanban-board.tsx
git commit -m "feat(board): scheduled-start chip on queued cards"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full unit-test suite**

Run: `pnpm test`
Expected: all pass, including new `task-schedule` tests and the extended `read-model` test.

- [ ] **Step 2: Typecheck via build**

Run: `pnpm build`
Expected: clean build, no type errors.

- [ ] **Step 3: Scoped lint on every changed/created file**

Run:

```bash
pnpm exec eslint src/domain/task-schedule.ts src/app/agent-operations/new-task-dialog.tsx src/app/agent-operations/board-view-switch.tsx src/app/agent-operations/task-kanban-board.tsx src/app/agent-operations/actions.ts src/lib/agent-operations/read-model.ts
```

Expected: no errors.

- [ ] **Step 4: Manual end-to-end check**

Run `pnpm dev`, open `/board`:
- Toolbar shows a ghost **Schedule** and a primary **New task** button (compact, Linear-scale). Pressing **C** (not while typing) opens the dialog.
- Dialog: Arc's sphere + reassurance copy; "What should Arc work on?" textarea autofocused; **Priority** and **When** pill menus work; choosing "Pick date & time…" reveals a datetime field. ⌘/Ctrl+↵ submits; Esc closes the menu then the dialog.
- **Schedule** button opens the same dialog with the When menu already open; the submit button reads "Schedule task" for any non-"Now" choice.
- Create a task scheduled for tomorrow → the new queued card shows a "Scheduled · Tomorrow, 9:00 AM" chip. Create one with "Now" → no chip.
- Existing drag-and-drop, demo toggle, and approval guardrails still work.

---

## Notes for the implementer

- **YAGNI:** no recurring schedules this round. The `scheduled_for` column is forward-compatible — recurrence will later add a separate `agent_task_schedules` table + cron with no rework here.
- **Approval-safe:** scheduling only gates *start time*; nothing outbound. The runner rule (claim only `scheduled_for` null-or-past) is documented in the migration comment.
- **Determinism:** all date math in `task-schedule.ts` takes an injected `now` and uses UTC, so tests are stable. Times like "Tomorrow morning" resolve to 09:00 UTC by design (simple + deterministic; can be localized later).
- **DRY:** the dialog renders both toolbar buttons so the schedule/create entry points share one implementation.
```
