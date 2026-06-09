# Mark Chat — Foundation Pass (Schema Fix + Premium Polish)

**Date:** 2026-06-09
**Status:** Approved (design phase)
**Scope owner:** Mark chat surface (`src/app/mark/**`, `src/lib/mark-chat/**`, `supabase/migrations/**`)

This is the **"A — solid foundation"** pass: make every existing control actually work,
premium-grade, and fix the schema bug that breaks the sidebar. It consolidates and
supersedes the scope of `2026-06-09-mark-chat-polish-design.md` by adding the missing
projects schema. Uploads, slash commands, and external connections are **deferred** to
their own later specs (see Follow-ups) but the UI leaves slots for them.

## Goal

Turn `/mark` into a professional, complete marketing-assistant workspace the team uses
daily to talk to Mark, make campaigns, find leads, and reference memories. Every button
works against a real backend; thread management is real; the "thinking" state feels alive;
the surface looks premium — all within the Signal design system (`DESIGN.md`).

## Non-goals (this pass)

- No document/data **upload** (next round; composer leaves a `+` slot).
- No **slash commands** (next round; reuses the `@`-popover machinery).
- No external **connection plumbing** — Mark (the external Hermes agent) already holds the
  Gmail/Drive/Linear/etc. plugins; the app only surfaces them later (header slot left).
- No change to the Hermes/Mark webhook contract (`/api/v1/hermes/messages/**`) or the
  Mac-side `mark-chat-responder` skill.
- No live AI in the app; outbound stays locked. Mark replies via the existing enqueue →
  pending bubble → poll → complete flow.

## The bug being fixed (load-bearing)

The phase-1 projects code shipped in `src/lib/mark-chat/persistence.ts` —
`CONVERSATION_COLUMNS` selects `project_id`, and `createProject`/`assignConversationToProject`
read/write a `mark_projects` table — but **no migration ever created them**. The only shipped
migration is `20260608120000_mark_chat.sql`. With Supabase configured, every conversation
query fails (selects a non-existent column), breaking the whole sidebar, not just projects.

## Architecture & layering

Repo convention: `src/lib/mark-chat/` (I/O, persistence) → `src/app/mark/` (server page +
colocated `_components/`). Server actions in `src/app/mark/actions.ts` stay gated by
`requireOperator()` + `isSupabaseAdminConfigured()` and `revalidatePath("/mark")`.

### Migration — one new additive file

`<ts>_mark_projects_and_pins.sql`:

- `create table public.mark_projects` — `id uuid pk default gen_random_uuid()`,
  `operator text not null check(length(btrim(operator))>0)`, `name text not null
  check(length(btrim(name))>0)`, `created_at`/`updated_at timestamptz not null default now()`,
  `metadata jsonb not null default '{}'`. `enable row level security`. `set_updated_at`
  trigger (mirrors `mark_conversations`).
- `alter table public.mark_conversations add column project_id uuid references
  public.mark_projects(id) on delete set null` — deleting a project orphans its chats
  (they fall back to "Chats"), never deletes them.
- `alter table public.mark_conversations add column pinned_at timestamptz` — the pin
  feature, folded in so this is one migration not two.
- `create index mark_conversations_pin_idx on public.mark_conversations(operator,
  pinned_at desc nulls last, last_message_at desc)` — keeps the list query cheap.
- `create index mark_projects_operator_idx on public.mark_projects(operator)`.

Additive only; never edits a shipped migration.

### Data layer (`src/lib/mark-chat/persistence.ts`)

- Add `pinnedAt: string | null` to `MarkConversation`; add `pinned_at` to
  `ConversationRow` / `CONVERSATION_COLUMNS` / `toConversation`.
- `listConversations` ordering: `pinned_at` desc-nulls-last, then `last_message_at` desc.
- New helpers (mirror existing ones, guarded by `assertOk`):
  - `setConversationPinned(id, pinned: boolean)` — sets `pinned_at` to `now()`/`null`.
  - `deleteConversation(id)` — hard-delete; `mark_messages` cascade via existing FK.
  - `cancelPendingMarkMessage(conversationId)` — deletes the latest `pending` mark message
    row (the "stop generating" backing op). Safe no-op if none exists.
- (`createProject`, `listProjects`, `renameProject`, `assignConversationToProject` already
  exist — they just start working once the table is real.)

### Server actions (`src/app/mark/actions.ts`)

Mirror the existing fire-and-forget `*Form` pattern; `useActionState` shape only where the
UI needs inline feedback (rename). All validate input, guard auth + Supabase,
`revalidatePath("/mark")`.

- `renameThreadAction` — exists; now actually wired to the header inline-rename.
- `renameThreadForm(formData)` — fire-and-forget variant for the row menu.
- `pinThreadForm` / `unpinThreadForm(formData)` — toggle pin.
- `deleteThreadForm(formData)` — delete; if it was active the client navigates to `/mark`.
- `renameProjectForm(formData)` — wires existing `renameProject`.
- `cancelReplyAction(conversationId)` — calls `cancelPendingMarkMessage`; best-effort, the
  client optimistically drops the pending bubble and stops polling.

## Component design (`src/app/mark/_components/`)

### New / extracted units

- `use-thread-poll.ts` (hook) — extracts the inline pending-reply polling loop from
  `mark-chat.tsx` (`sameMessages` + interval + ~10min safety cap). Makes the shell thin and
  the polling independently testable.
- `thread-menu.tsx` — per-row `⋯` overflow popover (Rename · Move to project · Pin/Unpin ·
  Archive · Delete). Closes on outside-click / Escape; Delete shows an inline "Delete?"
  confirm; keyboard accessible.
- `icon-button.tsx` — shared small square icon button (message toolbar, header, menu
  trigger), backed by `theme.ts` tokens, so button classes stop being re-derived.

### `thread-sidebar.tsx`

- **Search box** at top: controlled input filtering the loaded `conversations` client-side
  (case-insensitive title match). No backend round-trip.
- Section order: **Pinned** (if any) · per-**Project** · **Chats** (unprojected) · Archived
  link. Pinned rows show a small pin glyph.
- Each row: title + relative timestamp ("2h", "Tue", "Mar 4") from `lastMessageAt`; on
  hover/focus the `⋯` trigger reveals `ThreadMenu`. Removes the always-visible inline
  `<select>`+archive (moved into the menu).
- Active row keeps the raised-surface treatment. Project creator input stays.

### `mark-chat.tsx` (header + shell)

- Header title becomes an **inline rename**: click (or a pencil `IconButton`) swaps `<h1>`
  for an input bound to `renameThreadAction`; Enter saves, Escape cancels, blur saves. Only
  when a thread is active.
- Header meta line: project name (if any) + message count, muted.
- Keeps the Operations link; gains a `⋯` (same `ThreadMenu`) for the active thread, and a
  reserved (empty for now) slot where the future "what Mark can reach" connections indicator
  will live.
- Polling moves into `useThreadPoll`.

### `message-list.tsx`

- **Hover toolbar** per row (hover/focus, keyboard reachable): Mark replies get **Copy**
  (clipboard + 1.5s "Copied" confirm); failed replies get **Retry** (re-submits the last
  operator message via a composer callback).
- **Richer thinking state** (pending mark message):
  - Avatar breathes/glows (CSS, transform/opacity only).
  - `steps.length === 0`: shimmer "Mark is thinking…" line (reduced-motion → static).
  - steps exist: timeline gains a connective vertical line; running step shows a spinner,
    done steps show a check and fade to secondary. **Elapsed timer** (mm:ss since the
    pending bubble appeared) + **Stop** button at the bottom.
- **Stop**: optimistically removes the pending bubble, stops the poll, calls
  `cancelReplyAction`. A late-landing reply (race) shows on the next natural refresh —
  acceptable.
- **References cluster** (zero-backend slice of "action cards"): when a Mark reply carries
  `mentions`, render them under a small "References" heading as record chips (already links);
  `media` keeps the existing gallery. Makes "Added 3 leads" read as actionable links.

### `empty-state.tsx`

Refresh the four suggestion cards toward marketing-assistant intent, e.g. "Find new leads
for @persona" (seeds an `@`), "What needs my approval?", "Draft a campaign for @persona",
"Which leads are hottest right now?". Keep the staggered `msg-rise` entrance.

### `composer.tsx`

Minor polish only (keep the working @-popover, auto-grow, send/spinner). Two forward-looking
requirements: (1) expose a way for Retry to re-trigger a send programmatically; (2) lay out
the input row so a leading `+` attach button can slot in later without relayout.

## Motion (within `DESIGN.md §6`)

New `@keyframes` in `globals.css`, all transform/opacity, gated by the existing
`prefers-reduced-motion` block: `avatar-breathe` (pending avatar), `text-shimmer` (thinking
text; reduced-motion: none). Reuse `msg-rise` for new rows/menus. No layout-dimension
animation, no bounce/elastic.

## Error handling

- Every new action guards auth + Supabase config and fails soft (no throws to client);
  destructive `delete` is behind the inline confirm.
- `cancelReplyAction` is best-effort; client UX never blocks on it.
- Search/filter is pure client state — no failure surface.
- Optimistic UI (rename, stop, pin) reconciles on `revalidatePath` / `router.refresh()`.

## Testing

- `persistence` unit tests for new logic worth pinning: `listConversations` pin ordering
  (extract a pure sort helper if needed), `cancelPendingMarkMessage` selecting the latest
  pending row. Follow existing `inbox.test.ts` / `steps.test.ts` vitest patterns.
- `use-thread-poll` — keep/extend `sameMessages` coverage (already pure).
- Manual verification checklist (run the app, Supabase configured): create/move project,
  rename (header + menu), pin/unpin ordering, archive/restore, delete + redirect, search
  filter, stop generating, copy, retry on failure, thinking animation + reduced-motion,
  mention/media rendering.

## Maintainability outcome

`mark-chat.tsx` becomes a thin shell (no inline polling); row logic lives in `ThreadMenu`;
polling in `useThreadPoll`; icon buttons shared. Each file has one clear job, matching the
repo's `domain → lib → app` layering and colocated `_components` convention.

## Follow-ups (own specs, out of scope here)

- **Uploads** — attach-to-message, project knowledge base, and data/CSV ingest via Supabase
  Storage; render through existing `media`/mentions. (Composer `+` slot reserved.)
- **Slash commands** — `/find-leads`, `/draft-campaign`, etc., reusing the `@`-popover.
- **Connections indicator** — read-only surface of the plugins Mark already holds
  (Gmail/Drive/Linear/Mailchimp/Stripe). (Header slot reserved.)
- Full structured **action-result cards** (needs a Mark-contract change).
- Message **feedback** (👍/👎) to tune Mark.
