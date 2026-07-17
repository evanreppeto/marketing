# Arc's Silent Failures — what broke, and how to catch the next one

On 2026-07-16, Arc had **five independent bugs in production at once**, stacked so
that each one hid the next. Every read tool was dead. Lead search returned nothing
against 200 rows. The copy guardrail ran on the one path that cannot produce bad
copy. Answers were discarded between the model and the database.

**Not one of them threw an error.** CI was green. Health checks passed. Chat
replied. Deploys succeeded. The dashboards were perfect the entire time.

They were found by asking Arc a question whose answer we already knew, and fixing
each one exposed the one behind it.

This document is mostly about the last sentence. The bug list is evidence.

---

## The pattern

Every one was the same species: **a control that looks present and isn't.**

Not a crash, not a wrong answer — an *absence* that renders identically to a
success. A tool loop that 400s while chat still greets you. An empty array behind
a `200 OK`. A payload cut mid-JSON that reads as complete. A guardrail wired to
the wrong path. An approval card that looks reviewed because nothing reviewed it.

The tests all passed because the tests asserted the code did what it does. None
of them asked whether what it does is the thing we wanted.

---

## What broke

### 1. Every tool call 400'd — SDK pinned two minor-majors back (#471)

`apps/arc-runner` pinned `"@anthropic-ai/claude-agent-sdk": "^0.1.0"`, which
resolves to `0.1.77` and **can never reach 0.2/0.3**. On 0.1.77 every sdk-mcp tool
call fails against the current API:

```
API Error: 400  messages.1.content.N: `tool_use` ids must be unique
```

That is Arc's whole tool surface: every CRM read, every brain query, every draft.

**Why nobody noticed:** prod Arc had received exactly two messages in its life,
both "hi", both answered with a greeting and **zero tool steps**. Its tool loop had
never actually run in prod. The one thing anyone smoke-tested was the one thing
that never touches the broken path.

**Narrowing it** (worth copying — it ruled out our own code):
- reproduce with a bare `query()` + one trivial tool, no app code
- try every model — sonnet-5, opus-4-8, haiku-4-5 all fail
- a plain query with no tool call **succeeds**; a tool registered but never
  invoked **succeeds** → it's specifically the invocation path
- reproduce in a clean directory outside the repo → not our environment
- install `0.3.211` in that same clean directory → passes first try

### 2. An omitted `max_score` hid all 200 leads (#477)

```js
const maxScoreParam = Number(url.searchParams.get("max_score"));
const maxScore = Number.isInteger(maxScoreParam) ? maxScoreParam : undefined;
```

`Number(null)` is `0`, and `Number.isInteger(0)` is `true`. So an **absent**
`max_score` became `maxScore = 0` → `lead_score <= 0` → zero of 200 leads matched.

It returned **`200 OK` with an empty array**. No error, no log line. Arc reported,
correctly and uselessly, that the CRM had no leads.

Only this route: every sibling guards its limit with `&& > 0` and incidentally
dodges the trap. `minScore = 0` was harmless (`>= 0` matches everything).
`max_score` alone was fatal.

### 3. The payload was cut mid-JSON, so Arc couldn't count (#484)

With #2 fixed, `search_leads` returned **every** matching row (`select("*")`, no
default limit). 200 rows × ~833 chars overflowed the runner's 8000-char tool
budget and were **sliced mid-JSON to ~10**, silently. Arc re-queried per status to
compensate, answered "**at least 64**" against a real 200, and burned the turn's
budget doing it.

Fixed by returning `{ leads, total }` with a real `count: "exact"`, a bounded page,
`limit=0` for count-only — and by making truncation **announce itself** rather than
slice quietly.

> The deeper lesson is in the fix: a truncated payload that doesn't say it was
> truncated is indistinguishable from a complete one. The model cannot see what
> isn't there.

### 4. The copy guardrail ran on the one path that can't fabricate (#475)

`checkArcGeneratedCopy` had exactly **one** caller: the template partner-campaign
path (`draft-engine` ← `orchestrator` ← `POST /api/v1/arc/runs`), whose copy is
string concatenation and therefore *cannot invent a claim*.

The path Arc actually uses — `create_campaign_draft` →
`/api/v1/arc/campaigns/draft-asset` → `promoteAssetToCampaign` — ran **no copy
check at all** and stamped every asset `risk_level: "medium"`, hardcoded.

The guardrail ran where it wasn't needed and not where it was. Meanwhile BSR's
Brand Kit bans 8 phrases, all insurance-claim promises ("we guarantee",
"claim will be approved") — the most legally dangerous thing a restoration company
can say — and Arc could write any of them straight into the approval queue.

### 5. The reply dropped everything before the last tool call (#489)

An operator asked "exactly how many leads?" and got four bullets of next steps
with **no number**, while the same reply said "the 52 qualified leads" as if it had
already answered. It had.

`body = (resultText || assistantText)` preferred the SDK's `result`. **`result` is
only the FINAL assistant message's text.** Proved with a spike — speak, call a tool,
speak again:

```
assistant blocks:  ["ANSWER: I will look it up.", "FOLLOWUP: total is 200."]
assistantText  ->  both                       (49 chars)
result         ->  "FOLLOWUP: total is 200."  (23 chars)   <- what we used
```

**It bites hardest exactly when the model behaves well** — look it up, then explain.
The answer lands before the closing tool call; only the sign-off survives. It was
visibly wrong too: deltas stream every chunk live, so the operator watched the
answer type out and then saw it replaced by the tail.

---

## How to actually verify Arc

The only thing that found any of the above:

> **Ask Arc a question whose answer you already know, and refuse to accept a green
> check as evidence.**

1. Get ground truth from the DB first (`select count(*) from leads` → 200).
2. Ask Arc in the UI. Force a live read — *"use the CRM, don't guess"* — or it may
   answer from Brain recall.
3. Compare. "At least 64" against 200 is a bug, not a rounding.
4. Read the **runner log** for what actually happened:
   ```
   gcloud logging read 'resource.type="cloud_run_revision"
     AND resource.labels.service_name="arc-runner"' \
     --project arc-marketing-500317 --limit 10 --format="value(timestamp,textPayload)"
   ```
   Duration is a signal: 36s (empty payload) → 197s (overflowing) → 27s (fixed).

A greeting proves nothing. That is exactly how #1 hid for weeks.

## Signals that look like evidence and aren't

| Signal | Why it's worthless |
|---|---|
| **Green CI** | Every one of these five shipped green. |
| **`/health` is ok** | It doesn't exercise a tool call. |
| **Chat replies** | A greeting needs no tools. |
| **`steps: []` on a completed `arc_message`** | The final `postChatReply` **replaces metadata wholesale** — the live trace is always discarded on completion. It proves nothing about tool use. |
| **"Recalled" chips in the UI** | `resolveRecallMemory` runs automatically every turn, tool call or not. |
| **A tool call succeeding** | "The call worked" ≠ "the answer is right." #2 and #3 both had *successful* calls. |
| **A monitor staying silent** | If it greps only for the success marker, a crash looks identical to "still running." |
| **A migration ledger row** | The ledger is not the schema. Check the effect. |

## Gotchas that will bite again

- **The runner does NOT ship via the pnpm workspace.** `apps/arc-runner/Dockerfile`
  runs `npm ci` against `apps/arc-runner/package-lock.json`. A `pnpm add` updates
  `package.json` + `pnpm-lock.yaml` and leaves the npm lock stale — which either
  deploys the old version or hard-fails the build. Always `npm install` inside
  `apps/arc-runner` after touching its deps.
- **Mocks don't enforce Postgres.** `approval_items_risk_level_check` restricts
  `risk_level` to `low|medium|high|blocked`; no unit test would ever have told us.
  Prove persistence against real Postgres (`BEGIN … ROLLBACK` on staging).
- **`guardrail_findings` has no `org_id`** and RLS-on-with-zero-policies. It's
  admin-client only, scoped transitively via its FKs.
- **Cloud Run fire-and-forget only works because** the runner sets
  `cpu-throttling=false` + `minScale=1`. Under default throttling, post-response
  work (like the chat-path critic) would silently never run.
- **`incremental: true` in tsconfig lies.** `rm -f tsconfig.tsbuildinfo` before
  trusting a local tsc run.

## What we built as a result

The critic (`apps/arc-runner/src/critic.ts`) exists because #4 is not fixable with
a phrase list. A banned-phrase screen proves copy isn't *known*-bad; it cannot see
an invented statistic or a guarantee the business doesn't offer.

Both layers now run at the `promoteAssetToCampaign` chokepoint — the one place all
five callers funnel through, so none can forget:

| State | Card |
|---|---|
| Banned phrase | red **Blocked** + the phrase quoted |
| Reviewed, problems | the critic's verdict, claims, counter-evidence |
| Reviewed, clean | verdict, `low` risk |
| **Not reviewed** | **"Not yet reviewed"** |

Before, all four rendered identically.

Two design points worth preserving:

- **The critic is not an SDK subagent.** `agents` registers a subagent the model
  invokes via the Task tool — the drafting model would choose whether to be
  reviewed. A gate the gated party can skip is not a gate. It's a second `query()`
  the caller runs in code.
- **It has no `research_web`, deliberately.** The question is not "is this true in
  the world" but "can THIS business substantiate it." A web search would confirm
  claims the business has no basis to make, turning the reviewer into a rubber
  stamp.

On its first real prod draft it checked 9 claims, passed 7, and caught two a phrase
list structurally cannot: a real "4.9★ across 380 reviews" proof point embellished
with a reviewer breakdown that doesn't exist, and a "pre-approved vendor" claim
whose only supporting record was an **archived campaign whose objective was to
become one** — a past goal presented as a present fact, headed for a property
manager.

`low` risk is now only reachable via the critic. A phrase match can never produce
it. That's deliberate: `medium` means *screened, unverified*, and claiming `low`
off a substring match would be the same lie in a new place.

---

## The one-line version

**"It didn't error" is not evidence. "The tool call succeeded" is not evidence.
"CI is green" is not evidence.**

Ask it something you already know the answer to.
