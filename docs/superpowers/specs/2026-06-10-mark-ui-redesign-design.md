# Mark UI Redesign — Design Spec

- **Date:** 2026-06-10
- **Status:** Approved for planning (pending spec review)
- **Author:** Evan Reppeto (with Claude)
- **Topic:** Redesign the Mark chat experience to a full-bleed, professional, *alive* chat interface whose controls genuinely drive the attached Hermes agent — production-grade and agent-agnostic.
- **Builds on:** `2026-06-10-mark-first-rebuild-design.md` (Obsidian & Gold, Agent Port concept, policy gate).

---

## 1. Why

The current Mark page works but reads as a **floating card** sitting in the page's padding, with the composer as a **floating pill** in the middle. It doesn't feel like a professional chat tool (Claude/ChatGPT), and it doesn't feel *alive* while Mark works. Separately, some controls look functional but aren't: **slash commands are cosmetic** (they only insert prompt text), and there's **no signal of whether the agent is connected**. For a product others would attach their own Hermes agent to, the controls must be real, robust, and obvious.

Crucially, exploration found the backend is **already real and robust** — this is mostly a visual + interaction-layer redesign, not a rebuild.

## 2. What is already real (do NOT rebuild)

| Capability | State | Where |
| --- | --- | --- |
| Send → persist → enqueue `agent_task` → signed webhook push → inbox-poll fallback → stale-task recovery → reply via `POST /api/v1/hermes/messages` → client poll | **Real & robust** | `src/app/mark/actions.ts`, `src/lib/mark-chat/{enqueue,notify,inbox}.ts`, `src/app/api/v1/hermes/messages/route.ts`, `use-thread-poll.ts` |
| `@records` mentions reach the agent as structured `MarkMention {type,id,label,href}` | **Real** | `src/lib/mark-chat/mention-search.ts`, `src/domain/mark-chat.ts` |
| Live `steps`, `actions` (result/draft cards w/ approvals), `media`, `feedback` rendered from Mark's reply metadata | **Real** | `src/lib/mark-chat/persistence.ts`, `message-list.tsx` |
| Optimistic send, per-thread draft persistence, polling | **Real** | `mark-chat.tsx`, `composer.tsx` |
| Health ping | **Real** | `GET /api/v1/hermes/ping` |

## 3. What is broken / missing (the real work)

1. **Layout reads as a floating card**, not a full-bleed app surface.
2. **The chat doesn't feel alive** while Mark works.
3. **Slash commands are cosmetic** — only insert text; the `/command` never reaches the agent as structured intent.
4. **The mode selector (Ask/Act/Draft) is confusing and redundant** with the approval + policy gates — operators don't understand it.
5. **No connection/health signal** — the user can't tell if their Hermes agent is attached and responding.
6. **Agent is hardcoded** to keys `"mark"/"hermes"`; not a documented, config-driven port others can attach to.

## 4. Goals

- Feels like a **professional, full-bleed chat tool** — no floating card, anchored composer.
- Feels **alive** during a turn — one calm, confident presence signal (not scattered animation).
- Every composer control sends **real structured intent** to the agent.
- **Dead simple** to operate; a non-technical teammate understands it at a glance.
- **Production-grade & agent-agnostic** — documented Agent Port, config-driven, clear connection/queue states, graceful degradation.
- Visually high-end per the design-taste skills: neutral-dominant, gold as rare punctuation, no AI tells.

## 5. Visual redesign

### 5.1 Full-bleed layout
- The Mark route renders **edge-to-edge** within the app content area — remove the outer `rounded-xl border … shadow` card wrapper (`mark-chat.tsx:237`). The app shell must allow the Mark route to opt out of content padding (a full-bleed slot in `ConsoleFrame`/layout, or the page breaks out of padding).
- Columns: thin app rail (existing) · **thread sidebar** · **conversation** · (optional context rail on wide screens, existing).

### 5.2 The conversation
- **Centered readable column** (~680px max-width) for messages; generous vertical rhythm.
- **Your turn:** quiet, labeled, lightly-bordered bubble — not a loud fill.
- **Mark's turn — the signature "work-timeline":** avatar in a gutter; Mark's actions render as a **connected vertical sequence of nodes** (✓ done / ● active) with hairline connectors — "Pulled 23 signals → Scored → Drafting." This is sourced from the existing `steps[]`. It replaces generic chips and is the memorable, business-true element (Mark shows his work).
- Inline **result/draft cards** (existing `actions[]`): flat, hairline-bordered, mono data — no generic drop-shadow boxes. Approvals stay wired.
- **Hover-revealed message actions** (Copy / Regenerate / Hand to canvas) — progressive disclosure.

### 5.3 Alive (one orchestrated presence, not five animations)
- Avatar **breathes** a single slow gold ring while Mark is working (`status: pending`).
- A single pulsing **WORKING** status under his name.
- The **active timeline node** pulses; completed nodes are still.
- **Streaming text:** solid text + one blinking caret; a **skeleton bar** for not-yet-arrived content. **No gradient-fill text** (banned AI tell — replaces the current `.mark-shimmer`).
- All motion via transform/opacity; respects `prefers-reduced-motion`.

### 5.4 Design-taste guardrails (from impeccable / frontend-design / stitch)
- **Neutral-dominant; gold ≈ 10%** (avatar, send, one live status). Gold is punctuation.
- **No AI tells:** no gradient text, no >1px side-stripe borders, no generic drop-shadow cards, no emojis, no neon.
- Mono (JetBrains Mono) for scores/timestamps/IDs; serif (Fraunces) for thread titles / Mark's name; Inter body. (Fonts kept consistent with the shipped app; revisiting the pairing app-wide is a separate, optional step.)
- A whisper of grain for depth; tactile composer with a subtle gold focus ring.

## 6. Composer — simplified and real

### 6.1 Remove the mode selector
- **Drop the Ask/Act/Draft dropdown** from the composer. It is redundant with the approval gate + policy gate and operators don't understand it. The composer becomes: **type · `@mention` · `/command` · send**, with a quiet "outbound locked" status.
- Backend: `sendMarkMessageAction` and `enqueueMarkChatTask` currently require/forward `mode`. Default the sent `mode` to a single sensible value (e.g. `"act"`, since the policy gate + approval gate are the real guardrails) OR omit it; the agent infers intent and the gate enforces. Keep the field in the task metadata for agent compatibility, just not operator-facing. (No DB migration needed.)

### 6.2 Make slash commands real (the key fix)
- Promote slash commands from text-insertion to **structured intents**. A command carries a stable `command` id and accepts typed `@record` arguments.
- On send, the payload to the agent includes a structured `command` alongside `message` and `mentions`, e.g. `{ command: "find-leads", args: [<MarkMention>], message: "…" }`.
- Thread it through the existing channel: add `command` to the `sendMarkMessageAction` payload → `enqueueMarkChatTask` metadata/`agent_task_inputs.payload` → the webhook payload (`notify.ts`) — exactly where `mentions` already flows.
- The four existing commands (`/find-leads`, `/draft-campaign`, `/whats-pending`, `/summarize`) become real dispatchable actions. The palette shows each command's argument hint ("takes a target", "@persona").
- The command palette UI is upgraded to the elevated style (structured rows, ↑↓ select, argument hints).

### 6.3 @records — keep (already real)
- No change to the mention pipeline; restyle the popover to match.

## 7. Agent Port — production & agent-agnostic

### 7.1 Formalize the contract
- The existing **outbound webhook payload** (`notify.ts`) and **inbound reply** (`POST /api/v1/hermes/messages`) become *the documented Agent Port contract*. Document the message shape (incl. new `command`), the reply shape (`{agentTaskId, body, status?, metadata:{steps,actions,media}}`), and the HMAC signing.
- **De-hardcode the agent:** replace the `in("key", ["mark","hermes"])` lookup (`enqueue.ts`) with a configured agent key/id. Endpoint (`MARK_RUNNER_URL`/`MARK_WEBHOOK_URL`), secret (`MARK_WEBHOOK_SECRET`), and **display name "Mark"** come from one config source (extend `src/lib/settings/store.ts` — `markDisplayName`, agent key). The UI reads the display name from that one place.

### 7.2 Connection / health states (production trust)
- A **connection indicator** in the Mark header using `GET /api/v1/hermes/ping`: **connected** (green, "responds ~Ns") vs **unreachable** (amber).
- When the agent is unreachable, sends still **queue** (the inbox fallback already exists) and the UI says so plainly ("Agent unreachable — message queued, delivers when it reconnects"). The user is never left guessing.
- **Failed/timeout** message recovery: a pending Mark message that never completes surfaces a clear "Mark didn't respond — retry" affordance (the retry path exists via `regenerate`/`cancel`).

### 7.3 Graceful degradation
- Without Supabase / without a configured agent endpoint, the page degrades gracefully (consistent with the app): the composer explains the agent isn't configured rather than erroring.

## 8. Empty state
- Teach the interface: "What should Mark work on?" with the existing quick-action shortcuts, but grounded (not a floating pill) and styled to the elevated language. Shortcuts map to the now-real commands.

## 9. Data / type changes

- **`MarkMessage` / send payload:** add an optional `command: string | null` carried from composer → `sendMarkMessageAction` → `enqueueMarkChatTask` → webhook + `agent_task_inputs.payload`. No new table; reuse `agent_task` metadata. (Optionally persist `command` on the operator message row for replay/audit.)
- **Settings:** add `markDisplayName` and the agent key/endpoint references to `app_settings` via `src/lib/settings/store.ts` (additive).
- No `mode` DB change — it stays in metadata with a default; just removed from the UI.

## 10. Out of scope (now)

- Multi-tenancy / multiple attached agents at once (one configured agent).
- Building the external Hermes runner itself (it lives outside this repo).
- WebSocket streaming (the 2.5s poll + steps is sufficient; revisit later).
- A public SDK / marketplace.
- Re-fonting the app away from Fraunces/Inter (optional, separate).

## 11. Testing

- **Structured commands:** unit-test the command parser/matcher (`slash-commands.ts`) including argument capture, and that `sendMarkMessageAction` forwards `command` into the enqueued payload (pure assembly logic tested where possible).
- **Connection state:** test the health-poll hook's state mapping (connected/unreachable) deterministically.
- **No-regression:** existing mark-chat tests (`slash-commands.test.ts`, `relative-time`, `use-thread-poll`) stay green; update them for the new command shape.
- Persistence/actions follow the wired-feature shape (`requireOperator` + `isSupabaseAdminConfigured` + `revalidatePath`).

## 12. Rollout (phased within this spec)

1. **Visual elevation** — full-bleed layout, presence, work-timeline, restyled cards/composer, no AI tells. (Pure UI; lowest risk; most visible.)
2. **Composer simplification** — remove the mode selector; default the metadata mode.
3. **Structured slash commands** — carry `command` end-to-end; upgrade the palette.
4. **Agent Port + connection states** — de-hardcode agent, config-driven name/endpoint, health indicator, queued/failed messaging, docs.

## 13. Decisions log

- **Full-bleed, not a floating card.** ✔
- **Alive = one orchestrated presence** (breathing avatar, single caret, active-node pulse); no gradient text. ✔
- **Signature = the work-timeline** (Mark shows his work from `steps[]`). ✔
- **Drop the per-message mode selector** — redundant with approval + policy gates; confusing. Composer = type/@mention/​/command/send. ✔
- **Slash commands become structured intents** carried to the agent. ✔
- **Formalize the Agent Port** (config-driven endpoint/secret/name, documented contract) + **connection/health states**. ✔
- **Keep the robust existing backend** (webhook + inbox + reply + poll). ✔

## 14. Open questions (for planning)

- Default `mode` value once the selector is gone: `"act"` (gate-enforced) vs omit-and-let-agent-infer. Lean `"act"`.
- Should `command` persist on the operator message (for audit/replay) or only travel in the task payload?
- Connection indicator polling cadence (e.g., ping every 20–30s vs on focus).
- Exact command argument grammar (single `@record` vs multiple).
