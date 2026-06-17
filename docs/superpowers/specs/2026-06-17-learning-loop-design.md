# Performance Learning Loop (Arc-facing v1) — design

**Date:** 2026-06-17
**Status:** Approved direction, pending spec review
**Scope:** Close the performance loop so Arc **learns from results**: aggregate the already-ingested `campaign_results` + `outcomes` into "what's working by slice" (persona × channel × asset_type), expose it to Arc via a read tool, and steer Arc to cite real performance in recommendations/drafts and record what worked to the brain. **No new UI** (`/analytics` already shows portfolio metrics). No new ingest (the `POST /api/v1/campaigns/results` endpoint + `campaign_results` table are already wired).

## Goal
When Arc recommends or drafts, it reads real performance ("email + social-proof for landlords booked 3 jobs at strong ROAS last month — repeat that angle") instead of guessing, and records durable learnings to the approval-gated knowledge graph. The loop: results in → aggregated by slice → Arc reads → better next iteration → operator approves.

## Non-goals
- New UI / insights page (analytics exists; can extend later).
- New ingest or attribution columns (reuse `campaign_results` + `outcomes` as-is).
- Auto-tuning weights / ML — Arc reasons over the aggregates; no model training.

## What already exists (reuse)
- **Wired:** `campaign_results` (impressions/clicks/leads/jobs/won_revenue_cents/spend_cents per campaign·asset·channel·period) + its ingest endpoint; CRM `outcomes` (won/lost/paid + revenue + persona); `src/lib/performance/*` read-models; `/analytics`. The knowledge-graph **brain** (`knowledge_nodes`, org-scoped, approval-gated) with runner `brainReadTools`/`brainWriteTools` (Arc can already `record_brain_note`).
- **Gap (this feature):** nothing aggregates results **by slice**, and Arc has **no tool to read performance**.

## Architecture
### 1. Pure aggregation — `src/domain/performance-slicing.ts`
`aggregateBySlice(rows, dimension)` — pure, unit-tested. Input: flat result rows (campaign_results joined to campaign persona + asset channel/type). Group by the chosen dimension (`persona | channel | asset_type`), sum the counters, derive metrics per slice: leads, jobs (booked), `roas = won_revenue/spend`, `cpl = spend/leads`, `ctr = clicks/impressions`, and `sampleSize` (rows/campaigns). Return slices sorted by jobs (then ROAS) desc. No I/O.

### 2. Read-model — `src/lib/performance/slice-read-model.ts`
`getPerformanceBySlice({ dimension, days?, persona?, channel? })`: fetch `campaign_results` joined to `campaigns` (persona) + `campaign_assets` (asset_type, channel) within the range, apply optional filters, hand rows to `aggregateBySlice`, return the slices. Guarded by `isSupabaseAdminConfigured()`; scoping mirrors the existing `src/lib/performance/read-model.ts` (single-org today). Degrades to empty when unconfigured.

### 3. Arc Operations endpoint — `GET /api/v1/arc/performance`
Bearer-gated via the shared `guard()`. Query: `dimension` (default `persona`), `days` (default 90), optional `persona`/`channel`. Returns `{ ok, status, dimension, slices: [...] }`. Read-only.

### 4. Runner tool — `read_performance` (all modes)
A read tool (added to `readTools`, available in ask/act/draft). `apiGet("/api/v1/arc/performance", { dimension?, days?, persona?, channel? })` → returns the slice aggregates as text for Arc to reason over. Emits a `running → done` step.

### 5. Prompt guidance
Arc should call `read_performance` before recommending a next iteration or drafting a campaign for a persona/channel it has history on, cite the numbers, and **record durable learnings** to the brain (`record_brain_note`, kind `messaging_angle`/`proof_point`, with the persona + campaign ref) so wins compound. Never fabricate metrics — only cite what `read_performance` returns.

## Data flow
operator/CRM posts results → `campaign_results` (existing) → `getPerformanceBySlice` aggregates → `read_performance` tool → Arc cites real numbers in recs/drafts + records what worked to the brain (operator trusts) → next campaign is better-informed.

## Error handling
- Supabase unconfigured → read-model returns empty; tool says "no performance data yet."
- No results in range → empty slices; Arc proceeds without history (doesn't invent).
- Bad `dimension` → default to `persona`.

## Testing
- **Domain:** `aggregateBySlice` unit tests — grouping, metric math (roas/cpl/ctr, divide-by-zero → null/0), sort order, sample size.
- **App:** endpoint test (mock read-model) — bearer gate, default dimension, returns slices.
- **Runner:** `read_performance` tool test — stub `apiGet`, assert it returns the aggregates text; in `index.test.ts` READ includes `read_performance`.
- **Manual:** with seeded `campaign_results`, ask Arc "what's working for landlords / should I repeat the last email?" → Arc calls `read_performance`, cites real numbers, and (act/draft) records a learning to the brain.

## Acceptance criteria
1. `getPerformanceBySlice` aggregates real `campaign_results`+`outcomes` by persona/channel/asset_type with correct metrics; empty + safe when no data/unconfigured.
2. `read_performance` returns those aggregates to Arc in every mode (read-only).
3. Arc cites real performance in recommendations/drafts (prompt-steered) and can record learnings to the brain; never invents metrics.
4. No new UI; no new ingest; reuses `campaign_results`/`outcomes`/brain. No outbound.

## Open items for the plan stage
- Confirm the exact join (campaign_results → campaigns.persona, campaign_assets.asset_type/channel) and how the existing `src/lib/performance/read-model.ts` scopes/queries (mirror it).
- Confirm whether `outcomes` should also feed slices (booked jobs/revenue by persona) or whether `campaign_results.jobs`/`won_revenue_cents` suffice for v1 (lean: use `campaign_results`; outcomes join is a follow-up).
- Confirm `read_performance` belongs in `readTools` and the READ test array.
