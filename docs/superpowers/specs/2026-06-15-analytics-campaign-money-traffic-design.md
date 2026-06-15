# Per-Campaign Money & Traffic Analytics

**Date:** 2026-06-15
**Status:** Approved (design)
**Builds on:** `2026-06-15-analytics-campaign-insight-design.md` (the analytics consolidation already shipped)

## Problem

The per-campaign analytics page (`/analytics/[campaignId]`) currently shows readiness/composition/channel signals plus honest "needs data" placeholders. The operator wants the **important business numbers** — money and traffic — surfaced per campaign.

## Reality / Constraints

- **No fabricated numbers, ever** (CLAUDE.md invariant). Show real values where they exist; show honest empty states where they don't.
- **No new outbound behavior.** Read-only.
- **Money data exists** but is not directly keyed to campaigns:
  - `outcomes`: `lead_id`, `company_id`, `status`, `gross_revenue_cents`, `gross_margin_cents`, `closed_at`.
  - `jobs`: `lead_id`, `status`, `estimated_revenue_cents`.
  - A campaign row carries `lead_id` and `company_id` (see `CAMPAIGN_SELECT` in `src/lib/campaigns/read-model.ts`).
  - Attribution path: campaign → its `lead_id`/`company_id` → matching outcomes/jobs. This is **thin** (one lead per campaign), so the UI labels it "linked / approximate," never "campaign ROI."
- **Traffic data** = the internal `engagement_events` table (`event_type`, `channel`, `campaign_id`, `lead_id`, `created_at`), keyed directly to `campaign_id`. This table is **optional** — the existing performance read-model already tolerates it being absent. Web/ad impressions/page-views are explicitly out of scope (no source connected).

## Decisions (from brainstorming)

1. **Money:** Real linked revenue + honest empties. No schema changes.
2. **Traffic:** Internal engagement events only. No external integration.
3. **Placement:** Per-campaign detail page only (`/analytics/[campaignId]`).

## Architecture (domain → lib → app)

### 1. `src/domain/campaign-performance.ts` (new, pure, unit-tested)

Pure aggregation over plain rows. No I/O, no Supabase, no `Intl`/formatting (returns raw cents + counts).

Input row types (structural, defined locally in the module):
```ts
type OutcomeRow = { lead_id: string | null; company_id: string | null; status: string | null; gross_revenue_cents: number | null; gross_margin_cents: number | null };
type JobRow = { lead_id: string | null; status: string | null; estimated_revenue_cents: number | null };
type EventRow = { event_type: string | null; channel: string | null };
```

Exports:
```ts
export type CampaignMoney = {
  realizedRevenueCents: number;  // sum gross_revenue_cents over matched outcomes
  marginCents: number;           // sum gross_margin_cents over matched outcomes
  wonCount: number;              // matched outcomes with status in won/closed_won/paid
  outcomeCount: number;          // matched outcomes total
  estimatedPipelineCents: number;// sum estimated_revenue_cents over matched jobs
  jobCount: number;              // matched jobs total
  hasData: boolean;              // outcomeCount > 0 || jobCount > 0
};

export type CampaignTraffic = {
  totalEvents: number;
  byType: Array<{ label: string; count: number }>;    // grouped by event_type, desc
  byChannel: Array<{ label: string; count: number }>; // grouped by channel, desc
  hasData: boolean;                                    // totalEvents > 0
};

// Matching is done by the caller (it knows lead_id/company_id); these take already-matched rows.
export function summarizeCampaignMoney(outcomes: OutcomeRow[], jobs: JobRow[]): CampaignMoney;
export function summarizeCampaignTraffic(events: EventRow[]): CampaignTraffic;
```

Rules:
- `wonCount` uses the same won set as the existing read-model: `["won", "closed_won", "paid"]`.
- Grouping: blank/`null` `event_type` → "Other"; blank/`null` `channel` → "Unassigned". Sort each breakdown by count descending.
- All sums treat `null` as 0.

### 2. `src/lib/performance/campaign-performance.ts` (new, I/O)

```ts
export type CampaignPerformance =
  | { status: "live"; money: CampaignMoney; traffic: CampaignTraffic; trafficTracked: boolean }
  | { status: "unavailable"; message: string };

export async function getCampaignPerformance(campaignId: string, client?: SupabaseClient): Promise<CampaignPerformance>;
```

Behavior:
- If `!client && !isSupabaseAdminConfigured()` → `{ status: "unavailable", message: "Supabase env vars are not configured." }` (mirrors `getPerformanceReadModel`).
- Load the campaign row: `supabase.from("campaigns").select("id,lead_id,company_id").eq("id", campaignId).maybeSingle()`. If not found → `unavailable` with a "campaign not found" message (the route already renders not-found separately via the detail call, so this just guards).
- Fetch in parallel:
  - `outcomes` where `lead_id` = campaign.lead_id OR `company_id` = campaign.company_id. Use a single query with `.or(...)` when both ids exist; if only one id exists, filter on that; if neither exists, skip (empty array).
  - `jobs` where `lead_id` = campaign.lead_id (skip if no lead_id → empty array).
  - `engagement_events` where `campaign_id` = campaignId. **Optional**: if this query errors (table missing), set `trafficTracked = false` and treat events as `[]`; otherwise `trafficTracked = true`.
- Call `summarizeCampaignMoney` / `summarizeCampaignTraffic`, return `live`.
- Wrap in try/catch → `unavailable` with the error message (mirrors existing read-models). Required tables (outcomes/jobs/campaigns) erroring is a real failure; only `engagement_events` is tolerated as optional.

### 3. `src/app/analytics/[campaignId]/page.tsx` (modify)

Load `getCampaignPerformance(campaignId)` in parallel with the existing `getCampaignWorkspaceDetail`. Pass the result into `CampaignAnalyticsDetail` as a new `performance` prop. When `getCampaignWorkspaceDetail` returns non-live, the not-found/unavailable branch is unchanged (we don't render performance there).

### 4. `src/app/analytics/_components/campaign-analytics-detail.tsx` (modify)

Add a `performance: CampaignPerformance` prop. Insert two `WorkspacePanel` sections directly after the existing **MetricStrip** (so money/traffic sit high, above "Package composition"):

- **Money panel** — eyebrow "Money", title "Linked revenue", description notes attribution is approximate (campaign→lead link). If `performance.status !== "live"` or `!money.hasData` → `EmptyState` "No revenue linked yet" with a one-line explanation. Otherwise a small metric grid: Realized revenue, Margin, Won outcomes, Estimated pipeline (jobs). Currency via a local `formatUsd(cents)` helper (a 4-line `Intl.NumberFormat` USD, mirroring `formatMoney` in `read-model.ts`; kept local to avoid exporting from that module).
- **Traffic panel** — eyebrow "Traffic", title "Engagement events", description "Internal clicks, form submits, and photo uploads attributed to this campaign." If `status !== "live"` or `!trafficTracked` → `EmptyState` "Engagement isn't tracked yet". If tracked but `!traffic.hasData` → `EmptyState` "No engagement events for this campaign yet". Otherwise: a total count + two breakdown lists (by type, by channel) reusing the same row styling already in the detail's channel section.

No change to the existing readiness/composition/channel/"needs data" sections.

## Data flow

```
/analytics/[campaignId] (server)
  ├─ getCampaignWorkspaceDetail(id) → existing detail
  └─ getCampaignPerformance(id)
        load campaign(lead_id, company_id)
        ├─ outcomes by lead_id/company_id ─┐
        ├─ jobs by lead_id ────────────────┼─ summarizeCampaignMoney → CampaignMoney
        └─ engagement_events by campaign_id ─ summarizeCampaignTraffic → CampaignTraffic
  → CampaignAnalyticsDetail({ detail, performance })
```

## Error handling

- Supabase unconfigured (local dev) → `unavailable` → both panels render their honest empty states. No crash.
- `engagement_events` table absent → `trafficTracked: false` → Traffic panel shows "Engagement isn't tracked yet"; Money still works.
- Thin/empty attribution → `hasData: false` → "No revenue linked yet".
- A failure on a required table → `unavailable` (whole performance block shows empty states); the rest of the detail page (from `getCampaignWorkspaceDetail`) is unaffected.

## Testing

- `src/domain/__tests__/campaign-performance.test.ts` (Vitest): cover `summarizeCampaignMoney` (sums, won-set membership, null→0, hasData true/false) and `summarizeCampaignTraffic` (grouping, "Other"/"Unassigned" fallbacks, desc sort, hasData true/false).
- Type-check (`tsc`) + scoped eslint on all touched files.
- Manual: `/analytics/[id]` renders Money + Traffic panels; with no Supabase they show empty states (not errors); existing sections unchanged.

## Out of scope (YAGNI)

- No `campaign_id` columns on outcomes/jobs (no migration).
- No external web/ad analytics integration (impressions, page views, ad clicks, spend).
- No money/traffic on the Campaigns comparison list or analytics overview (per the placement decision: detail page only).
- No cost-per-job / ROI KPIs (require spend data that doesn't exist).
