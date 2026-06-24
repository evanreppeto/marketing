# Arc Reasoning Core — Design

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Scope:** Make Arc materially smarter on the dimensions an operator actually feels — depth of reasoning, knowing the business, grounded confidence, and proactivity — by fixing the *upstream, shared* causes in `apps/arc-runner`: model routing, deliberate thinking, and the system prompt. A memory quick-win is included; the deep memory fix (CRM→Brain ingestion) is explicitly deferred to its own spec.

---

## Background — why Arc feels "not smart"

Arc is the Claude agent for the Growth Engine, running as `apps/arc-runner` on the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk` v0.1.77, the `query()` loop). The runtime is well-wired: 31 tools, dual-layer brain (knowledge graph + pgvector semantic recall), approval-gated writes, mode gating (ask/act/draft/scan). The *plumbing* is good. The **thinking** is thin.

When asked which symptoms show up, the answer was **all four**: shallow/generic answers, doesn't know the business / loses the thread, makes things up with wrong confidence, and too passive. All four at once means the causes are upstream and shared, not four separate bugs. The shared causes, traced to code:

1. **Interactive chat runs on Haiku.** [`context.ts:8`](../../../apps/arc-runner/src/context.ts) routes `fast` → `claude-haiku-4-5`; only `standard` work (opportunity drafting, campaign tasks) gets Opus. The everyday chat experience — the thing the operator feels — rides the small model. A weaker model is simultaneously shallower, loses the thread faster, hallucinates more, and connects fewer dots. This is the single largest common-mode cause.

2. **No deliberate thinking anywhere.** The turn is a single `query()` call ([`arc.ts:97`](../../../apps/arc-runner/src/arc.ts)) with **no `maxThinkingTokens`**, no `maxTurns`, no cost rail. Even on the Opus path there is no "reason before answering" step — Arc reacts, calls tools, and emits. No planning, no self-check, no verification before presenting.

3. **The system prompt is a tool manual, not a reasoning framework.** [`prompt.ts`](../../../apps/arc-runner/src/prompt.ts) is ~1,000 words of "you can call this tool / attach that card / follow this rule," all at one altitude. It exhaustively defines *what Arc may do* and never *how to think through a marketing problem* (understand → gather evidence → hypothesize with confidence → decide next action → draft → self-check). The judgment scaffold is missing, and the grounding/anti-hallucination and proactive-posture instructions are weak-to-absent.

4. **Memory recall is myopic.** `resolveRecallMemory(client, payload.message)` ([`arc.ts:150`](../../../apps/arc-runner/src/arc.ts)) embeds only the *latest message*, not the conversation, so in a back-and-forth Arc forgets what's being worked on. (The deeper gap — no CRM→Brain ingestion, so the brain is sparse — is a separate tracked initiative.)

### SDK capability findings (verified before designing)

The Agent SDK wraps the Claude Code CLI, so it exposes a *different* knob set than the raw Messages API. Confirmed in `apps/arc-runner/node_modules/@anthropic-ai/claude-agent-sdk/entrypoints/sdk/runtimeTypes.d.ts:300-430`:

| Knob | Available? | Use here |
|---|---|---|
| `maxThinkingTokens?: number` | ✅ | **The core "think properly" lever.** Per-turn thinking budget. |
| `maxTurns?: number` | ✅ | Bound the tool-use loop so deep turns can't spin. |
| `maxBudgetUsd?: number` | ✅ | Per-turn cost cap — safety rail for the Sonnet-floor/Opus-on-hard posture. |
| `fallbackModel?: string` | ✅ | Opus→Sonnet failover for resilience. |
| `model?: string` | ✅ | Full model id; existing code already passes custom strings. |
| `betas: ['context-1m-2025-08-07']` | ✅ (Sonnet) | Noted for future long-context memory; not used in v1. |
| `temperature` | ❌ | **Not exposed.** Grounding must come from prompt discipline + thinking, not a sampling dial. |
| output `max_tokens` | ❌ | Not exposed; rely on SDK/model defaults. |

This is the key constraint that shaped the design: **we cannot turn down temperature, so anti-hallucination is a prompt + thinking job, not a config job.**

---

## Decisions (locked)

| Decision | Choice |
|---|---|
| Chat model floor | **`claude-sonnet-4-6`** replaces Haiku for the `fast` route. |
| Hard-turn model | **`claude-opus-4-8`** for `standard` (drafting, campaign tasks, scans). |
| Reasoning mechanism | **Extended thinking** via `maxThinkingTokens` (prompt-driven plan + self-check), **not** a separate planner/critic agent. |
| Cost posture | Balanced — Sonnet floor + Opus-on-hard, guarded by `maxBudgetUsd` + `maxTurns`. |
| Grounding | Prompt discipline + thinking (temperature is unavailable). |
| Memory scope here | Recall-window quick-win only. **CRM→Brain ingestion deferred to its own spec.** |
| Reasoning loop | Prompt-driven self-check riding the thinking budget (YAGNI — no structural pre/post passes). |

---

## Design

### Part 1 — Inference config *(the felt jump)*

**1a. Model routing** — `modelForRoute` in [`context.ts:8`](../../../apps/arc-runner/src/context.ts):
- `fast` → `claude-sonnet-4-6` (was `claude-haiku-4-5`).
- `standard` → `claude-opus-4-8` (unchanged).
- Add `fallbackModel` (Opus→Sonnet) on the `query()` options for failover.

**1b. Extended thinking** — add `maxThinkingTokens` to the `query()` options in `runArcQuery` ([`arc.ts:97-108`](../../../apps/arc-runner/src/arc.ts)), budgeted per route:
- Opus / `standard` turns: ~8,000–10,000 (genuine deliberation before drafting/scanning).
- Sonnet / `fast` chat turns: ~1,500–2,000 (thinks a beat, stays snappy).
- Budgets become named constants so they're tunable in one place. This is the mechanism that creates the currently-absent reasoning step.

**1c. Cost & loop rails** — on the `query()` options:
- `maxBudgetUsd` per turn (caps Opus turns; protects multi-tenant economics).
- `maxTurns` ceiling so a deep tool loop can't run away.
- Values are named constants, route-aware (higher ceilings for `standard`).

> Threading note: `runArcQuery` already receives `model` and `mode`; thinking budget / cost rails are derived from the same route/mode and passed into the options object. No new payload fields required.

### Part 2 — Reasoning architecture *(the "thinks properly" part)*

Rewrite [`prompt.ts`](../../../apps/arc-runner/src/prompt.ts) from a flat tool manual into layered sections at the right altitude. New/changed sections:

- **Identity & non-negotiables** — keep, tightened. (Human-in-the-loop, outbound always locked.)
- **How you think *(new)*** — an explicit operating loop Arc runs every substantive turn:
  1. Understand the goal (and the business context you've been given).
  2. Gather evidence with tools — **never assume what you can look up.**
  3. Form a hypothesis with an **explicit confidence level** and the reasoning behind it.
  4. Decide the next best action.
  5. Draft / answer.
  6. **Self-check before presenting** — are all claims grounded in tool results? what's uncertain?
- **Grounding discipline *(new)*** — look it up before you claim it; cite real ids; when data is missing, say *"I don't have data on X"* rather than inventing; attach confidence to judgments. (This is the anti-hallucination layer that replaces the temperature dial we can't use.)
- **Proactive posture *(new)*** — Arc is an operator, not a Q&A bot: after handling the ask, surface the next best action, a spotted opportunity, or what you'd do next — without taking any outbound action.
- **Tool & output mechanics** — keep the existing card/draft/citation/followup contract, but compress it into a reference section so it stops drowning the reasoning instructions.

The self-check is prompt-driven and rides the extended-thinking budget from Part 1 — **no separate planner/critic agent calls.** Extended thinking *is* the scratchpad.

> Sync note: the file header says it is "kept in sync with the Arc agent configured in the Claude console." The rewrite must be mirrored to the console-configured agent (or that note updated) so the two prompts don't drift.

### Part 3 — Memory quick-win *(partial)*

- Fix recall myopia at the call site in [`arc.ts:150`](../../../apps/arc-runner/src/arc.ts): build the recall query from the **recent conversation window** (last N turns of `payload.history` + current message), not just `payload.message`, so multi-turn chats stay on-thread. The `/api/v1/arc/brain/recall` endpoint already accepts a free-text `message`; we pass a richer query string (and/or extend the endpoint to accept recent context if a single string proves too lossy).
- **CRM→Brain ingestion stays its own spec** (the tracked Brain-as-memory Slice 1) — that's what fully fixes "doesn't know the business." Sequenced next, not folded in here.

---

## Out of scope (YAGNI)

- Separate planner / critic / verifier agent calls (extended thinking covers it).
- Temperature / output-token tuning (not exposed by this SDK).
- A new Haiku "trivial" tier for greetings/acks (revisit only if Sonnet-floor cost is a problem).
- CRM→Brain ingestion pipeline (separate spec).
- 1M-context beta (noted for the memory spec, not used here).

---

## Success criteria

- **A/B feel test** on ~10 real operator prompts (a mix of question, research, draft-a-campaign, and multi-turn threads), scored before/after on four axes:
  - *Depth* — does it reason through the problem vs. respond generically?
  - *Grounding* — does it cite real records and **hedge / say "no data"** instead of inventing?
  - *Proactivity* — does it surface a next best action?
  - *Thread memory* — does it stay on-thread across turns?
- **Cost telemetry** — per-turn cost (via `maxBudgetUsd` accounting + existing usage logging) confirms the balanced posture holds and Opus turns stay within the cap.
- No regression in the approval-gated / outbound-locked guarantees.

---

## Suggested sequence

1. **Part 1** (routing + thinking + rails) — biggest felt jump, lowest risk, ~a day.
2. **Part 2** (prompt rewrite) — the durable "thinks properly" upgrade.
3. **Part 3** (recall window fix) — small, improves thread memory.
4. *(Next cycle, separate spec)* CRM→Brain ingestion — fully fixes "knows the business."
