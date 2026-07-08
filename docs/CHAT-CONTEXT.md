# Arc Chat — Context Management

Status: in progress · Owner: Arc platform · Last updated: 2026-07-08

Goal: make an Arc chat feel like a real Claude chat — it remembers the whole
conversation, auto-compacts when context fills, and shows how much context is left.

## How a turn works

Each Arc turn is **stateless** at the SDK level: the runner assembles the
conversation as a **text preamble** prepended to the current message and calls the
Agent SDK `query()` once (`apps/arc-runner/src/arc.ts` → `formatHistory`).

> **Fix landed 2026-07-08:** Arc chat previously had *no memory at all*. The push
> wake that was meant to carry `history` (`notifyArcWebhook` + `loadWakeContext`)
> was built but never called, and the live enqueue→pull path carries no history —
> so every turn started blank. The runner now **fetches** conversation context per
> turn from `GET /api/v1/arc/conversations/{id}/context`, so Arc actually remembers
> the thread regardless of push/pull delivery.

## What shipped — token-budgeted history window

**Before:** `buildWakeHistory` hard-cut to the **last 12 turns** — everything older
was silently dropped, so Arc "forgot" past ~12 messages.

**Now:** `buildWakeHistory` keeps the most recent turns that fit a **token budget**
(`DEFAULT_HISTORY_TOKEN_BUDGET = 24_000`, cheap ~4-chars/token estimate), oldest-first,
with a `HARD_TURN_CAP` safety bound and a guarantee to always keep the latest turn.
A long chat now retains dozens of substantial turns instead of 12. Pure + tested
(`src/lib/arc-chat/history.ts`, `selectHistoryWithinBudget`).

This is the honest interim: recent history is verbatim up to the budget; turns
beyond it are still dropped — until compaction (below) summarizes them instead.

## What shipped — context usage bar

A Claude-style **context meter** in the composer (`arc-view.tsx` → `ContextMeter`,
`src/lib/arc-chat/context-usage.ts`): estimates the conversation's context usage as a
fraction of the working window and shows a thin bar + "Context N%", amber (`warn`) as
it approaches, red (`full`) once compaction would engage. Client-side estimate over
message bodies, kept in sync with the runner's history budget. Pure + tested.

## Auto-compaction (rolling summary)

### Foundation shipped
- **Schema** — `arc_conversations.summary` + `summary_through_message_id`
  (`20260708130000_...`), so the rolling summary is stable and folding is incremental.
- **Persistence** — `ArcConversation.summary`/`summaryThroughMessageId` +
  `updateConversationSummary` (`src/lib/arc-chat/persistence.ts`).
- **Pure planner** — `planWakeHistory` (`history.ts`): given all messages + the token
  budget + the summarized-through marker, splits un-summarized turns into the recent
  **verbatim** window and the older **overflow** to fold into the summary (with the
  correct through-id). Fully tested.
- **Wake context** — `loadWakeContext` now returns `summary` + `overflow` alongside
  the verbatim history.

### Wired end-to-end
1. **Context fetch** — the runner fetches `{ history, summary, overflow }` per turn
   (`conversation-context.ts` → `GET .../context`), giving Arc memory + the summary.
2. **Summary injection** — `formatHistory` prepends a "CONVERSATION SUMMARY (earlier
   turns)" block ahead of the verbatim recent turns.
3. **Summarizer** — after replying, if `overflow` exists, the runner folds
   `prior summary + overflow` into a new summary on the Arc Pulse tier (`summarize.ts`,
   no tools) and `POST`s it to `.../summary` → `updateConversationSummary`. Best-effort,
   fire-and-forget — never delays or breaks the reply; idempotent via the marker.

### Verification boundary
Everything is unit-tested + typechecked, but two things need the **sandbox backend**
to prove end-to-end (no LLM / DB offline):
- the actual **summary quality** from the Pulse-tier call, and
- the two new endpoints against a DB with the `summary` columns migrated
  (`20260708130000_...`).

### Structured multi-turn (optional, later)
Send history as real role-structured messages rather than a flattened text preamble,
to unlock prompt caching of the stable prefix and cleaner turn boundaries. Larger
change to the wake payload + runner prompt assembly; do only if caching/cost warrants.
