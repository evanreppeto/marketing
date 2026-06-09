# Mark Chat — Premium Experience Pass (Design)

**Date:** 2026-06-09
**Status:** Approved (design phase)
**Scope owner:** Mark chat surface (`src/app/mark/**`, `src/lib/mark-chat/**`) + Mark-worker contract docs

## Goal

Make the Mark chat feel premium and alive — fixing the barren "thinking" state, the blank
new-chat screen, and the lack of structured results — grounded in how leading AI chat
products (ChatGPT, Claude, Perplexity, v0) handle these moments. Everything is built
app-side and **degrades gracefully**: new affordances light up as Mark's worker sends the
data, but nothing breaks without it.

Research synthesis lives in the conversation; the four chosen directions:
1. **Waiting state → adaptive** (skeleton + progress sweep that morphs into the live step timeline).
2. **Empty state → input-first** (centered composer, capability line, action chips).
3. **Action cards → rich + inline approval** (results as cards; drafts approvable in-chat).
4. **Composer → slash commands + mode picker** (`/` menu, `@` records, keyboard hints, Ask/Act/Draft stance).

Plus a per-message toolbar (Regenerate + 👍/👎; Copy/Retry already exist).

## Non-goals

- No document/data **upload** (the composer keeps its reserved `+` slot inert; uploads is its own round).
- No **permissions layer** in the app: the mode picker *sends* the stance; Mark's worker enforces it.
- No real **token streaming**: replies still arrive via the enqueue → pending → poll → complete flow. All "alive" affordances (skeleton, step reveal, progress sweep) are achievable without streaming.
- No change to the webhook **transport** (`/api/v1/hermes/messages/**`); we only add fields to existing payloads.

## Architecture & the app/worker split

Repo convention holds: `src/domain/` (pure) → `src/lib/mark-chat/` (I/O) → `src/app/mark/`
(server page + colocated `_components/`). Server actions stay gated by `requireOperator()` +
`isSupabaseAdminConfigured()` + `revalidatePath("/mark")`.

**Built app-side (this codebase):** all rendering and composer behavior; the app sends the
chosen `mode`; draft-card approval reuses the existing campaign approval actions.

**Delivered as worker contract docs (you wire on Mark's Mac worker):**
1. Emit steps via the existing `POST /api/v1/hermes/messages/{agentTaskId}/steps` → lights up the waiting state.
2. Include `metadata.actions[]` in replies → renders action cards.
3. Read `mode` off the task metadata → honors Ask / Take action / Draft.

All three are additive; the app renders/sends today and the worker catches up.

## Data model (additive)

All on the existing `mark_messages.metadata` jsonb and `agent_tasks.metadata` jsonb — **no
new tables**.

### `MarkActionCard` (`src/lib/mark-chat/persistence.ts`)

```ts
export type MarkActionFlag = { tone: "ok" | "warn" | "risk"; label: string };
export type MarkActionRow = { name: string; meta?: string; badge?: string; href?: string };
export type MarkActionApproval = { kind: "campaign"; id: string };
export type MarkActionCard = {
  kind: "result" | "draft";
  title: string;
  href?: string;                 // "View in CRM ▸" / "Open draft ▸"
  rows?: MarkActionRow[];        // result rows
  preview?: string;              // draft preview text
  flags?: MarkActionFlag[];      // on-brand / needs-asset etc.
  approval?: MarkActionApproval; // present on kind:"draft" when approvable in-app
};
```

Parsed from `metadata.actions` with a defensive `parseActions(value: unknown)` (mirrors the
existing `parseSteps`/`parseMedia` — drop malformed entries, never throw). Add
`actions: MarkActionCard[]` to `MarkMessage` and to `toMessage`. Update the `sameMessages`
poll-equality check to compare `actions.length` (so a reply gaining cards re-renders).

### `mode` on the queued task

`sendMarkMessageAction` accepts `mode: "ask" | "act" | "draft"` (default `"ask"`), validated
in `@/domain` (`parseMarkMode`). `enqueueMarkChatTask` writes it into the `agent_tasks`
metadata; `notifyMarkWebhook` includes it in the payload. The worker reads it (contract #3).

### Feedback

`setMarkMessageFeedback(messageId, value: "up" | "down" | null)` writes
`metadata.feedback`. `MarkMessage` gains `feedback: "up" | "down" | null`. No migration.

## Components (`src/app/mark/_components/`)

### `action-card.tsx` (new)

One focused unit rendering a `MarkActionCard`:
- **result** — bordered card: header (icon + title + optional `href` link), then `rows` as
  clickable lines (`name` · `meta` · `badge`). Badge styled like the lead-score chip.
- **draft** — header + `preview` (italic, muted) + `flags` row; an actions row. When
  `approval?.kind === "campaign"`, the **Approve / Request revision / Decline** buttons are
  `<form action={…}>` calling the existing campaign approval server actions in
  `src/app/campaigns/actions.ts` — `decideApprovalAction` (approve/decline) and
  `requestRevisionAction` — with `approval.id` (the plan pins their exact FormData shape);
  otherwise render only the `href`
  "Open draft ▸" link. A muted "outbound locked" affordance (SVG lock, **no emoji**) sits at
  the row's end. Buttons follow `theme.ts` `button` variants (`approve`/`revision`/`decline`).

### `message-list.tsx`

- **Adaptive `PendingBlock`:** breathing avatar; when `steps.length === 0` → 2–3 shimmer
  skeleton lines + an indeterminate progress sweep + the elapsed timer + Stop; when steps
  exist → the connective-line step timeline (running = pulsing dot, done = check) + timer +
  Stop. (Replaces the current steps-or-shimmer branch with one adaptive block.)
- **Action cards:** for non-pending messages, render `message.actions.map(ActionCard)` above
  the References cluster.
- **Toolbar:** add **Regenerate** (non-failed Mark replies → `onRegenerate`) and **👍/👎**
  (calls `setMarkMessageFeedback`; selected state highlighted). Keep Copy; keep Retry on failed.

### `composer.tsx`

- **`/` command popover:** a registry `SLASH_COMMANDS = [{cmd, label, hint, prompt, mode?}]`
  (`/find-leads`, `/draft-campaign` (presets mode `draft`), `/whats-pending`, `/summarize`).
  A `/`-at-start match opens the same popover component the `@` search uses; selecting
  inserts the templated `prompt` (and applies `mode?`). Reuse the existing popover styling.
- **Mode picker chip:** a small left-aligned `Ask ▾` control opening a 3-item menu (Ask /
  Take action / Draft) with one-line descriptions; selected mode held in state, rendered as
  a hidden `mode` field, sent by the form. Default Ask. Closes on outside-click/Escape
  (reuse the `ThreadMenu` close pattern).
- **Keyboard-hint line** under the input: `↵ send · ⇧↵ newline · / commands · @ records`
  (muted, hidden while the `@`/`/` popover is open). The reserved `+` attach stays inert.

### `empty-state.tsx` + `mark-chat.tsx` (shell)

- Empty state becomes **input-first**: centered Mark mark, `What can Mark help with?`, a
  restrained capability line ("Mark can find leads · draft campaigns · reference your records
  & memories — outbound stays locked"), then the **composer centered**, then action chips
  (pill-shaped, click → fills draft like today's suggestions).
- The shell renders the composer **centered inside the empty state** when the thread has no
  messages, and **docked at the bottom** once it does. Implementation: lift a `centered`
  boolean into the shell; the empty state hosts the composer slot when centered. A first send
  transitions to docked on the natural re-render (no bespoke animation required; a subtle
  `msg-rise` is enough).

## Backend (`src/app/mark/actions.ts`, `src/lib/mark-chat/**`)

- `sendMarkMessageAction` — accept + validate `mode`; thread it through
  `enqueueMarkChatTask` (→ `agent_tasks.metadata.mode`) and `notifyMarkWebhook` (→ payload `mode`).
- `regenerateMarkReplyAction(conversationId, markMessageId)` — find the operator message
  immediately preceding the given Mark reply, enqueue a fresh task + pending bubble for it
  (reuses the send path's enqueue/notify/claim sequence). Best-effort like the existing flow.
- `setMarkMessageFeedback(messageId, value)` — guarded; updates `metadata.feedback`; `revalidatePath`.
- Draft-card approval calls the **existing** campaign approval actions; no new approval backend.

## Worker contract appendix (deliverable docs, not app code)

A new doc `docs/mark-worker-contract-premium.md` (and update the existing
`mark-chat-responder` skill) specifying:
1. **Steps:** `POST /api/v1/hermes/messages/{agentTaskId}/steps {label, status}` before/after each action (endpoint exists).
2. **Action cards:** reply `metadata.actions: MarkActionCard[]` — with the exact schema above and examples (result + draft-with-approval).
3. **Mode:** read `task.metadata.mode` (`ask|act|draft`); Ask = read-only, Act = may mutate records, Draft = create drafts for approval. Outbound stays locked regardless.

## Error handling

- All new parsers (`parseActions`, mode) are defensive — malformed data is dropped, never thrown; the message still renders.
- New server actions guard auth + Supabase and fail soft; destructive card actions reuse the campaign flow's existing guards.
- Feedback/regenerate are best-effort; optimistic UI reconciles on `revalidatePath`/poll.
- Centered→docked composer is pure layout state; no failure surface.
- Reduced-motion: skeleton/progress/breathe all gated by `motion-safe:` / the existing `prefers-reduced-motion` block.

## Testing

- **Pure/unit (vitest):** `parseActions` (valid/partial/garbage), `parseMarkMode` (valid/default), slash-command registry resolution, `sameMessages` updated to include `actions`. Follow existing `persistence.test.ts`/`steps.test.ts` patterns.
- **Persistence:** `setMarkMessageFeedback` writes `metadata.feedback` scoped by id; `regenerate` enqueue path (mock).
- **Manual checklist:** waiting skeleton→steps morph; empty input-first + first-send dock; slash menu insert + `/draft-campaign` presets mode; mode chip sends mode (verify on the queued task); result card rows link; draft card Approve/Revise/Decline drive the campaign flow; Regenerate; feedback toggle; reduced-motion.

## Sequencing

One cohesive app-side build (states → composer → cards → toolbar → backend fields), then the
worker-contract doc. Suggested order so visible wins land first: **Waiting C → Empty C →
Composer (slash + hints + mode) → Action cards → Toolbar (regenerate + feedback) → backend
`mode`/feedback/regenerate → worker contract doc.**

## Follow-ups (out of scope)

- Document/data **uploads** (composer `+` slot).
- Persisted feedback **analytics** to tune Mark (currently just stored on the message).
- App-side **permissions** enforcement of mode (today the worker enforces).
- **Sources-as-records** richer citations beyond the References cluster.
