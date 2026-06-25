# Arc Chat — Hero Slice Design

- **Date:** 2026-06-25
- **Status:** Approved (design); ready for implementation plan
- **Branch:** `claude/jolly-mahavira-80dd2f`
- **Topic:** Make the Arc chat visibly more premium *and* visibly smarter in one cohesive conversation-turn redesign.

---

## 1. Summary

One Arc conversation turn becomes a single legible story: **Arc shows its work, proves it is reasoning from memory, and lets the operator act — approve, revise, or jump into the app — without leaving the thread.**

This is the **frontend-forward** swing (chosen over the full-production and smart-first variants). We build four upgrades end-to-end in the app with light runner changes, and explicitly defer the two backend-heavy bets (true SSE streaming, pgvector embeddings) to a fast-follow.

The four upgrades:

1. **Scalable work timeline** — the live "what Arc is doing" step trace collapses to *show first N + `＋N more`* so long runs never flood the thread.
2. **Recalled-from-memory chips** — surface what Arc pulled from the brain (ranked, with confidence), proving it reasons from memory rather than guessing.
3. **Inline approve + comment-to-revise** — approve a clean draft in one click, or leave a note and Arc redrafts *in place* — no Studio round-trip. Provenance lifts into the card header.
4. **Deep-link app-state cards** — a card that opens a pre-filtered app view (e.g. `/crm/leads?persona=landlord&lastTouch=60d`) in one click.

### Architectural keystone (why this is low-risk)

Arc replies carry structured data as JSON in `arc_messages.metadata`, parsed **defensively** app-side by `parseActions` / `parseQuestions` / `parseMedia` in `src/domain/arc-chat.ts`. New reply data (recalled-memory items, a new card kind) rides in as **additive metadata fields with a new defensive parser** — **no database migration is required for any of the four features.** The runner emits the new fields; the app parses and renders them; malformed data is silently dropped, exactly as today.

---

## 2. Goals & non-goals

### Goals
- Elevate the Arc chat turn to feel premium and "alive" (it is the sanctioned exception to Signal's calm rules — see `DESIGN.md`).
- Make Arc's intelligence **visible**: memory it recalled, work it did, evidence behind its claims.
- Remove the single biggest approval friction: the Studio round-trip for revisions.
- Make cards actionable bridges into the app, not just text.
- Stay 100% approval-safe: nothing reaches the outside world; outbound stays locked everywhere.

### Non-goals / deferred to fast-follow
- **True SSE/WebSocket streaming.** We keep the existing webhook + polling model and only *smooth* perceived latency. (The append-style `messages/[agentTaskId]/body` and `…/steps` routes already exist; full streaming is a separate track.)
- **pgvector / embedding-based semantic recall.** We improve ranking on the *existing* brain query (relevance + recency + confidence weighting). Embeddings are a fast-follow.
- **Performance-causality tooling, collaborative vault, outbound-dispatch visibility** — out of scope for this slice.
- Wiring the new shared primitives onto Campaigns/Home surfaces — we build them reusable but only wire them into chat this round.

---

## 3. Design principles (constraints this slice respects)

- **Signal design system** (`DESIGN.md`, `src/app/_components/theme.ts`, `src/app/globals.css`): warm obsidian canvas, antique gold `--accent` as the sole accent, status green/gold/red, Fraunces serif for editorial moments only, Geist for body. No emojis, no neon/purple AI aesthetic, no glassmorphism. Honor `prefers-reduced-motion`.
- **Reuse existing primitives**, don't rebuild: `EvidenceChip` (`src/app/_components/evidence-chip.tsx`), the `piece-decision.tsx` rework-with-notes pattern, the `WorkGlyph` step icons, the `StatusPill` / `MediaProvenance` from `asset-meta`, and the existing token vocabulary (`--canvas`, `--surface-inset`, `--accent`, `--ok`, `--border-hairline`, etc.).
- **Approval-safe & defense-in-depth:** every new server action calls `requireOperator()` and is org-scoped (`getCurrentOrgId()` / conversation access checks) — the service-role client bypasses RLS, so the gate lives in the app layer on *every* entry point.
- **Additive, defensive metadata** — never break `parseActions` on old rows; new fields are optional and validated.

---

## 4. Feature designs

### Feature 1 — Scalable work timeline (effort: S, frontend-only)

**Problem.** `ThinkingLine` shows the current step + a breadcrumb of completed phases, but the "Show steps" toggle expands the **entire** spine (`ThinkingTrace`) inline. A 40+-step run balloons the thread, with no cap and no virtualization (`src/app/arc/_components/message-list.tsx`). The finished-message `StepTrace` (collapsible `ChainOfThought`) has the same unbounded-expand behavior.

**Design.**
- In the expanded `ThinkingTrace` and the finished `StepTrace`, render at most `N` (default **5**) step rows, then a `＋{remaining} more steps` affordance that reveals the rest. Collapsing repeated work via the existing `summarizeSteps` grouping happens *before* the cap, so "Creating lead · 26" counts as one row.
- Keep the gold spine, `WorkGlyph` icons, and `arc-shimmer` on the live step. The cap applies to both the in-flight `ThinkingTrace` and the settled `StepTrace`.
- Preserve `prefers-reduced-motion` and the existing `msg-rise` entrance.

**Files.** `src/app/arc/_components/message-list.tsx` (the `ThinkingTrace`, `StepTrace`, `ChainOfThoughtTrace` functions). No runner, no schema, no new route.

**Tests.** Component/unit test: given 40 steps, only N+grouping render until "show more" is toggled; grouped repeats count as one row. (The `summarizeSteps` logic in `src/domain/arc-step-summary.ts` is already unit-tested — extend if the cap interacts with grouping.)

---

### Feature 2 — Recalled-from-memory chips (effort: M; runner + recall route + UI)

**Problem.** `apps/arc-runner/src/recall.ts` (`resolveRecallMemory`) calls `POST /api/v1/arc/brain/recall`, gets `RecallItem[]` (`{label, summary, kind, related?}`), and folds them into the prompt context — **then discards them.** The reply never tells the operator what memory informed it. Recall is also flat keyword matching with no relevance/recency/confidence ranking.

**Design.**

*Ranking (app side, no embeddings).* In the `brain/recall` route + its underlying query lib, rank candidate memory by a deterministic blended score: keyword/text relevance × recency decay × stored node confidence. Add an optional `confidence?: number` (0–1) and optional `href?: string` (deep link to the brain node) to `RecallItem`. Cap to the top **K** (default **4–6**) returned items. This is a pure, unit-testable ranking function in `src/domain/` (e.g. `scoreRecallCandidates`) consumed by the route — keep I/O out of `domain/`.

*Emit (runner side).* The runner already holds the recalled `RecallItem[]` for the turn. Thread it through the turn result (`apps/arc-runner/src/arc.ts` result type gains `recall?: RecallItem[]`) and attach it in `apps/arc-runner/src/handler.ts` exactly where actions attach today (`if (result.actions.length) metadata.actions = result.actions` → add `if (result.recall?.length) metadata.recall = result.recall`). Cap/trim defensively.

*Parse + render (app side).* Add `parseRecall(value)` to `src/domain/arc-chat.ts` (mirrors `parseActions` — defensive, drops malformed, never throws) producing `ArcRecall[] = {label, confidence?, href?, kind?}`. Surface it on the persisted `ArcMessage` (`src/lib/arc-chat/persistence.ts`) as `recall: ArcRecall[]`. Render in `message-list.tsx` as a small "Recalled from memory" row positioned **between the work timeline and the body** (matching the approved mock), using the existing `EvidenceChip` (it already supports `label` + `confidence` + `href`). Decision: **show the confidence %** (honest, matches EvidenceChip). Hidden when empty.

**Files.** `apps/arc-runner/src/recall.ts`, `apps/arc-runner/src/arc.ts`, `apps/arc-runner/src/handler.ts`; `src/app/api/v1/arc/brain/recall/route.ts` + its query lib; `src/domain/arc-chat.ts` (`parseRecall`, `ArcRecall`); `src/lib/arc-chat/persistence.ts`; `src/app/arc/_components/message-list.tsx`.

**Tests.** `scoreRecallCandidates` unit tests (relevance/recency/confidence ordering, tie-breaks, cap). `parseRecall` defensive-parse tests (drops malformed, clamps confidence to 0–1, never throws). Runner handler test: `metadata.recall` present when result carries recall, absent when empty.

---

### Feature 3 — Inline approve + comment-to-revise (effort: S–M; reuse, minimal new server code)

**Problem.** `src/app/arc/_components/action-card.tsx` renders Approve/Decline as `decideCampaignDraftAction` forms, but **"Request revision" navigates away** to `/campaigns/[campaignId]` — a Studio round-trip for the most common iteration. Provenance (`MediaProvenance`) sits quietly mid-card. Multi-draft packages (`campaign-deck.tsx`) require approving each draft individually.

**Design.**
- **Comment-to-revise in place.** Replace the "Request revision" link with the `piece-decision.tsx` reveal-a-notes-field pattern, calling the **existing** `requestRevisionAction` (`src/app/campaigns/actions.ts` → `requestAssetRevision` in `src/lib/campaigns/revisions`). On submit: the asset moves to `revision_requested`, the note goes to Arc, the card updates **in place** (same approval item, new revision), and outbound stays locked. No new turn is posted.
- **Quick-approve clean drafts.** When a draft's `flags` contain no `warn`/`risk` tones, the Approve button is the single emphasized action. At the **deck level** (`campaign-deck.tsx`), add an "Approve all clean" control that approves every flagless draft in the package (skips flagged ones, which still require individual review). Reuses `decideCampaignDraftAction` per asset.
- **Provenance to the header.** Move source + relationship + timestamp (drafted-by, persona, "reuses approved proof", "just now") into the card header row beside the title/status, raising it from the quiet 11px subtitle to a first-class accountability cue.
- **Shared primitive.** Extract the approve / comment-to-revise / decline control cluster (currently split between `action-card.tsx` and `piece-decision.tsx`) into a single shared primitive (extend `src/app/_components/inline-approval-card.tsx` or a new `decision-controls`-style module) so chat and campaigns share one implementation. Wire it into chat this round; campaigns/home adoption is a follow-up.

**Auth.** `requestRevisionAction` and `decideCampaignDraftAction` already gate on `requireOperator()` + Supabase config; the deck-level "approve all clean" must gate identically and resolve only real `campaign_assets.id`s (never mint ids).

**Files.** `src/app/arc/_components/action-card.tsx`, `src/app/arc/_components/campaign-deck.tsx`, `src/app/_components/inline-approval-card.tsx` (or new shared decision-controls), reusing `src/app/campaigns/actions.ts` / `src/app/campaigns/_components/piece-decision.tsx` patterns.

**Tests.** Action-level: `requestRevisionAction` with a note sets `revision_requested` and keeps outbound locked (extend existing campaign action tests). Component: comment box reveals on click, submits the note, collapses on success; "Approve all clean" approves only flagless drafts. Guard test: flagged drafts are NOT eligible for bulk approve.

---

### Feature 4 — Deep-link app-state cards (effort: S; runner + parser + UI)

**Problem.** `emit_card` only mints `kind: "result" | "draft"`. To point the operator at records, Arc lists them as text rows; it can't hand back a one-click, pre-filtered app view, even though the app's list routes accept query filters and `app-map.ts` already knows every deep-link route.

**Design.**
- Add a card kind **`"navigate"`** carrying `appState: { href: string; filters: { label: string }[] }` to:
  - `emit_card`'s zod schema (`apps/arc-runner/src/tools/cards.ts`) + the runner `ArcActionCard` type (`apps/arc-runner/src/types.ts`), with tool-description guidance to construct `href` from `get_app_map` routes and validate the route shape.
  - The domain parser (`parseActions` in `src/domain/arc-chat.ts`): accept `kind: "navigate"`, parse + validate `appState` (href must be an in-app path; filters are label strings), drop malformed.
- Render a dedicated `NavigateCard` (or an `ActionCard` branch) showing the title, filter chips, and an "Open view →" link to the pre-filtered route. `ActionCard` already renders `card.href` as a link, so this is a focused addition.
- **Safety:** only accept in-app (`/…`) hrefs; never external. Filters are display-only labels (the real filtering is the query string in `href`).

**Files.** `apps/arc-runner/src/tools/cards.ts`, `apps/arc-runner/src/types.ts`; `src/domain/arc-chat.ts` (`parseActions`, `ArcActionCard`); `src/app/arc/_components/action-card.tsx` (+ a `NavigateCard` or branch). Possibly `apps/arc-runner/src/tools/index.test.ts` if the tool surface set is asserted.

**Tests.** `parseActions` accepts a valid `navigate` card, rejects external hrefs and malformed `appState`. `emit_card` zod schema accepts the new kind (extend `cards.test.ts`). Runner tool-surface test updated if it pins the exact tool set per mode.

---

## 5. Cross-cutting

- **Perceived-latency smoothing (S).** Keep the webhook + `use-thread-poll.ts` model; tighten the poll cadence / coalesce updates so large replies feel less chunky. The typewriter (`useTypewriter`, 110 cps) and append `body`/`steps` routes already exist — no SSE in this slice.
- **Motion & glyph consistency (optional, fold in if cheap).** Three entrance systems coexist (`msg-rise` 260ms / `module-rise` 400ms / `media-rise`) and composer SVGs are hand-rolled at 20px/1.6 vs nav 24px/1.75. Not required for the hero; note as a polish opportunity.
- **Tenancy/auth (required).** Every new or reused server action: `requireOperator()` + org scope. Run a final cross-cutting pass — per-feature review misses the shared boundary because service-role bypasses RLS.

---

## 6. Data model (no migration)

All four features are additive `arc_messages.metadata` JSON, parsed defensively. No new tables/columns.

- `metadata.recall: ArcRecall[]` → `ArcRecall = { label: string; confidence?: number; href?: string; kind?: string }` (new `parseRecall`).
- `metadata.actions[]` gains `kind: "navigate"` with `appState: { href: string; filters: { label: string }[] }` (extends `parseActions` + `ArcActionCard`).
- `RecallItem` (runner + recall route) gains optional `confidence?: number`, `href?: string`.
- No change to the comment-to-revise path's persistence — it reuses the existing campaign revision lib and `campaign_assets` / approval state.

---

## 7. Testing strategy

- **Domain (pure, no I/O):** `parseRecall`, extended `parseActions` (navigate), `scoreRecallCandidates` ranking — heavy unit coverage in `src/domain/__tests__/`.
- **Runner:** `emit_card` navigate kind (`cards.test.ts`), `handler` attaches `metadata.recall` (`handler.test.ts`), tool-surface set if pinned (`tools/index.test.ts`).
- **App actions:** `requestRevisionAction` note path, "approve all clean" eligibility guard.
- **Components:** timeline cap/show-more, recall-chip row hidden when empty, comment box reveal/submit/collapse, navigate card renders filters + link.
- **Approval-safety regression:** assert outbound stays locked through every new path; no auto-send.
- Note (per repo memory): CI `verify` is chronically red on env-gated media/web-search route tests; check *which* tests fail before assuming this slice broke CI. Mock `next/cache` per-file where `revalidatePath` is hit (it throws in the vitest node env).

---

## 8. Rollout & approval-safety verification

- No outbound behavior added anywhere. "Comment & revise" and "Approve all clean" only change internal approval state; outbound remains gated exactly as today (the `LockNote` / "outbound locked" cue stays on every card).
- Runner changes are additive and backward-compatible: old app builds ignore unknown metadata; new app builds tolerate runner not yet emitting `recall`/`navigate`.
- Ship app-side parsers + UI first (tolerant of absent new fields), then runner emission — either order is safe.

---

## 9. Success criteria

1. A long Arc run (40+ steps) renders a capped timeline with `＋N more`, not a wall.
2. When Arc recalls memory, chips appear under the reply with source + confidence, linking to the brain node when available; ranking is relevance/recency/confidence-weighted.
3. An operator can approve a clean draft in one click and request a revision with a note **without leaving the chat**; the card updates in place and outbound stays locked.
4. Arc can emit a `navigate` card that opens a pre-filtered app view in one click; external hrefs are rejected.
5. All new server actions are operator-gated and org-scoped; no migration shipped; CI green (modulo the known env-gated flakes).

---

## 10. Resolved defaults

1. **Comment-to-revise:** Arc redrafts *in place* (same approval item, new revision) — not a new turn. ✅
2. **Memory chips:** show confidence %. ✅
3. **Shared primitives:** build approve/revise + navigate cards as reusable primitives; wire into chat only this round. ✅

---

## 11. File touch-list (for the plan)

**App (frontend + domain + routes):**
- `src/app/arc/_components/message-list.tsx` — timeline cap; recall chip row.
- `src/app/arc/_components/action-card.tsx` — comment-to-revise; provenance to header; navigate card.
- `src/app/arc/_components/campaign-deck.tsx` — approve-all-clean.
- `src/app/_components/inline-approval-card.tsx` — shared decision-controls primitive.
- `src/domain/arc-chat.ts` — `parseRecall` + `ArcRecall`; `parseActions`/`ArcActionCard` navigate kind.
- `src/domain/` — `scoreRecallCandidates` ranking (new module) + tests.
- `src/lib/arc-chat/persistence.ts` — surface `recall` on `ArcMessage`.
- `src/app/api/v1/arc/brain/recall/route.ts` + its query lib — ranked recall, `confidence`/`href`.
- Reuse: `src/app/campaigns/actions.ts` (`requestRevisionAction`), `src/app/campaigns/_components/piece-decision.tsx` pattern.

**Runner (light):**
- `apps/arc-runner/src/recall.ts` — `RecallItem` gains `confidence?`/`href?`.
- `apps/arc-runner/src/arc.ts` — turn result gains `recall?`.
- `apps/arc-runner/src/handler.ts` — attach `metadata.recall`.
- `apps/arc-runner/src/tools/cards.ts` + `apps/arc-runner/src/types.ts` — `navigate` kind + `appState`.
- Tests: `cards.test.ts`, `handler.test.ts`, `tools/index.test.ts` (if pinned).
