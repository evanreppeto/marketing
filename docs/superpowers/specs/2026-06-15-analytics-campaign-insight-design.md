# Analytics as the Single Campaign-Insight Surface

**Date:** 2026-06-15
**Status:** Approved (design)
**Branch context:** feat/restore-sidebar-gradient (analytics work to follow)

## Problem

Analytics is currently spread across two places and behaves wrong:

- `/analytics` lists campaigns with a **readiness** bar (draft → approved %), but each row links *out* to the campaign workspace (`/campaigns/[id]`), and it points users to `/reports` for "deeper numbers."
- `/reports` is a separate "performance / measurement" page (tabs: leads, conversion, campaigns, partners, revenue, data contract). It is not in the nav but it is the other place analytics-type data lives.

The user wants `/analytics` to be **the one place** for campaign insight: press a campaign and see all of its important analytics *without leaving the analytics section* (no jump to the campaign workspace).

## Constraints / Reality

- **No live delivery/outcome data exists yet.** Per `CLAUDE.md` and existing code, outbound is locked and impressions/clicks/booked-jobs/revenue are explicitly "not claimable until backend outcome data lands." So the per-campaign view shows **real signals that exist today + clearly labeled placeholders** for live metrics. No fake numbers.
- **Approval-safe.** No new outbound behavior, no publishing, no spend. Read-only views over existing read-models.
- **No DB migrations needed.** All data comes from read-models that already exist:
  - `getCampaignWorkspaceList()` — per-campaign rollup, counts, persona, lifecycle, channels (`src/lib/campaigns/read-model.ts`).
  - `getCampaignWorkspaceDetail(campaignId, …)` — full `LiveCampaignWorkspace` (approvals, assets, media, sources).
  - `getPerformanceReadModel()` — cross-campaign breakdowns (`src/lib/performance/read-model.ts`).

## Decisions (from brainstorming)

1. **Data scope:** Real signals + honest placeholders.
2. **`/reports`:** Fold useful content into `/analytics`, remove `/reports` as a standalone route.
3. **Drill-down:** Own route `/analytics/[campaignId]` with a back-to-analytics link; never navigate to `/campaigns/[id]`.
4. **Top-level organization:** Approach A — campaign-first, with workspace breakdowns as secondary tabs.
5. **Campaigns-tab labeling:** Keep the real readiness data; lightly reframe copy toward analytics-home language (no data changes).

## Architecture

### Routes

| Route | Change | Purpose |
|---|---|---|
| `/analytics` | Modify | Single analytics home. Tabs: **Campaigns** (default) · Leads · Conversion · Revenue · Partners · Data contract. |
| `/analytics/[campaignId]` | **New** | Per-campaign analytics detail. Back-to-analytics link. Never links to the campaign workspace. |
| `/reports` | Remove | Redirect to `/analytics` so old links/bookmarks don't 404. |

### `/analytics` (top level)

- **Header** — existing `AnalyticsHeader` (brand aside).
- **MetricStrip** — workspace totals (waiting on you, approved & ready, campaigns, creative made). The "Waiting on you" metric keeps its `/campaigns` href (that is an action target, not analytics).
- **TabNav** (reuse `src/app/_components/tab-nav.tsx`), keyed by `?tab=`:
  - **Campaigns** (default): the existing comparison list (`ComparisonRow`), with each row linking to `/analytics/[campaignId]` instead of `campaign.href`. The "deeper numbers → /reports" footnote is removed.
  - **Leads / Conversion / Revenue / Partners / Data contract**: the useful breakdown panels folded out of `/reports` (`getPerformanceReadModel()` → `LeadVolumeTab`, `ConversionTab`, `RevenueTab`, `PartnerSignalsTab`, `ContractTab`). The standalone `/reports` "Overview" and "Campaigns" tabs are dropped — the Campaigns tab here replaces them.

### `/analytics/[campaignId]` (new)

Server component. Loads `getCampaignWorkspaceDetail(campaignId, …)`. On `not_found` / `unavailable`, render `PageHeader` + `EmptyState` with a back-to-analytics link (mirrors the campaign detail page's not-found handling, but back link points to `/analytics`).

Renders a new client/presentation component `CampaignAnalyticsDetail`:

1. **Header** — campaign name, persona, lifecycle `StatusPill`, last-updated, "← Back to analytics" link (`/analytics`).
2. **Approval funnel** (real) — approved / pending / changes-requested / total and `% ready`, derived from the campaign rollup.
3. **Package composition** (real) — deliverables (assets), content pieces, media signals, source records (counts already on the detail/list models).
4. **Channel breakdown** (real) — pieces per channel.
5. **Performance — needs data** (honest placeholders) — Reach / Response / Quality / ROI checkpoints and the "not claimable yet" notes, reusing the measurement copy currently in `src/app/campaigns/_components/performance-tab.tsx` (`MEASUREMENT_PLAN`, `LOCKED_CLAIMS`, readiness items), clearly labeled as awaiting backend outcome data.

### Components & reuse

- New: `src/app/analytics/_components/campaign-analytics-detail.tsx`.
- Reuse shared primitives: `MetricStrip`, `WorkspacePanel` (`src/app/_components/workspace.tsx`), `TabNav`, `PageHeader`, `StatusPill`, `EmptyState`.
- The measurement/placeholder copy (`MEASUREMENT_PLAN`, `LOCKED_CLAIMS`) currently lives in `performance-tab.tsx`. Extract it into a small shared module under `analytics/_components` (or `src/lib/performance/`) so both the (now-removed-from-campaign) tab and the new detail can use it without duplication. `performance-tab.tsx` is only referenced by `campaign-cockpit.tsx`, which is not on the live campaign detail path (`CampaignSimpleDetail`); leave `campaign-cockpit.tsx` untouched but re-point its import if the copy moves.

### Cleanup / wiring

- Update the single inbound `/reports` link (the footnote in `src/app/analytics/page.tsx`) — remove it.
- `/reports/page.tsx` → replace body with `redirect("/analytics")` (Next.js 16 `redirect` from `next/navigation`), or delete the route and add a `redirects()` entry in `next.config`. Prefer the in-route redirect for locality.
- Nav: `Analytics` is already in `console-frame.tsx`; `/reports` is not in nav. No nav change needed.

## Data flow

```
/analytics (server)
  getCampaignWorkspaceList()  → Campaigns tab comparison rows (href → /analytics/[id])
  getPerformanceReadModel()   → Leads/Conversion/Revenue/Partners/Contract tabs
  getAppSettings()            → brand header

/analytics/[campaignId] (server)
  getCampaignWorkspaceDetail(id) → CampaignAnalyticsDetail
    rollup/counts               → real funnel + composition + channels
    MEASUREMENT_PLAN/LOCKED      → honest "needs data" placeholders
```

## Error handling

- `/analytics` list `unavailable` → existing `EmptyState`.
- `/analytics/[campaignId]` `not_found` / `unavailable` → `PageHeader` + `EmptyState`, back link to `/analytics`.
- Per-campaign view degrades gracefully when counts are zero (each section shows its own empty copy rather than a blank panel).

## Testing

- The per-campaign detail's pure derivations (funnel percentages, channel grouping, readiness mapping) live in a small model module with Vitest unit tests (mirrors `campaign-detail-model.ts` + its `__tests__`).
- Manual: `/analytics` Campaigns tab rows navigate to `/analytics/[id]` (not `/campaigns/[id]`); tabs switch via `?tab=`; `/reports` redirects to `/analytics`; not-found campaign id renders the empty state.

## Out of scope (YAGNI)

- No real metrics ingestion / Supabase schema for performance data (separate backend project if/when pursued).
- No changes to the campaign workspace (`/campaigns`) itself beyond no longer being the analytics target.
- No demo/sample numbers.
