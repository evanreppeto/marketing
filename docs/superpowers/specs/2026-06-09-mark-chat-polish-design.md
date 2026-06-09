# Mark Chat — Polish & Completion Design

**Date:** 2026-06-09
**Status:** Approved (design phase)
**Scope owner:** Mark chat surface (`src/app/mark/**`, `src/lib/mark-chat/**`)

## Goal

Turn the Mark chat tab into a professional, complete, maintainable marketing-assistant
workspace. Every control works, the "thinking" state feels alive, thread management is
real, and the surface looks premium — all within the existing Signal design system
(`DESIGN.md`).

Mark's product role: an assistant the operator talks to like an LLM, who can also *act*
in the app (find leads, add them to the CRM, generate campaigns). The UI must make those
actions legible — when Mark references or creates a record, the operator can click into it.

## Non-goals

- No change to the Hermes/Mark webhook contract (`/api/v1/hermes/messages/**`) or the
  Mac-side `mark-chat-responder` skill.
- No live AI in the app; outbound stays locked. Mark still replies via the existing
  enqueue → pending bubble → poll → complete flow.
- No full "action result cards" backend (deferred — see Follow-ups). We render richer
  result affordances from the data Mark *already* sends (`mentions`, `media`).
- Exactly **one** additive DB migration (`pinned_at`). Nothing else touches schema.

## Architecture & layering

Follows the repo convention: `src/lib/mark-chat/` (I/O, persistence) → `src/app/mark/`
(server page + colocated `_components/`). Server actions in `src/app/mark/actions.ts` stay
gated by `requireOperator()` + `isSupabaseAdminConfigured()` and `revalidatePath("/mark")`.

### Data layer changes (`src/lib/mark-chat/persistence.ts`)

- Add `pinnedAt: string | null` to `MarkConversation` and `pinned_at` to
  `ConversationRow` / `CONVERSATION_COLUMNS` / `toConversation`.
- `listConversations` ordering: `pinned_at` desc-nulls-last, then `last_message_at` desc.
  (Pinned float to top; within each group, most-recent first.)
- New helpers:
  - `setConversationPinned(id, pinned: boolean)` — sets `pinned_at` to `now()` or `null`.
  - `deleteConversation(id)` — hard-deletes the conversation (messages cascade via FK; if
    no cascade exists, delete `mark_messages` for the conversation first).
  - `cancelPendingMarkMessage(conversationId)` — deletes the latest `pending` mark message
    row for the conversation (the "stop generating" backing op). Safe if none exists.

### Migration

New timestamped file in `supabase/migrations/`:
`<ts>_mark_conversations_pinned_at.sql` — `alter table mark_conversations add column
pinned_at timestamptz;` plus an index `(operator, pinned_at desc nulls last,
last_message_at desc)` to keep the list query cheap. Additive only; never edits a shipped
migration.

### Server actions (`src/app/mark/actions.ts`)

Wire the orphaned `renameConversation` and add the small new ones. Mirror the existing
fire-and-forget `*Form` pattern for sidebar controls; use `useActionState` shape only where
the UI needs inline feedback (rename).

- `renameThreadAction` — already exists; now actually called by the UI.
- `renameThreadForm(formData)` — fire-and-forget variant for the sidebar menu.
- `pinThreadForm(formData)` / `unpinThreadForm(formData)` — toggle pin.
- `deleteThreadForm(formData)` — delete conversation; if it was active, the caller
  navigates back to `/mark`.
- `renameProjectForm(formData)` — wires existing `renameProject`.
- `cancelReplyAction(conversationId)` — calls `cancelPendingMarkMessage`; returns nothing
  (client optimistically drops the pending bubble and stops polling).

All validate input, guard auth + Supabase, and `revalidatePath("/mark")`.

## Component design

Files under `src/app/mark/_components/`. Keep each focused; extract shared bits.

### New / extracted units

- `use-thread-poll.ts` (hook) — extracts the pending-reply polling loop currently inline in
  `mark-chat.tsx` (`sameMessages` + interval + safety cap). Inputs: `activeId`,
  `messages`, `setMessages`. Returns nothing; owns its own effect lifecycle. Makes
  `mark-chat.tsx` thin and the polling independently testable.
- `thread-menu.tsx` — the per-row `⋯` overflow popover (Rename · Move to project · Pin/Unpin
  · Archive · Delete). Closes on outside-click / Escape. Delete shows an inline confirm step
  ("Delete?") rather than a separate modal. Keyboard accessible.
- `icon-button.tsx` — shared small square icon button (used by message toolbar, header,
  menu trigger) so we stop re-deriving button classes. Backed by `theme.ts` tokens.

### `thread-sidebar.tsx`

- **Search box** at top: controlled input filtering the already-loaded `conversations`
  client-side (case-insensitive title match). No backend round-trip.
- Section order: **Pinned** (if any) · per-**Project** · **Chats** (unprojected) · Archived
  link. Pinned rows show a small pin glyph.
- Each row: title + relative timestamp ("2h", "Tue", "Mar 4") computed from
  `lastMessageAt`; on hover/focus, the `⋯` trigger reveals `ThreadMenu`. Removes the always-
  visible inline `<select>`+archive (moved into the menu) for a cleaner row.
- Active row keeps the current raised-surface treatment.

### `mark-chat.tsx` (header + shell)

- Header title becomes an **inline rename**: click (or a small pencil `IconButton`) swaps the
  `<h1>` for an input bound to `renameThreadAction`; Enter saves, Escape cancels, blur saves.
  Only when a thread is active (not on a fresh "New chat").
- Header meta line: project name (if any) + message count, muted.
- Header keeps the Operations link; gains a `⋯` for the active thread (same `ThreadMenu`).
- Polling moves into `useThreadPoll`.

### `message-list.tsx`

- **Hover toolbar** per message row (appears on hover/focus, keyboard reachable):
  - Mark replies: **Copy** (clipboard, with a 1.5s "Copied" confirm), and when it's the
    latest reply, no destructive actions.
  - Failed replies: **Retry** — re-submits the last operator message (reuses the composer's
    send path via a callback).
- **Richer thinking state** (pending mark message):
  - Avatar breathes/glows (CSS `status-breathe`-style, transform/opacity only).
  - When `steps.length === 0`: shimmer "Mark is thinking…" line (CSS gradient sweep on text,
    reduced-motion → static).
  - When steps exist: timeline gains a connective vertical line; running step shows a small
    spinner, done steps show the check and fade their label to secondary. An **elapsed
    timer** (mm:ss since the pending bubble appeared) sits at the bottom next to the **Stop**
    button.
- **Stop** button: optimistically removes the pending bubble, stops the poll, and calls
  `cancelReplyAction`. If Mark's reply still lands later (race), the next natural refresh
  shows it — acceptable.
- **Result affordances** (zero-backend slice of "action cards"): when a Mark reply carries
  `mentions`, render them as a labeled "References" cluster of record chips (already links);
  when it carries `media`, the existing gallery stands. Add a subtle section heading so a
  reply like "Added 3 leads" reads as actionable links, not loose chips.

### `empty-state.tsx`

Refresh the four suggestion cards toward marketing-assistant intent, e.g.:
- "Find new leads for @persona" → seeds an `@` mention.
- "Add these leads to the CRM" / "Summarize what needs my approval".
- "Draft a campaign for @persona".
- "Which leads are hottest right now?"
Keep the staggered `msg-rise` entrance.

### `composer.tsx`

Minor polish only (keep the working @-mention popover, auto-grow, send/spinner). Ensure the
Retry path can re-trigger a send programmatically.

## Motion (within `DESIGN.md §6`)

New `@keyframes` in `globals.css`, all transform/opacity, all gated by the existing
`prefers-reduced-motion` block:
- `avatar-breathe` — gentle scale/opacity loop for the pending avatar.
- `text-shimmer` — background-position sweep for the "thinking" text (reduced-motion: none).
- Reuse `msg-rise` for new rows/menus. No layout-dimension animation, no bounce/elastic.

## Error handling

- Every new action guards auth + Supabase config and fails soft (returns/no-throws to the
  client); destructive ones (`delete`) are behind the inline confirm.
- `cancelReplyAction` is best-effort; client UX doesn't block on it.
- Search/filter is pure client state — no failure surface.
- Optimistic UI (rename, stop, pin) reconciles on `revalidatePath` / `router.refresh()`.

## Testing

- `persistence` unit tests for the new pure/IO helpers where they have logic worth pinning:
  ordering of `listConversations` with pins (pure sort helper extracted if needed),
  `cancelPendingMarkMessage` selecting the latest pending row. Follow the existing
  `inbox.test.ts` / `steps.test.ts` patterns (vitest).
- `use-thread-poll` — extract `sameMessages` (already pure) and keep/extend its coverage.
- Manual verification checklist (run the app): rename (header + menu), pin/unpin ordering,
  archive/restore, delete + redirect, move-to-project, search filter, stop generating, copy,
  retry on failure, thinking animation + reduced-motion, mention/media rendering.

## Maintainability outcome

After this pass: `mark-chat.tsx` is a thin shell (no inline polling), the sidebar row logic
lives in `ThreadMenu`, polling lives in `useThreadPoll`, and icon buttons are shared. Each
file has one clear job, matching the repo's `domain → lib → app` layering and colocated
`_components` convention.

## Follow-ups (out of scope, noted)

- Full **action-result cards** (Mark emits structured "created lead / drafted campaign"
  payloads → rich cards). Needs a Mark-contract change.
- **Saved prompts / prompt library** for repeated marketing tasks.
- **Message feedback** (👍/👎) persisted to tune Mark.
- Server-side conversation **search** if thread counts outgrow client-side filtering.
