# Gallery — Deployed Work + Analytics — Design

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan
**Branch:** `campaigns-workspace` (or its own branch)

## Summary

A `/gallery` page that showcases **Live (deployed)** campaigns and their creative,
with an analytics layer. Analytics is **hybrid**: directly-attributable internal
signals (Outbox dispatch funnel + reach) are real immediately; ad-platform
marketing metrics come from the existing `campaign_results` table, populated via a
new bearer-gated ingest endpoint (+ demo seed). **No schema changes** — both
`campaign_results` and `campaign_dispatches` already exist.

Closes the loop the app has been building: build → approve → launch → dispatch →
**showcase + measure**. This is the "Measurement" tier deferred during the Outbox
work, now unblocked because the Outbox produces dispatch data.

## Context (current state)

- **Arc is deterministic** — no live LLM anywhere. Irrelevant to this
  feature (read + ingest only), but rules out "AI-generated insights."
- **Live campaigns** are identified by `lifecycle === "Live"` (`launch_locked =
  false`), computed by `buildLaunchState` in `src/lib/campaigns/read-model.ts`.
  `getCampaignWorkspaceList` already returns list items carrying `thumbnailUrl`,
  `mediaCount`, `assetTypes`, `assetCount`, `lifecycle`, `href`, `persona`,
  `name`. The campaigns gallery already has a "Live" segment filter.
- **`campaign_dispatches`** (built this cycle) — per-deliverable dispatch records
  with a status enum (`queued|scheduled|sent|delivered|failed|canceled`), keyed
  by `campaign_id`. This is the real, directly-attributable funnel substrate.
- **`campaign_results`** (migration `20260528162000_hyper_personalization_layer.sql`)
  — columns: `id, campaign_id, campaign_asset_id, channel, period_start (date),
  period_end (date), impressions, clicks, calls, forms, leads, jobs,
  won_revenue_cents (bigint), spend_cents (bigint), metadata (jsonb), created_at,
  updated_at`. **Completely unused today** (no reads, no writes).
- **Leads ingest pattern** (the template to mirror for results ingest):
  `POST /api/v1/leads/ingest` → `parseLeadIngestionPayload` (pure domain) →
  `persistLeadIngestion` guarded by `isSupabaseAdminConfigured()`; bearer-gated via
  `checkBearerToken`. Response codes are load-bearing (400/202/201/502).
- A `src/lib/performance/read-model.ts` exists but reads leads/jobs/outcomes/
  engagement_events (NOT `campaign_results`) — out of scope; the gallery uses its
  own read-model.

## Architecture

`src/domain/` (pure parse/aggregate) → `src/lib/gallery/` (read-model, persistence)
→ `src/app/gallery/` (page + components) and `src/app/api/v1/campaigns/results/`
(ingest route). Follows the established layering + wired-feature patterns.

## Phase 1 — Gallery page + analytics read (independently shippable)

### Read-model: `src/lib/gallery/read-model.ts`

`getGalleryData(client?)` returns:

```ts
type GalleryCampaign = {
  // showcase (reused from the campaigns list read-model)
  id: string; name: string; persona: string; href: string;
  thumbnailUrl: string | null; assetTypes: string[]; assetCount: number; mediaCount: number;
  // dispatch funnel (real now — from campaign_dispatches)
  dispatch: { queued: number; scheduled: number; sent: number; delivered: number; failed: number; canceled: number; total: number };
  // marketing metrics (from campaign_results; zeros when none)
  metrics: CampaignMetrics; // see below
};

type CampaignMetrics = {
  impressions: number; clicks: number; calls: number; forms: number;
  leads: number; jobs: number; wonRevenueCents: number; spendCents: number;
  ctr: number | null;            // clicks/impressions
  costPerLeadCents: number | null; // spend/leads
  roi: number | null;            // wonRevenue/spend
  hasData: boolean;              // any campaign_results row existed
};

type GalleryData =
  | { status: "live"; campaigns: GalleryCampaign[]; totals: GalleryTotals }
  | { status: "unavailable"; message: string };
```

- **Showcase source:** reuse `getCampaignWorkspaceList()` (or a shared internal),
  filter to `lifecycle === "Live"`. Do NOT duplicate lifecycle logic.
- **Dispatch funnel:** one batched query of `campaign_dispatches` for the live
  campaign ids, counted by status per campaign (pure `countDispatchFunnel` helper,
  unit-tested).
- **Marketing metrics:** one batched query of `campaign_results` for the live
  campaign ids; a pure `aggregateCampaignResults(rows)` helper sums the integer
  columns over all periods and derives `ctr`/`costPerLeadCents`/`roi`
  (null-safe — null when the denominator is 0), unit-tested. `hasData` is true iff
  ≥1 row existed.
- **`GalleryTotals`:** aggregate across all live campaigns (sum of metrics + sum of
  dispatch funnel + campaign count), with the same derived rates. Pure, tested.
- Guard with `isSupabaseAdminConfigured()`; `status:"unavailable"` on error
  (mirrors `getCampaignWorkspaceList`).

### Page: `src/app/gallery/page.tsx` + `_components/`

- Server component. `PageHeader` ("Showcase" / "Gallery"), a top-line
  **aggregate strip** (deployed count, dispatch delivered, impressions/clicks/CTR,
  leads/jobs, revenue/spend/ROI — each rendered only when `hasData` or non-zero,
  with a clear "Awaiting results data" affordance when marketing metrics are all
  zero), then a responsive **gallery grid** of `GalleryCard`s.
- `GalleryCard`: image-forward (cover from `thumbnailUrl`, fallback to a typed
  cover by asset kind), name, persona, asset-type chips, a compact dispatch funnel
  (e.g. "12 sent · 9 delivered"), and key metrics when present; links to the
  campaign. Design system: Command Charcoal, no emojis; reuse `page-header.tsx`
  primitives + the existing media/cover conventions from `creative-tab.tsx`.
- Empty state when no campaigns are Live yet ("Nothing deployed yet — launch a
  campaign from /campaigns").

### Nav

Add `{ label: "Gallery", href: "/gallery", iconSrc: "<placeholder>", matches: ["/gallery"] }`
to `console-frame.tsx` `navItems` (after Outbox), and a `{ label: "Gallery", href:
"/gallery", icon: "..." }` to `growth-engine.ts` quick-jump (mirroring Campaigns/
Outbox). No dedicated gallery icon exists under `public/brand/nav-icons/`; reuse an
existing one as a placeholder and flag for a real asset (same as Outbox).

## Phase 2 — `campaign_results` ingest + seed

### Domain: `src/domain/campaign-results.ts`

`parseCampaignResultsPayload(input): ParsedCampaignResult[]` — pure, validated:
- Accepts one result or an array. Each requires `campaign_id` (uuid) + a period
  (`period_start`, `period_end` ISO dates, start ≤ end); optional
  `campaign_asset_id`, `channel`; non-negative integer metrics (impressions,
  clicks, calls, forms, leads, jobs) and non-negative `won_revenue_cents`,
  `spend_cents`; optional `metadata`.
- Throws a typed `CampaignResultsValidationError` on bad input. Re-export through
  `src/domain/index.ts`. Heavily unit-tested in `src/domain/__tests__/`.

### Persistence: `src/lib/gallery/results-persistence.ts`

`persistCampaignResults(parsed, client)` — guarded; **upsert** into
`campaign_results` on a natural key (`campaign_id, campaign_asset_id, channel,
period_start, period_end`) so re-ingesting a period overwrites rather than
duplicates. (If a DB unique constraint is desired for true upsert, that is a
follow-up migration — Phase 2 uses select-then-insert/update in app code to avoid
a schema change, consistent with "no schema changes" this cycle.) Unit-tested with
`createSupabaseQueryMock`.

### Route: `src/app/api/v1/campaigns/results/route.ts`

`POST` — bearer-gated via `checkBearerToken(request, "CAMPAIGN_RESULTS_API_TOKEN")`
(new env var; document in `.env.example`). Calls `parseCampaignResultsPayload`,
then persists only if `isSupabaseAdminConfigured()`. Load-bearing response codes
mirroring leads ingest: `400` (validation), `202` (accepted, Supabase not
configured — nothing written), `201` (persisted), `502` (persistence error).
`revalidatePath("/gallery")` is not applicable (API route) — the page is dynamic
and re-reads on each request.

### Seed: `scripts/seed-campaign-results.ts` + `pnpm seed:campaign-results`

Inserts a few realistic `campaign_results` rows for existing Live campaigns so the
analytics render with real-looking numbers in local/demo. Guarded; no-op without
Supabase.

## Testing & safety

- **Pure unit tests:** `countDispatchFunnel`, `aggregateCampaignResults` (incl.
  null-safe derived rates and zero-denominator cases), `GalleryTotals` aggregation,
  `parseCampaignResultsPayload` (valid + each validation failure).
- **Persistence test:** `persistCampaignResults` upsert path via the mock.
- All DB reads guarded by `isSupabaseAdminConfigured()`; gallery degrades to
  `unavailable`/empty without Supabase. Ingest returns `202` without Supabase.
- Read + durable ingest only — **no outbound, no sends, no mutations to campaigns/
  dispatch state.**

## Out of scope (YAGNI)

- A separate ads table / ads CRUD — ads remain `campaign_assets`.
- Live ad-platform OAuth integrations — ingest is API + seed.
- AI-generated insights/commentary (Arc is deterministic).
- Per-asset (ad-level) analytics drill-down — Phase 1 is campaign-level
  (`campaign_results.campaign_asset_id` is captured at ingest for a future
  ad-level view, but not surfaced now).
- A unique-constraint migration for true DB upsert (app-level upsert this cycle).
- The ad-builder and leads-finder features — separate future cycles.

## Sequencing

1. Phase 1: gallery read-model (+ pure helper tests) → page + nav. Shippable with
   real dispatch/reach numbers; marketing metrics show "awaiting results data".
2. Phase 2: domain parser (+ tests) → persistence (+ test) → ingest route → seed.
   Marketing metrics then fill in.

One PR (Phase 1 could be its own PR if preferred).
