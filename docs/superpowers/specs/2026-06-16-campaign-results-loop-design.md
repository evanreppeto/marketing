# Campaign Results Loop — Design

**Date:** 2026-06-16
**Status:** Approved (pending spec review)
**Area:** `src/app/campaigns/[campaignId]` — individual campaign workspace

## Problem

After an operator deploys a campaign, the campaign page goes quiet. The lifecycle
checklist has a "Watch results" step and the (now-removed) action-hub referenced a
`#results` anchor, but **nothing renders results**. The draft → approve → deploy →
*learn* loop is open: there is no on-page view of what was sent, whether it succeeded,
or what it produced.

The data to close the loop already exists; it just isn't surfaced on this page:

- `getCampaignDispatches(campaignId)` → `DispatchView[]` (already fetched by the page).
  Each has `status` (`queued | scheduled | sent | delivered | failed | canceled`),
  `deliverable`, `channel`, `dispatchedAt`, `audienceCount`, `recipientSummary`,
  `resultNote`, `assetId`.
- `getCampaignPerformance(campaignId)` → `CampaignPerformance`
  (`{ status: "live"; money: CampaignMoney; traffic: CampaignTraffic; trafficTracked: boolean }`
  or `{ status: "unavailable"; message }`). NOT currently fetched on the detail page.
  - `CampaignMoney`: `realizedRevenueCents`, `marginCents`, `wonCount`, `outcomeCount`,
    `estimatedPipelineCents`, `jobCount`, `hasData`.
  - `CampaignTraffic`: `totalEvents`, `byType: {label,count}[]`, `byChannel: {label,count}[]`,
    `hasData`.

## Goals

- Surface a **Results** section on the campaign page that closes the loop, in three
  honest tiers: **Delivery**, **Engagement**, **Business outcomes**.
- Make **delivery failures obvious** and actionable (link to the Outbox, where the
  existing dispatch actions live and already revalidate this page).
- Be honest where data is missing: calm empty states driven by the existing
  `hasData` / `trafficTracked` flags and the dispatch list being empty — never fake
  metrics (per `DESIGN.md`: "no fake round metrics").
- Give the lifecycle "Watch results" step a real target (`id="results"`).

## Non-Goals

- No new outbound behavior, no sending. This section is **read-only display**.
- No new retry/resend action on the campaign page — failures link to the Outbox,
  which already owns dispatch state transitions (`markDispatchSentAction`, etc.).
- No changes to the performance/dispatch read-models or the domain summarizers.
- No new attribution logic — we display what `getCampaignPerformance` already attributes.

## Design

### What it shows

A `Results` section (`id="results"`) rendered below the package workspace on
`/campaigns/[campaignId]`, with three tiers:

1. **Delivery** — from the dispatches. A compact summary (counts by lifecycle
   bucket using the existing `groupByStatus` / `DISPATCH_STATUS_ORDER`), plus a
   **Failures** callout listing any `failed` dispatches (deliverable + channel +
   `resultNote`) with a link to `/outbox`. If there are no dispatches at all, a calm
   "Nothing has been sent yet — deploy a piece to start tracking results" state.
2. **Engagement** — from `traffic`. When `trafficTracked && traffic.hasData`: total
   events + `byType` and `byChannel` breakdowns. When `!trafficTracked`: "Engagement
   isn't tracked for this campaign yet." When tracked but `!hasData`: "No engagement
   recorded yet."
3. **Business outcomes** — from `money`. When `money.hasData`: realized revenue,
   margin, jobs won (`wonCount`/`outcomeCount`), estimated pipeline
   (`estimatedPipelineCents`/`jobCount`), formatted as USD. When `!hasData`: "No
   booked outcomes attributed yet."

When performance is `unavailable` (no Supabase / query error), the Engagement and
Business tiers collapse to a single quiet line ("Results appear after the campaign
goes out."); the Delivery tier still renders from whatever dispatches exist.

### Architecture (mirrors the deploy launchpad)

1. **`campaign-results-model.ts`** (new, pure, unit-tested) — alongside
   `campaign-detail-model.ts`.
   - `buildCampaignResults(input: BuildCampaignResultsInput): CampaignResults`
   - ```ts
     type BuildCampaignResultsInput = {
       dispatches: DispatchView[];
       performance: CampaignPerformance;
     };
     type DeliveryTier = {
       hasAnyDispatch: boolean;
       buckets: { status: DispatchStatus; label: string; count: number }[]; // non-empty buckets, lifecycle order
       failures: { id: string; deliverable: string; channel: string; note: string | null }[];
     };
     type MetricStat = { label: string; value: string };       // value pre-formatted for display
     type EngagementTier =
       | { state: "untracked" }
       | { state: "empty" }
       | { state: "data"; totalEvents: number; byType: MetricStat[]; byChannel: MetricStat[] };
     type OutcomesTier =
       | { state: "unavailable" }
       | { state: "empty" }
       | { state: "data"; stats: MetricStat[] }; // revenue, margin, won/outcomes, pipeline/jobs
     type CampaignResults = {
       delivery: DeliveryTier;
       engagement: EngagementTier;
       outcomes: OutcomesTier;
       /** true when there is genuinely nothing to show in any tier (drives a single
        *  whole-section empty state instead of three empties). */
       isEmpty: boolean;
     };
     ```
   - Includes a small `formatUsdCents(cents: number): string` helper
     (`(cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })`)
     — there is no shared currency formatter in the codebase today.
   - Pure: imports only types + `DISPATCH_STATUS_ORDER`/`statusLabel`/`groupByStatus`
     from `@/lib/dispatch/status`. No I/O.

2. **`campaign-results.tsx`** (new) — presentational section component taking
   `{ results: CampaignResults }`. Renders the three tiers with the canonical
   `StatusPill` (delivery buckets, tones from `STATUS_TONE`), a failures callout
   (warn surface), and metric tiles for engagement/outcomes. Server component (no
   interactivity needed). `id="results"`, `scroll-mt-5`.

3. **`[campaignId]/page.tsx`** (edit) — add `getCampaignPerformance(campaignId)` to
   the existing `Promise.all`, pass `performance` into `CampaignSimpleDetail`.

4. **`campaign-simple-detail.tsx`** (edit) — accept `performance: CampaignPerformance`,
   build `const results = buildCampaignResults({ dispatches, performance })`, and
   render `<CampaignResults results={results} />` below `<CampaignPackageWorkspace>`
   (inside or after the two-column grid, full width). The section's `id="results"`
   gives the lifecycle "Watch results" step a real anchor target.

### Data flow

```
page.tsx (server)
  getCampaignWorkspaceDetail ─┐
  getConnections             ├─ Promise.all
  getCampaignDispatches      │
  getCampaignPerformance    ─┘
        │ detail, connections, dispatches, performance
        ▼
  CampaignSimpleDetail
        buildDeployLaunchpad(... )          // existing
        buildCampaignResults(dispatches, performance)  // new
        ▼
  <CampaignResults results={results} id="results" />  // read-only
```

### Error handling

- `getCampaignPerformance` already returns `{ status: "unavailable", message }` on no
  Supabase / query error; the model maps that to `engagement: untracked`-style
  collapse and `outcomes: { state: "unavailable" }`. No throw reaches the page.
- `getCampaignDispatches` already returns `[]` when unconfigured; Delivery shows the
  "nothing sent yet" empty state.
- The whole section never crashes the page; worst case it renders the single
  whole-section empty state ("Results appear after the campaign goes out.").

## Testing

- **`campaign-results-model.test.ts`** (new, primary): `buildCampaignResults` across
  states — no dispatches (delivery empty); mixed dispatches incl. `failed`
  (failures populated, buckets counted in lifecycle order); `performance:
  unavailable` (outcomes `unavailable`, engagement collapse); `trafficTracked:false`
  (engagement `untracked`); tracked but `hasData:false` (engagement `empty`); money
  `hasData:true` (outcomes `data` with USD-formatted stats); `isEmpty` true only when
  every tier is empty/untracked/unavailable. Follows the `campaign-deploy-model.test.ts`
  style (pure, no I/O).
- `pnpm build` for the page → detail → results → model type chain.
- `pnpm lint` scoped to changed files; `pnpm test` full suite.
- Manual (Supabase + seeded campaign): deploy a piece → Results shows it under
  Delivery; a failed dispatch surfaces in Failures with an Outbox link; engagement/
  outcomes show honest empty states when no data.

## Files

**New**
- `src/app/campaigns/_components/campaign-results-model.ts`
- `src/app/campaigns/_components/__tests__/campaign-results-model.test.ts`
- `src/app/campaigns/_components/campaign-results.tsx`

**Edited**
- `src/app/campaigns/[campaignId]/page.tsx` — fetch performance, pass down
- `src/app/campaigns/_components/campaign-simple-detail.tsx` — build + render results

**Reused unchanged**
- `getCampaignPerformance` (`lib/performance/campaign-performance.ts`),
  `getCampaignDispatches` (`lib/dispatch/read-model.ts`),
  `DISPATCH_STATUS_ORDER`/`statusLabel`/`STATUS_TONE`/`groupByStatus`
  (`lib/dispatch/status.ts`), `StatusPill` (`_components/page-header.tsx`).

## Non-Negotiable Compliance

Read-only results display. No outbound action, no new send path. The app surfaces
recorded state; the human still drives every action. Failures route to the existing
Outbox controls rather than introducing a new mutation here.
