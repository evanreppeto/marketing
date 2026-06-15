# Analytics Visuals — Design

**Date:** 2026-06-15
**Branch:** `feat/analytics-visuals`
**Goal:** Turn the analytics surface (main page + 5 tabs + per-campaign detail) from walls of text into clear, interactive, mostly-visual pages that a non-technical operator can read at a glance — while staying truthful (no faked data) and inside `DESIGN.md`'s calm obsidian + antique-gold system.

## Decisions (locked with the user)

- **Charts:** add **Recharts 3.x** (React-19 compatible). All charts are `"use client"` components fed real data from the existing server components.
- **Aesthetic:** calm + clear, within `DESIGN.md`. No neon, no second visual-exception zone. "Fun" = instantly legible and visual, not loud.
- **Scope:** all three layers — main page, tab breakdowns, campaign detail page.
- **Main page hero replaces the metric tiles:** a portfolio donut becomes the top summary; the key numbers fold into/around it rather than living in a separate 4-tile strip.
- **Missing data = quiet placeholder:** real data draws a chart; "Missing / needs-data" signals show a small muted "needs data" chip. No fabricated bars, ever.

## Hard constraints

- **Truthful, no fake numbers.** Charts render only from real read-model data. When a value is `"Missing"` or there are zero rows, show the honest empty/placeholder state — never a zero-padded or invented chart. This preserves the app's truthful-status posture.
- **Server/client split.** Pages stay server components (they call `connection()` + async read-models). Recharts is client-only, so charts are leaf `"use client"` components receiving plain serializable props (arrays of `{label, value, tone}`).
- **Theme-adaptive color.** The palette is redefined per theme (gold / blue / red accent variants). Charts resolve live CSS tokens (`--accent`, `--ok`, `--warn`, `--priority`, `--text-*`, `--border-*`) on the client via a `useChartTheme()` hook reading `getComputedStyle`, so they re-tint with the active theme instead of hard-coding hex.
- **Calm motion.** Short fade/grow on load only; all chart animation disabled under `prefers-reduced-motion`. No glow, no bounce.
- **Reuse primitives.** Keep `WorkspacePanel`, `MetricStrip`, `TabNav`, `PageHeader`, `EmptyState`, `StatusPill`. Charts live *inside* these panels, not as new top-level layout.

## Architecture

```
src/app/analytics/_components/charts/
  use-chart-theme.ts     # client hook: resolves CSS tokens -> {accent, ok, warn, priority, text, grid, muted}
  chart-kit.tsx          # shared: themed <ChartTooltip>, <ChartFrame>, reduced-motion helper, "needs data" chip
  bar-breakdown.tsx      # horizontal bar chart for {label, value} breakdowns (+ tooltip, value labels)
  donut-split.tsx        # approval-state donut w/ center headline (total + %)
  funnel-flow.tsx        # conversion funnel: ordered stages with counts + step labels
  segmented-bar.tsx      # thin stacked bar (approved/waiting/changes/draft) for list rows
```

Each chart component:
- is `"use client"`,
- takes plain data + optional title/empty props,
- renders an honest empty/placeholder state when data is empty or all-missing,
- wraps Recharts in `<ResponsiveContainer>` for fluid width.

### Data shaping (no new I/O)

All data already exists in the read-models. Shaping helpers stay pure and testable:

- **Main page:** aggregate `rows` (campaign comparison) into portfolio totals `{approved, pending, changes, draft}` for the donut. Reuse existing `toComparisonRow`. Add `buildPortfolioSplit(rows)` (pure, unit-tested) in `campaign-analytics-model.ts` (or a sibling).
- **Tabs:** `performance.leadVolumeByPersona`, `leadVolumeBySource`, `revenueByPersona`, `conversionSignals`, `partnerSignals`, `ctaSignals` already return `{label, value, detail, tone}`. Map `value` (number vs the string `"Missing"`) → chartable number or placeholder. Add a small `toChartPoints(rows)` splitter returning `{points, missing}`.
- **Conversion funnel:** the read-model currently exposes conversion *rates/labels*, not the three raw stage counts. Add `funnelStages: { label, count }[]` (Leads → Bookings → Won) to the `live` `PerformanceReadModel` and populate it in `buildConversionSignals`'s caller from the same `leadRows`/`jobRows`/`wonOutcomes` already in scope. Pure, unit-tested.
- **Campaign detail:** reuse `buildFunnel`, `buildChannelBreakdown`, `buildComposition`. Donut from funnel counts; bar chart from channels; compact bars from composition.

## Per-surface plan

### 1. Main analytics page (`page.tsx`)
- **Hero panel** (replaces `MetricStrip`): `DonutSplit` of portfolio pieces by state, center shows `X%` approved + total pieces. Beside it, a compact legend doubling as the key numbers (Waiting on you / Approved / Campaigns / Creative made), each a labeled figure with tone dot; "Waiting on you" links to `/campaigns` when > 0. Honest empty state when there are no pieces yet.
- **Campaign comparison rows:** replace the single `ProgressBar` with `SegmentedBar` (green/gold/red/idle) so each row is visual; keep name, persona, state badge, % and link.

### 2. Tabs (`performance-breakdowns.tsx`)
- **Leads:** two `BarBreakdown` panels (by persona, by source) replacing `SignalList`.
- **Conversion:** `FunnelFlow` (Leads → Bookings → Won) on top; keep the proxy rate cards (`SignalGrid`) beneath, with "proxy" honesty preserved.
- **Revenue:** `BarBreakdown` of revenue-by-persona (dollar-formatted labels). CTA events: `BarBreakdown` if real events exist, else "needs data" chip.
- **Partners:** `BarBreakdown` for the real counts (partner companies, tiered); "Missing" referral metrics render as quiet "needs data" chips.
- **Data contract:** unchanged in substance (technical to-do list); minor visual tidy only.

### 3. Campaign detail (`campaign-analytics-detail.tsx`)
- Readiness `DonutSplit` (approved/waiting/changes) as the section hero alongside the metric strip.
- Channels → `BarBreakdown`.
- Composition → compact `BarBreakdown` (or small bars).
- "Needs data" / "locked" sections stay as-is — honest about what can't be measured yet.

## Testing

- Pure shaping helpers (`buildPortfolioSplit`, `toChartPoints`, conversion-stage builder) get vitest unit tests alongside the existing `campaign-analytics-model.test.ts`.
- Charts themselves are visual; verify via `pnpm build` (type-check) + manual run. No snapshot tests for SVG.
- Run `pnpm build` (not just lint — lint doesn't type-check) and scoped eslint on changed files.

## Out of scope

- New backend fields / migrations (the data-contract gaps stay documented, not filled).
- Any outbound/publishing behavior (unchanged; approval-gated posture intact).
- Redesigning the data-contract tab beyond light tidy.
