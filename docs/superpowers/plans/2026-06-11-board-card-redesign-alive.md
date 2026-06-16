# Board Card Redesign + Alive Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Kanban task card into a scannable, "alive" unit (progress, priority/risk grammar, due date, Arc's chat sphere as the owner avatar, presence + motion), add an off-by-default client-side demo toggle, and apply light board polish.

**Architecture:** Pure logic goes in `src/domain` (demo sequence) and pure presentation helpers next to their components (avatar resolution); both are unit-tested in the existing `node` vitest setup. The read-model surfaces two existing `agent_tasks` columns (`priority`, `due_at`) plus an optional parsed `progress`. The chat's `MarkAvatar` is promoted to a shared component so the board and chat render the identical sphere; an `EntityAvatar` chooser renders Arc's sphere for agents and a profile-picture-ready circle for humans. The card, demo toggle, polling, and board polish are wired into the existing `task-kanban-board.tsx` client component.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, Vitest (node env — **no React component tests exist in this repo**; UI is verified via `pnpm build` + scoped eslint + manual check). Package manager **pnpm**.

**Repo-specific verification notes:**
- `pnpm lint` scans vendored/generated files (~31k pre-existing problems). **Always scope eslint to changed files**: `pnpm exec eslint <path> ...`.
- `pnpm lint` does **not** typecheck. Use `pnpm build` to catch type errors.
- Run a single test file with `pnpm test <path>`.

---

## File Structure

**Create:**
- `src/domain/board-demo.ts` — pure demo lifecycle sequence (`nextDemoFrame`, `initialDemoFrame`).
- `src/domain/__tests__/board-demo.test.ts` — unit tests for the demo sequence.
- `src/app/_components/entity-avatar.helpers.ts` — pure avatar resolution (`initialsFromName`, `resolveHumanAvatar`), no React imports.
- `src/app/_components/entity-avatar.helpers.test.ts` — unit tests for the helpers.
- `src/app/arc/_components/arc-avatar.tsx` — the chat's `MarkAvatar`, promoted to a shared, size-parameterized component.
- `src/app/_components/entity-avatar.tsx` — chooser: agent → `MarkAvatar`; human → photo/initials circle.

**Modify:**
- `src/domain/index.ts` — re-export `board-demo`.
- `src/lib/agent-operations/read-model.ts` — add `due_at` to the `agent_tasks` select; add `priority`, `dueAt`, `progress` to `AgentOperationsTask` + `mapTask`; add `parseProgress` + `due_at` on `AgentTaskRow`.
- `src/lib/agent-operations/read-model.test.ts` — assert the new fields.
- `src/app/arc/_components/message-list.tsx` — import `MarkAvatar` from the new module; delete the local definition.
- `src/app/agent-operations/task-kanban-board.tsx` — new `Card` anatomy, `EntityAvatar`, presence/shimmer/entrance motion, demo toggle, polling, WIP counts, empty states; remove the now-shared local `initials`.

---

## Task 1: Demo lifecycle domain function

**Files:**
- Create: `src/domain/board-demo.ts`
- Test: `src/domain/__tests__/board-demo.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/board-demo.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { DEMO_SEQUENCE, initialDemoFrame, nextDemoFrame } from "../board-demo";

describe("board demo sequence", () => {
  it("starts queued and not working", () => {
    expect(initialDemoFrame()).toEqual({ step: 0, status: "queued", working: false });
  });

  it("advances queued -> running and marks working only while running", () => {
    const frame = nextDemoFrame(0);
    expect(frame).toEqual({ step: 1, status: "running", working: true });
  });

  it("advances running -> needs_approval (not working)", () => {
    expect(nextDemoFrame(1)).toEqual({ step: 2, status: "needs_approval", working: false });
  });

  it("wraps from the last step back to queued", () => {
    const last = DEMO_SEQUENCE.length - 1;
    expect(nextDemoFrame(last)).toEqual({ step: 0, status: "queued", working: false });
  });

  it("normalizes out-of-range / non-integer input", () => {
    expect(nextDemoFrame(-1)).toEqual({ step: 1, status: "running", working: true });
    expect(nextDemoFrame(3.7)).toEqual({ step: 0, status: "queued", working: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/board-demo.test.ts`
Expected: FAIL — cannot resolve `../board-demo`.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/board-demo.ts`:

```ts
/** Pure, deterministic lifecycle for the board's client-side demo card.
 *  Writes no data — drives a visual-only simulation in the Kanban board. */

export const DEMO_SEQUENCE = ["queued", "running", "needs_approval", "completed"] as const;

export type DemoStatus = (typeof DEMO_SEQUENCE)[number];

export type DemoFrame = {
  step: number;
  status: DemoStatus;
  working: boolean;
};

function frameForStep(step: number): DemoFrame {
  const status = DEMO_SEQUENCE[step];
  return { step, status, working: status === "running" };
}

export function initialDemoFrame(): DemoFrame {
  return frameForStep(0);
}

/** Given the current step index, return the next frame (wraps, normalizes input). */
export function nextDemoFrame(prevStep: number): DemoFrame {
  const len = DEMO_SEQUENCE.length;
  const current = ((Math.trunc(prevStep) % len) + len) % len;
  const step = (current + 1) % len;
  return frameForStep(step);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/board-demo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Re-export from the domain barrel**

In `src/domain/index.ts`, add after the last `export *` line:

```ts
export * from "./board-demo";
```

- [ ] **Step 6: Verify build + commit**

Run: `pnpm build`
Expected: compiles with no type errors.

```bash
git add src/domain/board-demo.ts src/domain/__tests__/board-demo.test.ts src/domain/index.ts
git commit -m "feat(board): pure demo lifecycle sequence"
```

---

## Task 2: Read-model surfaces priority, due date, and optional progress

**Files:**
- Modify: `src/lib/agent-operations/read-model.ts`
- Test: `src/lib/agent-operations/read-model.test.ts`

Context: `AgentOperationsTask` is defined at `src/lib/agent-operations/read-model.ts:30-45`. The `agent_tasks` select is at lines 270-276 (note: `priority` is already selected, `due_at` is **not**). `AgentTaskRow` is at lines 108-123. `mapTask` is at lines 555-585.

- [ ] **Step 1: Write the failing test (extend the existing mapping test)**

In `src/lib/agent-operations/read-model.test.ts`, the first test builds an `agent_tasks` mock row (lines 29-44). Add `due_at` and a `progress` metadata field to that row. Change the metadata line and add `due_at`:

Replace the row's `metadata: { risk_level: "medium" },` line with:

```ts
            due_at: "2026-06-15T18:00:00.000Z",
            metadata: { risk_level: "medium", progress: { done: 12, total: 20 } },
```

Then extend the `dashboard.tasks[0]` assertion (currently at lines 109-116) to also assert the new fields — add these keys inside the `toMatchObject({ ... })`:

```ts
      priority: "High",
      dueAt: "2026-06-15T18:00:00.000Z",
      progress: { done: 12, total: 20 },
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/agent-operations/read-model.test.ts`
Expected: FAIL — `tasks[0]` has no `priority` / `dueAt` / `progress` (undefined).

- [ ] **Step 3: Add `due_at` to the row type**

In `src/lib/agent-operations/read-model.ts`, in the `AgentTaskRow` type (lines 108-123), add after `approval_item_id: string | null;`:

```ts
  due_at: string | null;
```

- [ ] **Step 4: Add the fields to the public task type**

In `AgentOperationsTask` (lines 30-45), add after `status: string;`:

```ts
  priority: string;
  dueAt: string | null;
  progress: { done: number; total: number } | null;
```

- [ ] **Step 5: Select `due_at` from Supabase**

In the `agent_tasks` select (lines 270-276), add `due_at` to the column list. Change:

```ts
          "id,agent_id,status,priority,objective,task_type,source_type,source_id,campaign_id,approval_item_id,completed_at,created_at,updated_at,metadata",
```

to:

```ts
          "id,agent_id,status,priority,objective,task_type,source_type,source_id,campaign_id,approval_item_id,due_at,completed_at,created_at,updated_at,metadata",
```

- [ ] **Step 6: Add a `parseProgress` helper**

In `src/lib/agent-operations/read-model.ts`, add this near the other small helpers (e.g. just above `function asRecord` at line 882):

```ts
function parseProgress(value: unknown): { done: number; total: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const done = record.done;
  const total = record.total;
  if (typeof done !== "number" || typeof total !== "number") return null;
  if (!Number.isFinite(done) || !Number.isFinite(total)) return null;
  if (total <= 0 || done < 0) return null;
  return { done, total };
}
```

- [ ] **Step 7: Populate the fields in `mapTask`**

In `mapTask` (lines 555-585), the returned object already builds `metadata` via `const metadata = asRecord(task.metadata);` (line 564). In the returned object literal, add these three properties (place them right after `status: task.status,`):

```ts
    priority: titleize(task.priority ?? "medium"),
    dueAt: task.due_at ?? null,
    progress: parseProgress(metadata.progress),
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm test src/lib/agent-operations/read-model.test.ts`
Expected: PASS.

- [ ] **Step 9: Verify build + commit**

Run: `pnpm build`
Expected: compiles clean.

```bash
git add src/lib/agent-operations/read-model.ts src/lib/agent-operations/read-model.test.ts
git commit -m "feat(board): surface priority, due date, and optional progress in read-model"
```

---

## Task 3: Pure avatar resolution helpers

**Files:**
- Create: `src/app/_components/entity-avatar.helpers.ts`
- Test: `src/app/_components/entity-avatar.helpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/_components/entity-avatar.helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { initialsFromName, resolveHumanAvatar } from "./entity-avatar.helpers";

describe("initialsFromName", () => {
  it("returns first+last initials for multi-word names", () => {
    expect(initialsFromName("Evan Reppeto")).toBe("ER");
  });
  it("returns first two letters for a single word", () => {
    expect(initialsFromName("Arc")).toBe("MA");
  });
  it("falls back to ? for empty input", () => {
    expect(initialsFromName("   ")).toBe("?");
  });
});

describe("resolveHumanAvatar", () => {
  it("uses the photo when a non-empty url is present", () => {
    expect(resolveHumanAvatar({ name: "Evan Reppeto", profilePictureUrl: "https://x/p.png" }))
      .toEqual({ kind: "photo", url: "https://x/p.png" });
  });
  it("falls back to initials when url is missing or blank", () => {
    expect(resolveHumanAvatar({ name: "Evan Reppeto", profilePictureUrl: "  " }))
      .toEqual({ kind: "initials", initials: "ER" });
    expect(resolveHumanAvatar({ name: "Evan Reppeto" }))
      .toEqual({ kind: "initials", initials: "ER" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/_components/entity-avatar.helpers.test.ts`
Expected: FAIL — cannot resolve `./entity-avatar.helpers`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/_components/entity-avatar.helpers.ts`:

```ts
/** Pure avatar resolution — no React imports, unit-tested in the node env. */

export type AvatarOwner =
  | { kind: "agent" }
  | { kind: "human"; name: string; profilePictureUrl?: string | null };

export type HumanAvatarView =
  | { kind: "photo"; url: string }
  | { kind: "initials"; initials: string };

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function resolveHumanAvatar(owner: {
  name: string;
  profilePictureUrl?: string | null;
}): HumanAvatarView {
  const url = owner.profilePictureUrl?.trim();
  if (url) return { kind: "photo", url };
  return { kind: "initials", initials: initialsFromName(owner.name) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/_components/entity-avatar.helpers.test.ts`
Expected: PASS (5 assertions across 2 suites).

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/entity-avatar.helpers.ts src/app/_components/entity-avatar.helpers.test.ts
git commit -m "feat(board): pure avatar resolution helpers"
```

---

## Task 4: Promote MarkAvatar to a shared component

**Files:**
- Create: `src/app/arc/_components/arc-avatar.tsx`
- Modify: `src/app/arc/_components/message-list.tsx`

Context: `MarkAvatar` is currently defined inline in `message-list.tsx:73-86` and used at `message-list.tsx:397`. It imports `MarkSphere` (line 13) and `cx` (from `@/app/_components/theme`). Goal: move it out **with no visual change to the chat**, adding a `size` prop (default 32, the chat's current size).

- [ ] **Step 1: Create the shared component**

Create `src/app/arc/_components/arc-avatar.tsx`:

```tsx
"use client";

import { cx } from "@/app/_components/theme";

import { MarkSphere } from "./arc-sphere";

/** Arc's identity avatar — the shared WebGL sphere + teal "online" presence dot,
 *  with an optional "thinking" ring. Single source of truth for chat AND board. */
export function MarkAvatar({
  size = 32,
  pending = false,
  className,
}: {
  size?: number;
  pending?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "relative flex shrink-0 items-center justify-center rounded-full",
        pending ? "motion-safe:[animation:arc-ring_2.6s_cubic-bezier(.4,0,.2,1)_infinite]" : "",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <MarkSphere size={size} className="shadow-[inset_0_0_0_1px_var(--border-strong)]" />
      {/* Live presence dot — Arc is online (the chat polls). Ring, not glow. */}
      <span className="absolute -bottom-0.5 -right-0.5 z-[1] h-2.5 w-2.5 rounded-full bg-[var(--ok)] shadow-[0_0_0_2px_var(--canvas)]" />
    </span>
  );
}
```

- [ ] **Step 2: Import it in message-list and delete the local definition**

In `src/app/arc/_components/message-list.tsx`:

1. Add this import next to the other `_components` imports (alongside line 13's `import { MarkSphere } from "./arc-sphere";`):

```tsx
import { MarkAvatar } from "./arc-avatar";
```

2. Delete the local `function MarkAvatar(...) { ... }` block at lines 73-86 (the whole function).

Leave the usage at line 397 (`<MarkAvatar pending={pending} />`) unchanged — it now resolves to the imported component (size defaults to 32, identical to before).

- [ ] **Step 3: Verify the chat avatar still resolves (build + scoped lint)**

Run: `pnpm build`
Expected: compiles clean (no unused-import error for `MarkSphere` — confirm `message-list.tsx` still uses `MarkSphere` elsewhere; if not, remove its now-unused import).

Run: `pnpm exec eslint src/app/arc/_components/message-list.tsx src/app/arc/_components/arc-avatar.tsx`
Expected: no errors.

> Note: if `pnpm build` reports `MarkSphere` is now unused in `message-list.tsx`, delete the `import { MarkSphere } from "./arc-sphere";` line and re-run.

- [ ] **Step 4: Manual check**

Run `pnpm dev`, open `/arc`. Confirm Arc's message avatar (sphere + teal dot) looks exactly as before, including the "thinking" ring on a pending message.

- [ ] **Step 5: Commit**

```bash
git add src/app/arc/_components/arc-avatar.tsx src/app/arc/_components/message-list.tsx
git commit -m "refactor(arc): promote MarkAvatar to a shared component"
```

---

## Task 5: EntityAvatar chooser component

**Files:**
- Create: `src/app/_components/entity-avatar.tsx`

Context: uses the pure helpers from Task 3 and the shared `MarkAvatar` from Task 4. No automated test (JSX in a node-only test env); verified via build + lint + manual.

- [ ] **Step 1: Create the component**

Create `src/app/_components/entity-avatar.tsx`:

```tsx
"use client";

import { MarkAvatar } from "@/app/arc/_components/arc-avatar";

import { resolveHumanAvatar, type AvatarOwner } from "./entity-avatar.helpers";

/** One avatar slot for both kinds of board owner: Arc (sphere) and humans
 *  (profile photo, with initials fallback until photos exist). */
export function EntityAvatar({
  owner,
  size = 26,
  pending = false,
}: {
  owner: AvatarOwner;
  size?: number;
  pending?: boolean;
}) {
  if (owner.kind === "agent") {
    return <MarkAvatar size={size} pending={pending} />;
  }

  const view = resolveHumanAvatar(owner);
  return (
    <span
      className="relative flex shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      {view.kind === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote profile URL, no optimizer config
        <img
          src={view.url}
          alt={owner.name}
          className="h-full w-full rounded-full object-cover shadow-[inset_0_0_0_1px_var(--border-panel)]"
        />
      ) : (
        <span className="grid h-full w-full place-items-center rounded-full bg-[var(--surface-soft)] text-[9px] font-extrabold text-[var(--accent-strong)] shadow-[inset_0_0_0_1px_var(--border-panel)]">
          {view.initials}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Verify build + scoped lint**

Run: `pnpm build`
Expected: compiles clean.

Run: `pnpm exec eslint src/app/_components/entity-avatar.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/entity-avatar.tsx
git commit -m "feat(board): EntityAvatar chooser (Arc sphere / human photo)"
```

---

## Task 6: Redesign the card

**Files:**
- Modify: `src/app/agent-operations/task-kanban-board.tsx`

Context: the current `Card` is at `task-kanban-board.tsx:243-302`; the local `initials` helper is at lines 304-309; `KANBAN_CSS` is the template string at lines 330-356. `agentTint` (lines 317-328) stays. This task replaces the card's contents (avatar + objective + risk only) with the new anatomy and adds presence/shimmer/entrance CSS. **Do not** change drag behavior — keep `onPointerDown`, `ghost`, and `overlay` exactly as the call sites use them (lines 202-210, 234).

- [ ] **Step 1: Import EntityAvatar and the demo type**

At the top of `task-kanban-board.tsx`, add to the imports:

```tsx
import { EntityAvatar } from "../_components/entity-avatar";
```

- [ ] **Step 2: Replace the `Card` function**

Replace the entire `Card` function (lines 243-302) with:

```tsx
function Card({
  task,
  ghost = false,
  overlay = false,
  onPointerDown,
}: {
  task: AgentOperationsTask;
  ghost?: boolean;
  overlay?: boolean;
  onPointerDown?: (event: React.PointerEvent) => void;
}) {
  const accent = riskAccent(task.risk);
  const campaign = task.linkedObject.startsWith("Campaign:")
    ? task.linkedObject.replace(/^Campaign:\s*/, "")
    : null;
  const needsApproval = /approval/i.test(task.approval);
  const working = task.status === "running";
  const pct =
    task.progress && task.progress.total > 0
      ? Math.min(100, Math.round((task.progress.done / task.progress.total) * 100))
      : null;

  return (
    <article
      className={`kanban-card group rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2.5 ${
        ghost ? "kanban-card--ghost" : ""
      } ${overlay ? "kanban-card--overlay" : ""}`}
      onPointerDown={onPointerDown}
      style={{ boxShadow: `inset 3px 0 0 ${accent.bar}` }}
    >
      <div className="flex items-start gap-2">
        <EntityAvatar owner={{ kind: "agent" }} size={22} pending={working} />
        <div className="min-w-0">
          <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[var(--text-primary)]">
            {task.objective}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
            {task.task} · #{task.id}
          </p>
        </div>
      </div>

      {pct !== null ? (
        <div className="mt-2 pl-7">
          <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
          </div>
          <span className="mt-1 block text-[9.5px] font-medium text-[var(--text-muted)]">
            {task.progress!.done} of {task.progress!.total}
          </span>
        </div>
      ) : null}

      {working && !overlay ? <div className="kanban-shimmer ml-7 mt-2" /> : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-7">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: accent.text }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent.bar }} />
          {task.risk}
        </span>
        <span className="text-[10px] font-semibold text-[var(--text-muted)]">{task.priority}</span>
        {campaign ? (
          <span className="inline-flex max-w-[150px] items-center gap-1 truncate text-[10px] font-semibold text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">◆</span>
            <span className="truncate">{campaign}</span>
          </span>
        ) : null}
        {needsApproval ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--accent-strong)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Outbound
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between pl-7">
        <span className="text-[10px] font-medium text-[var(--text-muted)]">{formatDue(task.dueAt)}</span>
        {working ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--accent-strong)]">
            <span className="kanban-presence" />
            Arc · live
          </span>
        ) : null}
      </div>
    </article>
  );
}
```

> Note: the previous `Card` took an `agentName` prop and rendered initials. The new card uses `EntityAvatar` instead, so `agentName` is removed from `Card`. The call sites are updated in Step 3.

- [ ] **Step 3: Update the two `Card` call sites (drop the removed `agentName` prop)**

In the column render (around lines 202-210), change:

```tsx
                  {cards.map((task) => (
                    <Card
                      agentName={agentName(task.agentKey)}
                      ghost={drag?.taskId === task.fullId && dragging}
                      key={task.fullId}
                      onPointerDown={(event) => startDrag(event, task)}
                      task={task}
                    />
                  ))}
```

to:

```tsx
                  {cards.map((task) => (
                    <Card
                      ghost={drag?.taskId === task.fullId && dragging}
                      key={task.fullId}
                      onPointerDown={(event) => startDrag(event, task)}
                      task={task}
                    />
                  ))}
```

In the drag-overlay portal (around line 234), change:

```tsx
              <Card agentName={agentName(drag.task.agentKey)} overlay task={drag.task} />
```

to:

```tsx
              <Card overlay task={drag.task} />
```

> The `agentName(...)` helper (line 133) is still used by the filter dropdown (`agentName(key)` at line 156), so it stays. These are now unused and **must be deleted** or the build/lint will fail on unused symbols:
> - the local `initials` helper (lines 304-309),
> - the `agentTint` helper (lines 317-328),
> - the `AGENT_TINTS` constant (line 20).
>
> (The old card used `agentTint`/`initials` for the initials-avatar background; `EntityAvatar` replaces all of it.)

- [ ] **Step 4: Add `formatDue` helper**

Add near the other module-level helpers (e.g. just below `riskAccent`, around line 315):

```tsx
function formatDue(dueAt: string | null): string {
  if (!dueAt) return "No due date";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "No due date";
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}
```

- [ ] **Step 5: Add the presence / shimmer / entrance CSS**

In the `KANBAN_CSS` template string (lines 330-356), append before the closing backtick:

```css
.kanban-card { animation: kanban-card-in 200ms cubic-bezier(0.16,1,0.3,1); }
@keyframes kanban-card-in { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
.kanban-presence { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: kanban-pulse 1.5s infinite; }
@keyframes kanban-pulse { 0% { box-shadow: 0 0 0 0 var(--accent-soft); } 70% { box-shadow: 0 0 0 7px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
.kanban-shimmer { height: 4px; border-radius: 3px; background: linear-gradient(90deg, var(--surface-inset), var(--accent-soft), var(--surface-inset)); background-size: 200% 100%; animation: kanban-shimmer-move 1.3s linear infinite; }
@keyframes kanban-shimmer-move { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) {
  .kanban-card { animation: none; }
  .kanban-presence { animation: none; }
  .kanban-shimmer { animation: none; }
}
```

> The entrance animation plays when a card mounts. Because cards are keyed by `fullId` inside each column, moving a card to another column remounts it there → the entrance animation plays = the "card slid into its new column" effect, for free.

- [ ] **Step 6: Verify build + scoped lint**

Run: `pnpm build`
Expected: compiles clean (no reference to the removed `agentName` Card prop or the deleted `initials` helper).

Run: `pnpm exec eslint src/app/agent-operations/task-kanban-board.tsx`
Expected: no errors.

- [ ] **Step 7: Manual check**

Run `pnpm dev`, open `/board`. Confirm: cards show Arc's sphere, priority + risk + due, optional progress bar on any task with `metadata.progress`, and a "Arc · live" pulse + shimmer on Running cards. Drag still works and illegal drops still snap back.

- [ ] **Step 8: Commit**

```bash
git add src/app/agent-operations/task-kanban-board.tsx
git commit -m "feat(board): redesigned card with avatar, progress, priority, due, presence"
```

---

## Task 7: Demo toggle + live polling

**Files:**
- Modify: `src/app/agent-operations/task-kanban-board.tsx`

Context: adds an off-by-default "Demo" toggle to the toolbar (the filter row at lines 146-163) and a visibility-aware `router.refresh()` poll. `router` is already created at line 47. Uses `nextDemoFrame` / `initialDemoFrame` from `@/domain`.

- [ ] **Step 1: Import the demo helpers**

Add to imports:

```tsx
import { initialDemoFrame, nextDemoFrame, type DemoStatus } from "@/domain";
```

- [ ] **Step 2: Add demo + polling state and effects**

Inside the `TaskKanbanBoard` component, after the existing `useState`/`useOptimistic` hooks (after line 56), add:

```tsx
  const [demo, setDemo] = useState(false);
  const [demoFrame, setDemoFrame] = useState(initialDemoFrame);

  // Live polling: refresh the server data while the board is visible. When Arc
  // moves a task or reports progress via his API, the next refresh reflects it
  // and the entrance animation plays.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 8000);
    return () => window.clearInterval(id);
  }, [router]);

  // Demo simulation: a visual-only card that loops the lifecycle. Writes nothing.
  useEffect(() => {
    if (!demo) {
      setDemoFrame(initialDemoFrame());
      return;
    }
    const id = window.setInterval(() => {
      setDemoFrame((frame) => nextDemoFrame(frame.step));
    }, 1600);
    return () => window.clearInterval(id);
  }, [demo]);
```

- [ ] **Step 3: Build the demo card and merge it into the visible set**

After the `visible` / `open` / `closedCount` definitions (lines 137-139), add:

```tsx
  const demoTask: AgentOperationsTask | null = demo
    ? {
        id: "demo",
        fullId: "__demo__",
        agentKey: "arc",
        agentName: "Arc",
        task: "Demo",
        objective: "Demo · Arc working a task across the board",
        linkedObject: "Campaign: Demo Walkthrough",
        linkedHref: "/board",
        approvalHref: null,
        risk: "Low",
        approval: "Internal task",
        status: demoFrame.status,
        priority: "Medium",
        dueAt: null,
        progress: demoFrame.working ? { done: 12, total: 20 } : null,
        updated: "now",
        href: "/board",
      }
    : null;
```

Then, in the column body where cards are filtered (line 174, `const cards = open.filter(...)`), include the demo task in the matching column. Change:

```tsx
            const cards = open.filter((task) => task.status === col.key);
```

to:

```tsx
            const cards = [
              ...open.filter((task) => task.status === col.key),
              ...(demoTask && (demoTask.status as DemoStatus) === col.key ? [demoTask] : []),
            ];
```

> The demo card has a stable `key` (`__demo__`), so when `demoFrame.status` changes it remounts in the next column → the entrance animation plays = visible motion. It is excluded from drag commits because `startDrag` still works on it but `moveTaskAction` is never called for the demo (see Step 4 guard).

- [ ] **Step 4: Guard the demo card against real moves**

In `startDrag` (lines 72-90), add an early return at the top so the demo card animates but never triggers a server move or navigation:

```tsx
  function startDrag(event: React.PointerEvent, task: AgentOperationsTask) {
    if (event.button !== 0) return;
    if (task.fullId === "__demo__") return;
```

(Leave the rest of `startDrag` unchanged.)

- [ ] **Step 5: Add the toggle to the toolbar**

In the filter row (lines 146-163), just before the `<span className="ml-auto ...">` open-count line (line 160), add:

```tsx
        <button
          type="button"
          aria-pressed={demo}
          onClick={() => setDemo((value) => !value)}
          className={`h-8 cursor-pointer rounded-md border px-3 text-xs font-bold ${
            demo
              ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
              : "border-[var(--border-panel)] bg-[var(--surface-inset)] text-[var(--text-muted)]"
          }`}
          title="Visual-only simulation — writes no data"
        >
          {demo ? "Demo: on" : "Demo"}
        </button>
```

- [ ] **Step 6: Verify build + scoped lint**

Run: `pnpm build`
Expected: compiles clean.

Run: `pnpm exec eslint src/app/agent-operations/task-kanban-board.tsx`
Expected: no errors (the `useEffect` polling deps are `[router]`; demo deps `[demo]` — `setDemoFrame` is stable).

- [ ] **Step 7: Manual check**

Run `pnpm dev`, open `/board`. Toggle **Demo** on: a tagged card loops Queued → Running (shimmer + "Arc · live") → Needs approval → Completed, animating between columns. Toggle off: the demo card disappears and nothing was written. Confirm real cards are untouched and dragging a real card still works.

- [ ] **Step 8: Commit**

```bash
git add src/app/agent-operations/task-kanban-board.tsx
git commit -m "feat(board): off-by-default demo toggle + visibility-aware polling"
```

---

## Task 8: Light board polish (WIP counts + empty states)

**Files:**
- Modify: `src/app/agent-operations/task-kanban-board.tsx`

Context: the column header count pill is at lines 192-194; the empty-state line is at lines 212-214.

- [ ] **Step 1: Refine the column count to read as "open"**

Replace the count pill (lines 192-194):

```tsx
                  <span className="rounded-full bg-[var(--surface-raised)] px-1.5 text-[10px] font-bold text-[var(--text-muted)]">
                    {cards.length}
                  </span>
```

with a clearer treatment:

```tsx
                  <span className="rounded-full bg-[var(--surface-raised)] px-2 text-[10px] font-bold text-[var(--text-muted)]">
                    {cards.length} {cards.length === 1 ? "card" : "cards"}
                  </span>
```

- [ ] **Step 2: Calmer empty state per column**

Replace the empty-state block (lines 212-214):

```tsx
                  {cards.length === 0 && !isValidTarget ? (
                    <div className="px-1 py-3 text-[11px] italic text-[var(--text-muted)]">No tasks</div>
                  ) : null}
```

with:

```tsx
                  {cards.length === 0 && !isValidTarget ? (
                    <div className="rounded-lg border border-dashed border-[var(--border-hairline)] px-2 py-5 text-center text-[10.5px] font-medium text-[var(--text-muted)]">
                      Nothing {col.label.toLowerCase()}
                    </div>
                  ) : null}
```

- [ ] **Step 3: Verify build + scoped lint**

Run: `pnpm build`
Expected: compiles clean.

Run: `pnpm exec eslint src/app/agent-operations/task-kanban-board.tsx`
Expected: no errors.

- [ ] **Step 4: Manual check**

Open `/board`. Empty columns now show a calm dashed "Nothing queued / running / …" cell; headers read "n cards".

- [ ] **Step 5: Commit**

```bash
git add src/app/agent-operations/task-kanban-board.tsx
git commit -m "feat(board): WIP counts and calmer empty states"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run the full unit-test suite**

Run: `pnpm test`
Expected: all tests pass, including the new `board-demo`, `entity-avatar.helpers`, and the extended `read-model` tests.

- [ ] **Step 2: Typecheck via build**

Run: `pnpm build`
Expected: clean build, no type errors.

- [ ] **Step 3: Scoped lint on every changed/created file**

Run:

```bash
pnpm exec eslint src/domain/board-demo.ts src/app/_components/entity-avatar.helpers.ts src/app/_components/entity-avatar.tsx src/app/arc/_components/arc-avatar.tsx src/app/arc/_components/message-list.tsx src/app/agent-operations/task-kanban-board.tsx src/lib/agent-operations/read-model.ts
```

Expected: no errors.

- [ ] **Step 4: Manual end-to-end check**

Run `pnpm dev`:
- `/arc` — Arc's chat avatar unchanged (sphere + teal dot + thinking ring).
- `/board` — redesigned cards; progress bars on tasks with `metadata.progress`; presence + shimmer on Running; demo toggle loops a tagged card through the lifecycle with visible motion; empty columns show the calm dashed state; drag-and-drop and guardrails still work.

---

## Notes for the implementer

- **DRY:** the `initials` logic now lives only in `entity-avatar.helpers.ts`; the copy in `task-kanban-board.tsx` is deleted in Task 6.
- **YAGNI:** no Realtime, no inline card actions, no activity rail this round (see the spec's "Out of scope").
- **No data writes from the demo** — it is purely client state; never call `moveTaskAction` for `__demo__`.
- The human branch of `EntityAvatar` is built and unit-tested via the helpers, but the board only wires the `agent` branch today (all board tasks are agent-owned). The human/profile-photo path is ready for when human-owned cards exist.
