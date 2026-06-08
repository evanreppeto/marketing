# Design: "Talk to Mark" — Conversational Control Surface

Date: 2026-06-08
Status: Approved (pending spec review)
Route: `/mark` (becomes the primary "Mark" nav surface)

## Summary

A ChatGPT-style page for talking to **Mark** (the Hermes agent). The operator
holds multi-thread conversations, @-mentions specific records (campaigns, leads,
CRM objects, personas, vault notes) to ground the discussion, and Mark replies
asynchronously. The page is the new primary "Mark" surface; the existing
`/agent-operations` task-queue dashboard stays reachable via an "Operations"
link.

This is a backend-first feature consistent with the repo posture: durable
conversation/message records, a queue (`agent_tasks`) for operator messages, a
bearer-gated callback API for Mark's replies, and **outbound stays locked** —
the chat never sends anything externally.

## Decisions (from brainstorm)

- **Mark's brain = the real Hermes agent**, not an in-app LLM. This app holds no
  model key; Hermes is the brain and integrates via the existing bearer-gated
  API pattern.
- **Connection = async queue + callback.** Operator message is persisted and
  enqueued as an `agent_task`. Hermes processes it and POSTs its reply back to a
  new bearer-gated endpoint `POST /api/v1/hermes/messages`. No outbound/streaming
  dependency from this app.
- **Multi-thread** with a left history sidebar (ChatGPT-style), not a single log.
- **Chat is the primary Mark page** at `/mark`; nav "Mark" repointed there; the
  `/agent-operations` dashboard is linked as "Operations".
- **Mentionable at launch:** Campaigns, Leads, the six CRM objects
  (companies/contacts/properties/jobs/outcomes), the 12 personas, and vault notes.
- **Live updates = short polling** for v1 (Realtime is a fast-follow).
- **Message-row layout** (avatar + label + content, alternating subtle bg), not
  literal chat bubbles — reads like a command-center log and fits the Signal
  design system.

## Non-Goals

- No in-app LLM / Anthropic / OpenAI integration. Hermes is the brain.
- No token streaming in v1 (async queue model; the "thinking" indicator covers
  the wait). Streaming would require the synchronous-call model, not chosen.
- No outbound sending, publishing, launching, or spend from the chat. Any action
  Mark proposes routes through the existing approval pipeline; the chat only
  links to it.
- No Supabase Realtime in v1 (fast-follow once client anon-key wiring exists).
- No changes to the existing `/agent-operations` routes beyond adding a link from
  the chat and repointing the nav label.

## Architecture (layering)

`src/domain/mark-chat.ts` (pure) → `src/lib/mark-chat/` (I/O, persistence,
mention search) → `src/app/mark/` (server components + colocated `_components/`,
`actions.ts`) + `src/app/api/v1/hermes/messages/route.ts` (callback).

### Data model — `supabase/migrations/<timestamp>_mark_chat.sql`

`mark_conversations`
- `id` uuid pk
- `operator` text (creator operator key/email)
- `title` text (deterministic: derived from first operator message)
- `status` text check in ('active','archived') default 'active'
- `created_at` / `updated_at` / `last_message_at` timestamptz
- `metadata` jsonb default '{}'

`mark_messages`
- `id` uuid pk
- `conversation_id` uuid fk → mark_conversations(id) on delete cascade
- `role` text check in ('operator','mark','system')
- `body` text
- `status` text check in ('sent','pending','complete','failed') default 'sent'
  - operator messages insert as `sent`; the Mark placeholder inserts as
    `pending` and flips to `complete` (or `failed`) on callback.
- `agent_task_id` uuid null (links a Mark `pending` message to the queued task)
- `mentions` jsonb default '[]' — `[{type,id,label,href}]`
- `created_at` timestamptz default now()
- `metadata` jsonb default '{}'

Indexes: `mark_messages(conversation_id, created_at)`,
`mark_conversations(operator, last_message_at desc)`.

Grants/RLS: follow the existing migration conventions (admin/service-role access;
match how `vault_notes` / `agent_*` tables are granted). No anon client access in
v1 (polling goes through operator-gated server actions).

### Domain logic — `src/domain/mark-chat.ts` (unit-tested in `__tests__`)

- `deriveThreadTitle(firstMessage): string` — deterministic truncation/cleanup
  (no LLM); e.g. first ~60 chars, trimmed on word boundary, fallback "New chat".
- `validateMarkMessageInput({ body, mentions }): Result` — non-empty after trim,
  max length, mention shape validation.
- `serializeMentions` / `parseMentions` — stable encoding between composer and
  stored `mentions` jsonb.
- `orderMessages(messages)` — chronological ordering helper.
- Re-export through `src/domain/index.ts`.

### Persistence + glue — `src/lib/mark-chat/`

- `persistence.ts` — repos over the two tables: `createConversation`,
  `listConversations(operator)`, `getConversation(id)`, `renameConversation`,
  `archiveConversation`, `listMessages(conversationId)`, `insertOperatorMessage`,
  `insertPendingMarkMessage`, `getMessagesSince(conversationId, since)`,
  `completeMarkMessage(messageId, body, metadata)` / `failMarkMessage`.
- `enqueue.ts` — wraps/extends `sendMarkDirective` (`src/lib/campaigns/
  mark-conversation.ts`) to create the `agent_task` (`task_type:
  "mark_chat_message"`, `metadata: { conversation_id, message_id, mentions,
  source: "mark_chat", outbound_locked: true }`) + `agent_task_inputs` carrying
  the operator message and resolved mention snapshots. Returns `agentTaskId`.
- `mention-search.ts` — `searchMentionables(query, types?)` queries the existing
  read-models and returns grouped, typed results
  `{ type, id, label, sublabel, href }`:
  - Campaigns ← `getCampaignWorkspaceList` (`src/lib/campaigns/read-model.ts`)
  - Leads + CRM objects ← `getCrmObjectData` (`src/lib/crm/read-model.ts`)
  - Personas ← `OFFICIAL_PERSONA_MAPPINGS` (`src/domain/personas.ts`, in-memory)
  - Vault notes ← `listVaultNotes` (`src/lib/vault/persistence.ts`)
- `mention-context.ts` — `resolveMentionSnapshots(mentions)` → minimal record
  summaries attached to the task so Hermes has grounded context.

All persistence guarded by `isSupabaseAdminConfigured()`; degrade gracefully.

### Server actions — `src/app/mark/actions.ts`

All `"use server"`, gated by `requireOperator()` + `isSupabaseAdminConfigured()`,
returning `{ ok, message, ... } | null` and calling `revalidatePath("/mark")`.

- `sendMarkMessage(conversationId | null, formData)`:
  1. Validate via `validateMarkMessageInput`.
  2. If no conversation, create one (title via `deriveThreadTitle`).
  3. Insert operator message (`sent`) with mentions.
  4. `resolveMentionSnapshots` → `enqueue` agent_task.
  5. Insert `pending` Mark message bound to `agent_task_id`.
  6. revalidate; return new conversation id (for first message).
- `createThread()`, `renameThread(id, title)`, `archiveThread(id)`.
- `searchMentionablesAction(query, types?)` — thin operator-gated wrapper over
  `mention-search` for the autocomplete.
- `getThreadMessages(conversationId, sinceIso)` — operator-gated read for the
  client poller (returns messages newer than `since`, incl. status changes).

### Callback API — `src/app/api/v1/hermes/messages/route.ts`

- `POST`, bearer-gated `checkBearerToken(request, "HERMES_AGENT_API_TOKEN")`.
- Body: `{ conversationId, replyTo (agentTaskId or operator messageId), body,
  status?: "complete" | "failed", metadata? }`.
- Looks up the `pending` Mark message by `agent_task_id` (or conversation +
  replyTo), flips it to `complete` with `body`/`metadata` (or `failed`), updates
  `last_message_at`. Returns `201`; `400` invalid, `401` unauthorized, `404`
  unknown conversation/message, `503` not configured. Mirrors `/runs` codes.
- Outbound remains locked — this endpoint only records a chat reply.

## Frontend — `src/app/mark/`

`page.tsx` (server component): loads `listConversations(operator)` and the active
thread's messages (active = `?c=<id>` search param, default newest). Renders the
full-height shell. Degraded preview when Supabase unconfigured.

Colocated `_components/`:
- `chat-shell.tsx` — full-height grid: sidebar + conversation + composer.
- `thread-sidebar.tsx` — "New chat", conversation list (title + relative time),
  active highlight, rename/archive affordances. Uses shared primitives + tokens.
- `message-list.tsx` / `message-row.tsx` — message rows (avatar + role label +
  content), alternating subtle backgrounds, mention chips rendered as linked
  pills, JetBrains-mono timestamps. A `mark` message with reference metadata
  renders a small reference card linking to the approval/campaign surface.
- `thinking-indicator.tsx` — CSS-only pulsing tri-dot + "Mark is thinking…"
  (`status-breathe`, transform/opacity only, `prefers-reduced-motion` honored).
  Shown whenever the latest Mark message is `pending`. Optional progress label
  from `metadata.progress`.
- `composer.tsx` — multiline textarea; Enter sends / Shift+Enter newline; `@`
  opens the mention popover; selected mentions become removable chips; send
  disabled while a reply is pending in the thread. `useActionState` over
  `sendMarkMessage`.
- `mention-popover.tsx` / `mention-chip.tsx` — grouped, searchable autocomplete
  (debounced `searchMentionablesAction`), keyboard-navigable; chips link to the
  record and carry `{type,id,label,href}`.
- A small client poller hook: while a `pending` message exists in the active
  thread, poll `getThreadMessages` every ~2–3s (idle backoff), reconciling new
  rows and status flips into local state.

Design adherence (DESIGN.md): Signal dark palette + tokens from `theme.ts`/
`globals.css`; Archivo/Hanken/JetBrains type; reuse `PageHeader`/`Panel`/
`Button`/`StatusPill` primitives; no emojis, no neon/purple, CSS-only motion.

## App-shell / nav

`src/app/_data/growth-engine.ts`: repoint the "Mark" `navItems` entry from
`/agent-operations` to `/mark`. The chat header carries an "Operations ▸" link
to `/agent-operations`. No other nav changes.

## Error & empty states

- No threads yet → instructive empty state with example prompts that show the
  @-mention idea ("Ask about a @campaign, a @lead, or a @persona").
- Empty active thread → composer-focused prompt.
- Supabase not configured → read-only preview explaining setup (consistent with
  the rest of the app); send disabled.
- Send failure / task enqueue failure → inline result banner; Mark message can be
  marked `failed` with a retry affordance.
- Mention search with no results → quiet "No matches" in the popover.

## Testing / Verification

- `src/domain/__tests__/mark-chat.test.ts`: title derivation, input validation,
  mention serialize/parse, ordering.
- Persistence/enqueue: covered by the existing patterns; manual verification that
  a sent message creates conversation + operator message + agent_task + pending
  Mark message.
- Callback API: manual/integration check that a POST flips the pending message to
  complete and the poller surfaces it; auth (401), not-configured (503),
  validation (400) paths.
- Manual UI (`pnpm dev`): create thread, send with mentions, see thinking
  animation, simulate a callback, confirm reply renders; sidebar switching;
  reduced-motion; degraded (no Supabase) preview.
- `pnpm lint` and `pnpm build` clean.

## Build order (phased plan, one spec)

1. Migration + `src/domain/mark-chat.ts` + tests + `src/lib/mark-chat/`
   persistence/repos.
2. Send pipeline (`enqueue`, `sendMarkMessage`) + callback API route.
3. Chat UI (shell, sidebar, message rows, thinking indicator, composer) +
   polling + nav repoint.
4. @-mention autocomplete + chips + `mention-context` snapshot attachment.
5. Degradation, empty states, reference cards, polish.

## Risks / Notes

- Polling cost is bounded (only while a message is pending, with idle backoff);
  Realtime upgrade is isolated to the poller hook + a client Supabase setup.
- Message ordering: composer disabled while pending keeps the per-thread queue
  ordered; Hermes replies are matched by `agent_task_id`.
- `agent_task` reuse: `task_type: "mark_chat_message"` is new; the
  agent-operations dashboard read-models may surface these tasks — acceptable
  (they're legitimate Mark work), but verify they don't break existing filters.
- The Hermes agent must implement the new callback contract; document it
  alongside `/api/v1/hermes/runs` (token doc).
- `.claude/worktrees/*` copies are out of scope.
