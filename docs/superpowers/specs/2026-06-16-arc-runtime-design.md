# Arc Runtime — Design

**Date:** 2026-06-16
**Status:** Approved design, pending implementation plan
**Scope:** Evolve `apps/arc-runner` from a one-tool, stateless chat responder into the Arc marketing-operator runtime, properly wired into the Growth Engine app.

---

## Background — what exists today

Arc is the Claude agent for the Growth Engine, surfaced in the **/mark** chat tab. It runs as a separate TypeScript service, `apps/arc-runner`, on the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`, the `query()` loop), authed by a Claude subscription token (`CLAUDE_CODE_OAUTH_TOKEN`).

Flow today:

1. Operator sends a message in /mark → app persists it (`mark_messages`), queues an `agent_task`, and POSTs a signed `mark_chat_message` wake to the runner (`src/lib/mark-chat/notify.ts` → `apps/arc-runner/src/server.ts`).
2. The runner acks fast, then runs Arc out-of-band (`handler.ts` → `arc.ts` `runArc()`), posting live steps and the final reply back to `/api/v1/hermes/messages` (+ `/steps`).
3. /mark polls and renders the reply, steps, and any action cards.

This works, but Arc is **thin**:

- **One tool.** Arc has exactly `find_leads` (`GET /api/v1/hermes/crm/leads`). The app already exposes ~20 Operations API endpoints Arc could use; it uses one.
- **Stateless.** Each message is a fresh `query({ prompt })` with no thread history — Arc forgets the conversation.
- **Context dropped.** The wake payload carries `mode` (ask/act/draft), `route` (fast/standard), `mentions`, `operator`, `assistantTone`, `assistantResponseStyle`, `approvalStrictness`, `conversationId`, `attachments`, `command` — `runArc` uses only `message` + `model`.
- **No action cards.** The reply posts only `body`; `metadata.actions[]` (which the app already renders, including inline Approve/Decline draft cards) is never produced.
- **No project/campaign awareness.** Conversations belong to projects and can be linked to campaigns; Arc sees none of it.

### What's already wired in the app (Arc just isn't using it)

- **Chat loop end-to-end** — send → persist → queue → wake → reply/steps render live.
- **Action-card rendering**, including draft cards with inline review/approve — `src/app/mark/_components/message-list.tsx` (≈ lines 409–458) splits `draft` vs non-draft cards and wires `onReview`.
- **~20 Operations API endpoints** under `/api/v1/hermes/*`: CRM (`companies`, `contacts`, `leads`, `jobs`, `outcomes`, `properties`, `interactions`), `brain/query` + graph, `campaigns` (+`[id]`), `drafts`, `approvals` (+recommendations), `competitor-intel`, `social-ads`, `tasks`, `messages` (+`steps`).

The work is therefore mostly **teaching Arc to use the surface that already exists**, plus a small additive change to the wake payload.

---

## Decisions (locked)

| Decision | Choice |
|---|---|
| Loop ownership | **Claude Agent SDK self-hosted** (the existing runner). Not Managed Agents, not raw Anthropic SDK. |
| Scope (target) | **Chat + proactive**, phased: Phase 1 = rich scoped chat turn; Phase 2 = proactive runs. Full sub-agent workforce is a later layer (seam only). |
| Tenancy / auth | **Single-tenant now, multi-tenant-ready.** Keep the subscription token; thread an explicit business/org context object through prompt + tools so going multi-tenant is a config + auth swap, not a rewrite. |
| Deploy target | **Host-agnostic.** Same webhook contract runs locally now and on Cloud Run later; deployment is a documented seam, not built here. |
| Memory | **Per-conversation, app-injected** (last N turns in the wake). Not SDK session-resume. |

---

## Architecture

### 1. One "Arc turn" engine

Refactor `runArc()` into a single primitive:

```
runArcTurn(task: ArcTask, ctx: ArcContext, client): Promise<ArcResult>
```

- `ArcTask` — normalized unit of work, carrying a **scope** (see §3), the message/objective, `mode`, `route`, `mentions`, `attachments`, `command`, and bounded `history`.
- `ArcContext` — the business/tenant context object (BSR now): brand voice, personas, approved-media policy, compliance/restricted-claims rules, behavior hints (tone/style/strictness). This is the multi-tenant seam.
- `ArcResult` — `{ body, actions: ArcCard[], status: "complete" | "failed" }`.

The chat path and the future proactive path differ only in **input source** (webhook wake vs. a created `agent_task`) and **output sink** (chat reply vs. approval record). The engine is identical and **stateless per call** — scope is passed in, never held in module state, so concurrent chats are independent `query()` calls.

### 2. Honor the context that's already plumbed

`runArcTurn` consumes the full wake payload:

- `route` → model: `fast` = `claude-haiku-4-5`, `standard` = `claude-opus-4-8`.
- `mode` (ask/act/draft) → **gates the tool set** (§4) and is stated in the prompt.
- `mentions` → resolved records injected into the prompt as context.
- `assistantTone` / `assistantResponseStyle` / `approvalStrictness` → appended as a style/strictness block.
- `ArcContext` (business block) → injected so the system prompt is per-business, not hardcoded prose.

### 3. Scope: how Arc works across chats, projects, and campaigns

The chat data model is **Project → Conversation (session) → Messages**:

- `mark_projects` — named group of conversations (per operator). Assets are shared at this level.
- `mark_conversations` — one chat session: `id`, `title`, nullable `project_id`, nullable `campaign_id`.
- `mark_messages` — turns within one conversation (`conversation_id` FK).

Every `ArcTask` carries `scope = { conversationId, projectId, campaignId, operator }`. Behavior:

- **Memory is per-conversation.** Each turn loads that conversation's last N turns and passes them as history. Different chat → different `conversationId` → different history → **no cross-chat bleed, by construction.** This is why memory is app-injected, not SDK session-resume: `mark_messages` is already the durable, per-conversation source of truth; a separate per-chat SDK session store surviving webhook cold starts / Cloud Run scale-out would be a liability.
- **Project is ambient context.** If `project_id` is set, Arc can read the project's shared assets (the existing `listProjectAssetMessages`) via a tool — so a chat inside a project knows what its sibling chats produced (matching the Studio's project-wide asset library).
- **Campaign is ambient context.** If `campaign_id` is set, the linked campaign package loads as read-only context, grounding the chat in the campaign it's attached to.
- **Concurrency is free.** Each wake runs out-of-band as an independent stateless call.

### 4. Tool surface, gated by mode

Grow from 1 tool to a tiered surface wrapping the **existing** Operations API endpoints. Each tool emits a `running → done` step (the live trace), exactly as `find_leads` does, so new tools auto-appear in the chain-of-thought.

- **Read tools (all modes):** search CRM (companies/contacts/leads/jobs/outcomes/properties), get one record, `brain/query` + graph, list campaigns + status, list personas, recent assets/approvals, project assets (`listProjectAssetMessages`).
- **Draft/write tools (`act` / `draft` only):** create draft campaign, add CRM interaction (note/follow-up), draft asset — all landing **approval-gated** via the existing `drafts` / `campaigns` / `crm/interactions` / `approvals` endpoints.
- **Outbound tools:** **none, ever.** Enforced in code (the tool does not exist), not just the prompt.

Mode gating: `ask` = read-only; `act` = read + CRM writes/interactions; `draft` = read + create approval-gated drafts. Outbound stays locked in every mode.

### 5. Action cards (structured output)

Give Arc an `emit_card` tool to attach structured cards to its reply:

- **result cards** — clickable record rows (`rows[]` with name/meta/badge/href).
- **draft cards** — `preview`, `flags[]`, and an `approval` block; the app renders inline **Approve / Decline / Request revision**.

The runner collects emitted cards into `postChatReply` `metadata.actions[]` (the contract the app already renders). Draft-creating tools (§4) auto-attach an approval card. This keeps the reply prose clean and puts Arc in control of when to surface a card.

### 6. Proactive path — seam only (Phase 2)

Same engine, pluggable output sink. A trigger (a cron in the app, or an opportunity event) creates an `agent_task` (e.g. `arc_opportunity_scan`) with an objective → `runArcTurn` runs in `draft` mode → output persists as draft opportunities / campaign packages in the approval queue (via the existing `approvals` / `drafts` / `campaigns` endpoints), **not** a chat reply. Not built in Phase 1 — the spec only requires that `runArcTurn`'s input source and output sink be abstracted so Phase 2 needs no rewrite.

### 7. Naming debt — documented non-goal

`hermes-client.ts`, `HERMES_AGENT_API_TOKEN`, `MARK_WEBHOOK_SECRET`, `/api/v1/hermes/*`, `MarkChatMessagePayload`, `MarkNotifyPayload` are legacy. **Do not churn the app's API surface inside this work.** Keep a thin internal alias so the runner reads as "Arc"; note a follow-up rename project. Flag, don't fix.

---

## Contract change (the only app-side change in Phase 1)

The wake payload carries `conversationId` but not project/campaign/history. Additive change to `MarkNotifyPayload` (`src/lib/mark-chat/notify.ts`) and the runner's `MarkChatMessagePayload` (`apps/arc-runner/src/types.ts`):

- Add **`projectId: string | null`** and **`campaignId: string | null`** (both already on the conversation row — trivial to populate where the wake is built).
- Add bounded **`history`**: the conversation's last N turns (`{ role, body }`, trimmed) so memory is always present, not left to Arc's discretion. N short turns fits well within the existing 6s wake budget.

Project assets stay a **read tool** (larger, discretionary). Campaign package loads as ambient context when `campaignId` is set.

---

## Acceptance criteria (what "properly wired" means — testable)

1. **Scoped chat + project isolation.** Operator asks Arc to find leads in a project chat → Arc calls the live CRM tool, cites real rows, reply renders with a result card. A *second* chat in the same project does **not** see this thread's history, but **can** read its assets via the project-assets tool.
2. **Draft → approval, real state.** In `draft` mode, "draft a campaign for X" → Arc creates a real draft that appears in `/campaigns` and `/approvals`, with an inline Approve/Decline card in chat. Approving it moves real backend state (not a preview).
3. **Mode + outbound guarantees.** `ask` mode cannot write (no write tool available). No outbound tool exists in any mode.
4. **Memory.** Within one conversation, Arc references earlier turns correctly across multiple messages.
5. **Live trace.** Every tool call shows a `running → done` step in the pending bubble.

---

## Non-goals (YAGNI)

- The full sub-agent workforce (Persona / Compliance / Strategy / Content / Referral agents).
- Managed Agents migration.
- Real multi-tenant onboarding (only the *seam* is built).
- Actual Cloud Run deployment.
- Any outbound send/publish/launch/spend.
- Higgsfield / AI ad production (stays flag-off).

---

## Phasing

- **Phase 1 — Rich scoped chat turn.** §§1–5 + the contract change + acceptance criteria 1–5. This is the bulk of the value and makes Arc genuinely useful in /mark.
- **Phase 2 — Proactive.** §6: triggered/scheduled `agent_tasks` whose output lands in the approval queue.
- **Later — Workforce.** Sub-agents spawned from the same engine.

Open question for the plan stage: confirm draft-campaign creation via the `drafts` / `campaigns` POST endpoints lands in the approval flow as expected (acceptance criterion #2 proves it); and confirm `N` for injected history.
