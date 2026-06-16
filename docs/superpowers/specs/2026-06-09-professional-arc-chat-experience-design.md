# Professional Arc Chat Experience — Design

Date: 2026-06-09
Status: Approved in brainstorming by Evan (spec pending his review)

## Goal

Make the app's **Arc** tab feel like a polished, professional assistant experience:
1. **Live step-by-step activity** — while a reply is pending, show what Arc is *actually* doing as a live checklist that resolves into his answer (not a generic "thinking…").
2. **Projects** — group conversations under named projects in the left sidebar.
3. **Archive** — archive/unarchive conversations (backend already exists).
4. **Polish** — fix the sparse/misaligned thread layout and tighten the overall feel.

## Decisions (from brainstorming, 2026-06-09)
- Design **everything, phased** (one cohesive spec; live-activity flagged as the cross-system phase).
- Live activity = **real step-by-step feed** (Arc reports each step), not a generic animation.
- Projects v1 = **grouping only** (no per-project custom instructions yet — future).
- Archive = **UI on the existing backend** (`archiveConversation`, `status='archived'` already in `src/lib/arc-chat/persistence.ts`).

## Architecture / conventions
Follows the app's existing layering: `src/domain` (pure) → `src/lib/arc-chat` (I/O) →
`src/app/arc` (UI) + `src/app/api/v1/arc` (agent API). Reuse existing patterns:
bearer-token routes (`checkBearerToken`), `isSupabaseAdminConfigured` guards, the
`createSupabaseQueryMock` test helper, and the existing thread polling
(`getThreadMessagesAction` → `listMessages`).

**Build-coordination caution:** `src/app/arc/**` and `src/lib/arc-chat/**` are under
active parallel development. Implement from this spec in coordination with whoever is in
those files; prefer additive changes and small, focused commits.

---

## Feature A — Live step-by-step activity *(Phase 2 — cross-system)*

**Data model.** A pending Arc message carries an ordered list of steps in its existing
`metadata` jsonb: `metadata.steps: [{ label: string, status: "running"|"done", at: string }]`.
No new table. `arc_messages.metadata` and `MESSAGE_COLUMNS` already include `metadata`,
so steps flow through the existing message read path.

**New endpoint.** `POST /api/v1/arc/messages/{agentTaskId}/steps` (bearer
`ARC_AGENT_API_TOKEN`, mirrors the other arc routes). Body:
`{ "label": string, "status"?: "running"|"done" }` (default `running`). Behavior:
find the pending Arc message by `agentTaskId` (reuse `findPendingMessageByTask`), append
the step to `metadata.steps` (or flip the last matching `running` step to `done` when the
same label is re-posted as `done`). `404` if no pending message; `400` if `label` empty;
`201 { ok:true }` on success. Idempotent-friendly: re-posting an identical done step is a no-op.

**Persistence.** Add `appendMarkStep({ agentTaskId, label, status }, client?)` to
`src/lib/arc-chat/persistence.ts` (read row → merge step into `metadata.steps` → update).
Extend `toMessage` to parse `metadata.steps` into `MarkMessage.steps` (typed
`MarkStep[]`).

**Read/UI.** `MarkMessage` gains `steps: MarkStep[]`. In `message-list.tsx`, when a Arc
message is `pending`, render an **ActivityTimeline** (each step: `✓` done / `⟳` running,
label, subtle stagger) instead of the bare "Waiting for Arc…". When the message turns
`complete`, render the final body with the step trace collapsed into a small
"Show what Arc did" disclosure. Existing 2.5s thread polling drives the live updates —
no new client machinery.

**Arc's side (his worker).** Update the `arc-chat-responder` skill: before each
meaningful action POST a `running` step (e.g. "Searching Meta Ad Library"), flip it to
`done`, then POST the final reply via the existing reply endpoint. Steps are best-effort
(a failed step POST never blocks the reply). Outbound stays locked.

---

## Feature B — Projects *(Phase 1 — app-only)*

**Data model.** New migration (via Supabase MCP `apply_migration`, since the branch has no
local migrations dir): table `arc_projects (id uuid pk, operator text not null,
name text not null, created_at timestamptz default now(), updated_at timestamptz default now())`
with `set_updated_at` trigger and RLS enabled (service-role only). Add nullable
`project_id uuid references arc_projects(id) on delete set null` to `arc_conversations`.

**Persistence** (`src/lib/arc-chat/persistence.ts`): `createProject`, `listProjects(operator)`,
`renameProject`, `assignConversationToProject(conversationId, projectId|null)`. `listConversations`
returns `project_id` so the sidebar can group.

**Server actions** (`src/app/arc/actions.ts`, gated by `requireOperator` +
`isSupabaseAdminConfigured`): `createProjectAction`, `moveConversationAction`,
`renameProjectAction`.

**UI** (`thread-sidebar.tsx`): render projects as collapsible groups (project name → its
chats), with un-projected chats listed below under "Chats". Add **New project** and a
per-chat **Move to project** affordance.

---

## Feature C — Archive *(Phase 1 — app-only)*

Backend exists (`archiveConversation`, `status='archived'`; `listConversations` already
filters to `active`). Add:
- `unarchiveConversation(id)` and `listArchivedConversations(operator)` in persistence.
- `archiveThreadAction` already exists; add `unarchiveThreadAction`.
- UI: a per-chat hover menu with **Archive**; a sidebar **Archived** toggle/section that
  lists archived chats with **Unarchive** and open-to-view.

---

## Feature D — Polish *(Phase 1 — app-only)*

- Fix the thread layout: constrain messages to the centered column so short operator
  messages stop hugging the far-right edge / floating near the header (the "stray pill"
  look). Verify operator bubble + Arc message align within the same column.
- Improved empty thread + pending states; consistent spacing; the new ActivityTimeline
  styling matches the app's tokens (`DESIGN.md`).
- Keep changes additive/surgical given parallel work in these files.

---

## Phasing
- **Phase 1 (build now, app-only):** Projects (B) + Archive (C) + Polish (D). No Arc
  dependency; delivers the professional feel immediately.
- **Phase 2 (cross-system):** Live step-by-step activity (A) — the steps endpoint + UI
  timeline + Arc's worker emitting steps. Can be promoted ahead of Phase 1 if desired,
  but it requires Arc-side coordination.

## Testing
- **Domain/persistence:** unit-test `appendMarkStep` step-merge logic and project
  create/list/move/assign with `createSupabaseQueryMock` (mirror existing arc-chat tests).
- **Steps endpoint:** follow the house convention (thin route; logic tested at the
  persistence layer). Add a `toMessage` test that parses `metadata.steps`.
- **UI:** the ActivityTimeline render is exercised via the read-model/message mapping; keep
  the component a pure function of `MarkMessage.steps`.
- Full `pnpm vitest run` + `pnpm lint` stay green; existing chat tests unaffected.

## Out of scope (YAGNI)
Per-project custom instructions/files; real-time push (polling is fine); cross-operator
sharing of projects; reordering/pinning; analytics on Arc's steps.
