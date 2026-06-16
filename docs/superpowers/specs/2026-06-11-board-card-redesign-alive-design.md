# Board Card Redesign + Alive Layer — Design

**Date:** 2026-06-11
**Status:** Approved design, pending implementation plan
**Author:** Evan Reppeto (with Claude)

## 1. Overview

A UI/quality pass on the shared Kanban board (`/board`, rendered by
`src/app/agent-operations/task-kanban-board.tsx`). The board already works
server-side (5 lifecycle columns, drag-to-transition with guardrails, agent
filter, free-form task creation, and Arc's `/api/v1/arc/tasks` claim/log/
complete/block API). What's thin is the **card itself** — today it is near-flat
text — and the board's sense of being a *live, shared* surface between the
operator (Evan) and the agent (Arc).

This design does three things:

1. **Redesign the task card** into a scannable unit with progress, priority,
   risk grammar, owner avatar, linked record, and due/age.
2. **Add an "alive" layer** — agent presence, status-change motion, and a draft
   shimmer — so you can watch Arc work.
3. **Add a client-side demo toggle** so the live feel is visible *before* Arc
   is wired into the app, using the same animation hooks that fire for real once
   he connects.

It is **not** a backend protocol change. Arc's task API, the move guardrails,
and the approval gate are untouched.

## 2. Goals / non-goals

**Goals**
- Higher-quality, more legible cards that read at a glance.
- The board feels alive: presence, motion, and an obvious "Arc is working" cue.
- Arc's identity on the board is the **same** as in the chat (single source of
  truth), and the human avatar slot is profile-picture-ready.
- Everything degrades gracefully: no fake data, motion respects
  `prefers-reduced-motion`, and nothing breaks when Supabase is unconfigured.

**Non-goals (this round)**
- No inline intervention controls (approve/answer/reassign on the card) — later.
- No activity-feed rail — later.
- No Supabase Realtime push — interval polling is sufficient for v1.
- No changes to Arc's agent API or the move/approval guardrails.

## 3. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Direction | **Elevated, alive task card** (directions C/D deferred) |
| 2 | Arc's avatar | **Reuse the chat's `<MarkSphere>` + presence dot** — promoted to a shared component |
| 3 | Human avatar | **Same circular slot**, `profilePictureUrl` with initials fallback (photos later) |
| 4 | Demo mode | **Toggle, off by default**; client-side only, writes no data |
| 5 | Blast radius | **Card + light board polish** (WIP counts, better empty states) |
| 6 | Live updates | **Interval `router.refresh()` polling**; Realtime is a later upgrade |
| 7 | Progress bar | **Optional** — shown only when `metadata.progress` exists |

## 4. Architecture & layering

Follows the app's `domain → lib → app` convention. No I/O moves into `domain/`.

- `src/lib/agent-operations/read-model.ts` (extend) — surface `priority` and
  `dueAt` on `AgentOperationsTask` (both already on `agent_tasks`; `due_at` must
  be added to the `select`). Add an optional `progress` field derived from
  `metadata.progress` when present.
- `src/app/arc/_components/arc-avatar.tsx` (new) — promote the `MarkAvatar`
  currently inline in `message-list.tsx` (sphere + teal presence dot + thinking
  ring) into a shared, reusable component. `message-list.tsx` imports it instead
  of defining it locally — **no visual change to the chat.**
- `src/app/_components/entity-avatar.tsx` (new) — a thin chooser: given an owner
  (`{ kind: "agent" } | { kind: "human", profilePictureUrl?, name }`), renders
  Arc's `MarkAvatar` for the agent or a circular human avatar (photo →
  initials). The board and any future surface use this one component.
- `src/app/agent-operations/task-kanban-board.tsx` (rewrite the `Card` fn) — new
  card anatomy, presence/motion, and a `demo` toggle in the board toolbar.
- `src/domain/board-demo.ts` (new) — pure, deterministic `nextDemoFrame(state)`
  describing the simulated card's lifecycle position. I/O-free, unit-tested.

## 5. Card anatomy

Top to bottom (left bar = risk color, as today):

- **Header row:** owner avatar (Arc sphere / human photo) + objective (2-line
  clamp) + a muted subtitle (`task type · #shortId`).
- **Progress** (optional): a thin bar + "12 of 20" label, only when
  `metadata.progress = { done, total }` is present. Hidden otherwise.
- **Meta row:** priority pill, risk pill (gold/green/red grammar), linked-record
  chip (campaign / lead), and the "Outbound locked" marker when an approval is
  attached.
- **Foot row:** due/age (`⧖ due in 2d`) and, when the agent is actively on the
  card, a live presence cue (`● Arc · live`).

Status grammar (unchanged from the kanban design doc): **gold = needs you,
green = ok, red = genuinely high/destructive.**

## 6. Read-model changes

In `getAgentOperationsDashboard` → `mapTask`:

- Add `due_at` to the `agent_tasks` `select`.
- Expose `priority: titleize(task.priority)` (column already selected).
- Expose `dueAt: task.due_at ?? null`.
- Expose `progress: parseProgress(metadata.progress)` →
  `{ done: number; total: number } | null` (validated; null when absent or
  malformed). No fake values.

`AgentOperationsTask` type gains `priority: string`, `dueAt: string | null`,
`progress: { done: number; total: number } | null`.

## 7. Shared avatar component

The chat's `MarkAvatar` (in `message-list.tsx`) is the source of truth: a
`<MarkSphere size>` with a teal presence dot and an optional thinking ring. We:

1. Move it to `arc-avatar.tsx`, export `MarkAvatar({ size, pending, online })`.
   `message-list.tsx` imports it — pixel-identical chat behavior.
2. `EntityAvatar` renders `MarkAvatar` for agent owners and a circular human
   avatar (CSS `object-cover` photo, initials fallback) for human owners.

Because the board renders many avatars, the existing shared-WebGL-context design
of `MarkSphere` already covers performance (one context, N cheap 2D copies); the
CSS `<MarkOrb>` fallback applies when WebGL is unavailable.

## 8. Alive layer

- **Presence:** the teal dot + `● Arc · live` show only while the agent is on
  the card (status `running`, or `metadata.active === true`).
- **Status-change motion:** when a card's status changes between renders, it
  slides into its new column. Reuses the motion vocabulary already in the file's
  `KANBAN_CSS` (the drag overlay / slot animations), kept consistent.
- **Draft shimmer:** a subtle shimmer bar on cards in **Running**.
- **Reduced motion:** all of the above sit behind
  `@media (prefers-reduced-motion: reduce)` no-op rules, matching the existing
  kanban CSS block.

## 9. Demo mode

- A **"Demo"** toggle in the board toolbar (next to the agent filter), **off by
  default**, client-state only.
- When on, a single simulated card advances Queued → Running (draft shimmer +
  "Arc working…") → Needs approval → Completed on a loop, driven by the pure
  `nextDemoFrame` domain function.
- **Writes no data.** It is layered over the real board purely in the client and
  vanishes when toggled off. Fully reversible, demo-safe (honors the
  "approval-safe, no side effects" rule in `CLAUDE.md`).
- The simulated card is visually tagged so it is never mistaken for real work.

## 10. Live updates (real)

A lightweight interval that calls `router.refresh()` while the board is mounted
and the tab is visible (pauses on `visibilitychange` hidden). This reuses the
board's existing `revalidatePath` server model — when Arc moves a task or
reports progress via his API, the next refresh reflects it, and the
status-change motion plays. Supabase Realtime (true push) is explicitly a later,
separate upgrade.

## 11. Board polish (light)

- **WIP counts** in column headers (the count pill exists; add a subtle
  "n open" treatment; no hard WIP limits this round).
- **Better empty states:** replace the bare "No tasks" with a calm, on-brand
  empty cell per column.
- **Needs-approval emphasis:** keep the accent-strong header treatment already
  present; ensure the "needs you" gold cue is consistent on cards.

No column/lane restructure; the 5-column + Closed-tray layout is unchanged.

## 12. Testing

Follows the wired-feature shape:

- `src/domain/__tests__/board-demo.test.ts` — `nextDemoFrame` sequence,
  looping, and reduced-motion start state.
- `read-model` mapping tests — `priority`, `dueAt`, and `progress`
  (present / absent / malformed `metadata.progress`).
- `entity-avatar` render tests — agent → `MarkAvatar`; human with photo → img;
  human without photo → initials.
- A regression check that `message-list.tsx` still renders the (now imported)
  `MarkAvatar` unchanged.

## 13. Out of scope

- Inline intervention controls on cards (direction C).
- Activity-feed rail (direction D).
- Supabase Realtime push updates.
- Per-user profile-picture upload/storage (the slot is built; the upload flow is
  a separate project). Until then humans render initials.
- Any change to Arc's agent API, move guardrails, or the approval gate.

## 14. Open questions

None blocking. The shape of `metadata.progress` is defined here
(`{ done, total }`); if Arc later reports progress differently, `parseProgress`
is the single adapter point.
