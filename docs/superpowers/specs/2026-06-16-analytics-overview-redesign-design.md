# Analytics Overview Redesign — Design

**Date:** 2026-06-16
**Branch:** `worktree-analytics-visuals` (PR branch `feat/analytics-visual-charts`)
**Builds on:** the initial analytics-visuals pass (Recharts chart kit, donut/bar/funnel components, truthful `toChartPoints`).

## Goal

Turn `/analytics` from a tab-heavy "page of words" into one professional, scrollable **Overview** that a non-technical operator understands at a glance — better-looking and more varied charts, light controls to change them, and plain-language guidance. Stay calm (DESIGN.md, obsidian + antique-gold, no neon) and **truthful** (no fabricated data; genuinely-missing metrics keep an honest "needs data" state).

User direction: liked layout direction **A** (executive overview), delegated the final call. Decision: **A skeleton + B's plain-language captions + C's chart-type toggles & date-range** — synthesized, not a single direction.

## Decision summary

- **One scrollable Overview page** replaces the 6-tab primary nav. A **sticky section nav** (Overview · Leads · Conversion · Revenue · Partners) scroll-jumps to in-page sections (anchors, not routes).
- **KPI band** (4 compact stat cards) with **period-over-period % deltas**.
- **Hero row:** a real **weekly trend** chart (new leads vs. booked jobs, last 8 weeks) + the **readiness donut** with legend.
- **Plain-language takeaway banner** + a one-line "what this means" caption under each chart.
- **Supporting chart grid:** Leads by persona, Conversion funnel, Lead source mix, Revenue by persona, Partners — each in the upgraded chart style.
- **Chart-type toggle** (Bars ↔ Donut) on breakdown cards; line/area toggle on the trend.
- **Date-range selector** (30d / 90d / all) — Phase 2.
- **Campaign comparison table** stays (bottom of Overview), with the segmented bars already built.
- **"Data contract"** technical content demoted to a collapsible "What we can't measure yet" footer.

## Hard constraints (carried over)

- **Truthful.** Charts render only from real read-model data. Trend/deltas come from existing `created_at` columns; sparse or absent data degrades to honest empty/"needs data", never invented points. KPI deltas show "—" (no comparison) when there's no prior-period data.
- **Server/client split.** `/analytics` stays an async server component; charts and interactive controls are `"use client"` leaves fed serializable props. Chart-type toggle is client-only local state.
- **Theme-adaptive, calm motion.** Reuse `useChartTheme()` + reduced-motion handling. No neon, no equal 3-column rows (KPI band of 4 is a band of equal tiles, which DESIGN.md allows for metric strips — it is not a 3-equal-column *content* row; mirror the existing `MetricStrip` treatment).
- **Reuse primitives.** `WorkspacePanel`, `PageHeader`, `StatusPill`, `EmptyState`, existing `DonutSplit` / `BarBreakdown` / `FunnelFlow` / `SegmentedBar` / `useChartTheme` / `ChartTooltip` / `NeedsDataChip`.

## Architecture

```
New read-model — split into I/O and pure (per CLAUDE.md layering):
  src/lib/performance/overview-shape.ts   # PURE, no Supabase import — unit-tested
    buildTrendBuckets(leadRows, jobRows, weeks): {week,leads,bookings}[]
    computeDelta(current, prior): {pct, dir}|null
    buildTakeaway(split, waitingOnYou, changes): string
  src/lib/performance/overview-model.ts   # I/O — imports overview-shape + Supabase
    getAnalyticsOverview(range): {
      status: "live" | "unavailable",
      kpis: { label, value, delta: {pct, dir}|null, tone, href? }[],
      trend: { week: string, leads: number, bookings: number }[],   // last 8 weeks by created_at
    }
    // breakdowns (persona/source/revenue/funnel/partners/cta/contracts) keep coming from
    // the existing getPerformanceReadModel; page.tsx calls both. No duplication of that logic.

New components (src/app/analytics/_components/):
  overview/kpi-band.tsx            # 4 stat cards w/ delta + tone (client only if animated; else server)
  overview/trend-chart.tsx         # "use client" Recharts Area/Line w/ type toggle
  overview/takeaway-banner.tsx     # plain-language summary (server; pure string from a helper)
  overview/section-nav.tsx         # "use client" sticky in-page anchor nav w/ scroll-spy
  charts/toggle-chart.tsx          # "use client" wrapper: Bars <-> Donut for a ChartPoint[] set
  charts/donut-points.tsx          # "use client" donut rendering of ChartPoint[] (distinct from DonutSplit's approval donut)

Rewritten page:
  src/app/analytics/page.tsx       # single scrollable Overview (sections w/ anchors), demote contract to collapsible footer
```

### Data flow

`page.tsx` (server) reads `getCampaignWorkspaceList()`, `getPerformanceReadModel()`, and the new `getAnalyticsOverview(range)` (range from `?range=` searchParam, default 30d). It composes: KPI band, trend, takeaway, the existing breakdowns (persona/source/revenue/funnel/partners) rendered through the chart cards, the campaign table, and the collapsible contract footer. Client toggles (chart type, line/area) are local state in the leaf components; the date-range selector is a `<Link>`/query-param control (server re-renders) so it stays SSR-friendly.

### Phasing

- **Phase 1 (high-impact):** read-model `trend` + `kpis with deltas`; KPI band; trend chart w/ line/area toggle; takeaway banner; section nav; consolidate tabs → one scrollable page with the existing breakdowns as chart cards; chart-type toggle (Bars↔Donut) on breakdown cards; demote contract to collapsible footer.
- **Phase 2 (controls):** date-range selector (30d/90d/all) wired through `getAnalyticsOverview(range)` and the relevant breakdowns; persona/channel filters deferred unless wanted.

## Per-section plan (Overview page)

1. **Header** — existing `PageHeader` + brand aside + a "N waiting on you" `StatusPill`.
2. **KPI band** — Waiting on you (warn, links to /campaigns), Approved & ready (ok), Leads (range) with Δ, Revenue linked with Δ. Delta = % change vs prior equal-length period; null → "—".
3. **Hero row** — Trend chart (Area default, Line toggle; new leads vs booked jobs, last 8 weeks) + readiness `DonutSplit` with legend.
4. **Takeaway banner** — one plain sentence from `buildTakeaway(...)`.
5. **Leads section** — Leads by persona + Lead source mix (chart-type toggle Bars↔Donut), each with a one-line caption.
6. **Conversion section** — `FunnelFlow` + the proxy signal cards (kept), caption.
7. **Revenue section** — Revenue by persona ($ bars, toggle to donut), CTA events (bars / needs-data).
8. **Partners section** — partner bars + honest "needs data" chips.
9. **Campaign comparison** — existing table with segmented bars.
10. **"What we can't measure yet"** — collapsible `<details>` footer holding the old data-contract content (honest, de-emphasized).

## Testing

- Unit-test the pure helpers: `buildTrendBuckets` (bucketing by week, empty input, partial weeks), `computeDelta` (positive/negative/zero/no-prior → null), `buildTakeaway` (caught-up vs waiting vs changes phrasings). Alongside existing `analytics-charts-model.test.ts`.
- Chart/UI components verified via `pnpm build` + `tsc` + scoped eslint; manual smoke at `/analytics`.
- Re-run full `pnpm build`, `pnpm test src/app/analytics`, scoped eslint at the end.

## Out of scope

- New backend tables/migrations (trend & deltas use existing `created_at`; if a column is absent the feature degrades honestly).
- Any outbound/publish behavior (unchanged; approval-gated posture intact).
- Persona/channel filtering (possible later); multi-touch attribution.
