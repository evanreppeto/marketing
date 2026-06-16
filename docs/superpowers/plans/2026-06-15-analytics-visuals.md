# Analytics Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-heavy analytics surface (main page, 5 tabs, campaign detail) with calm, interactive charts a non-technical operator can read at a glance — without faking any data.

**Architecture:** Pages stay async server components calling the existing read-models. A new `src/app/analytics/_components/charts/` kit holds `"use client"` Recharts leaf components fed plain serializable props. A `useChartTheme()` hook resolves live CSS tokens so charts re-tint with the active theme. Pure data-shaping helpers (TDD'd) sit beside the existing `campaign-analytics-model.ts`. Missing/zero data renders an honest "needs data" placeholder, never a fabricated chart.

**Tech Stack:** Next.js 16, React 19, Recharts 3.x, Tailwind (theme tokens in `globals.css` / `theme.ts`), Vitest.

---

## File structure

```
Create:
  src/app/analytics/_components/charts/use-chart-theme.ts     # client hook -> resolved color tokens
  src/app/analytics/_components/charts/chart-kit.tsx          # ChartTooltip, ChartFrame, NeedsDataChip, useReducedMotion
  src/app/analytics/_components/charts/bar-breakdown.tsx      # horizontal bar chart
  src/app/analytics/_components/charts/donut-split.tsx        # approval-state donut + center headline
  src/app/analytics/_components/charts/funnel-flow.tsx        # conversion funnel
  src/app/analytics/_components/charts/segmented-bar.tsx      # stacked mini bar for list rows
  src/app/analytics/_components/__tests__/analytics-charts-model.test.ts

Modify:
  src/app/analytics/_components/campaign-analytics-model.ts   # + buildPortfolioSplit, toChartPoints
  src/lib/performance/read-model.ts                           # + funnelStages on live model
  src/app/analytics/page.tsx                                  # hero donut replaces MetricStrip; segmented rows
  src/app/analytics/_components/performance-breakdowns.tsx    # charts per tab
  src/app/analytics/_components/campaign-analytics-detail.tsx # donut + bar charts
  package.json                                                # + recharts
```

---

## Task 1: Install Recharts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Recharts 3.x (React 19 compatible)**

Run: `pnpm add recharts@^3`
Expected: `recharts` added to `dependencies`; pnpm lockfile updated, install succeeds.

- [ ] **Step 2: Verify the app still builds**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add recharts for analytics visuals"
```

---

## Task 2: Pure data-shaping helpers (TDD)

These are pure functions — test first. They convert read-model rows into chart-ready shapes and keep "Missing" honest.

**Files:**
- Modify: `src/app/analytics/_components/campaign-analytics-model.ts`
- Test: `src/app/analytics/_components/__tests__/analytics-charts-model.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/analytics/_components/__tests__/analytics-charts-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildPortfolioSplit, toChartPoints } from "../campaign-analytics-model";

describe("buildPortfolioSplit", () => {
  it("sums approved/pending/changes/draft across campaign rollups", () => {
    const split = buildPortfolioSplit([
      { rollup: { approved: 3, pending: 1, changes: 0, draft: 2, total: 6 } },
      { rollup: { approved: 1, pending: 2, changes: 1, draft: 0, total: 4 } },
    ]);
    expect(split).toEqual({
      approved: 4,
      pending: 3,
      changes: 1,
      draft: 2,
      total: 10,
      readiness: 40,
    });
  });

  it("reports zero readiness and empty totals when there are no pieces", () => {
    expect(buildPortfolioSplit([])).toEqual({
      approved: 0,
      pending: 0,
      changes: 0,
      draft: 0,
      total: 0,
      readiness: 0,
    });
  });
});

describe("toChartPoints", () => {
  it("splits numeric rows into chart points and string rows into missing labels", () => {
    const result = toChartPoints([
      { label: "Homeowner", value: 12, detail: "", tone: "blue" },
      { label: "Referral revenue", value: "Missing", detail: "", tone: "amber" },
      { label: "Partner", value: 3, detail: "", tone: "green" },
    ]);
    expect(result.points).toEqual([
      { label: "Homeowner", value: 12, tone: "blue" },
      { label: "Partner", value: 3, tone: "green" },
    ]);
    expect(result.missing).toEqual(["Referral revenue"]);
  });

  it("returns empty arrays for empty input", () => {
    expect(toChartPoints([])).toEqual({ points: [], missing: [] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/app/analytics/_components/__tests__/analytics-charts-model.test.ts`
Expected: FAIL — `buildPortfolioSplit`/`toChartPoints` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/app/analytics/_components/campaign-analytics-model.ts`:

```ts
import type { PerformanceBreakdown, PerformanceTone } from "@/lib/performance/read-model";

export type PortfolioSplit = {
  approved: number;
  pending: number;
  changes: number;
  draft: number;
  total: number;
  readiness: number;
};

export type ChartPoint = { label: string; value: number; tone: PerformanceTone };
export type ChartPoints = { points: ChartPoint[]; missing: string[] };

type RollupLike = {
  rollup: { approved: number; pending: number; changes: number; draft: number; total: number };
};

/** Aggregate every campaign's approval rollup into one portfolio-wide split for the hero donut. */
export function buildPortfolioSplit(items: RollupLike[]): PortfolioSplit {
  const sum = items.reduce(
    (acc, item) => ({
      approved: acc.approved + item.rollup.approved,
      pending: acc.pending + item.rollup.pending,
      changes: acc.changes + item.rollup.changes,
      draft: acc.draft + item.rollup.draft,
      total: acc.total + item.rollup.total,
    }),
    { approved: 0, pending: 0, changes: 0, draft: 0, total: 0 },
  );
  const readiness = sum.total > 0 ? Math.round((sum.approved / sum.total) * 100) : 0;
  return { ...sum, readiness };
}

/** Split breakdown rows: numeric values become chart points; string ("Missing") values become honest placeholder labels. */
export function toChartPoints(rows: PerformanceBreakdown[]): ChartPoints {
  const points: ChartPoint[] = [];
  const missing: string[] = [];
  for (const row of rows) {
    if (typeof row.value === "number") {
      points.push({ label: row.label, value: row.value, tone: row.tone });
    } else {
      missing.push(row.label);
    }
  }
  return { points, missing };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/app/analytics/_components/__tests__/analytics-charts-model.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/analytics/_components/campaign-analytics-model.ts src/app/analytics/_components/__tests__/analytics-charts-model.test.ts
git commit -m "feat(analytics): add portfolio-split and chart-point shaping helpers"
```

---

## Task 3: Add funnel stages to the performance read-model

The funnel needs three raw counts (Leads → Bookings → Won). The model exposes rates today, not counts.

**Files:**
- Modify: `src/lib/performance/read-model.ts`

- [ ] **Step 1: Add `funnelStages` to the `live` type**

In `src/lib/performance/read-model.ts`, in the `PerformanceReadModel` `status: "live"` object type (after `conversionSignals: PerformanceBreakdown[];`), add:

```ts
      funnelStages: { label: string; count: number }[];
```

- [ ] **Step 2: Populate it from the rows already in scope**

In `getPerformanceReadModel`, the returned `live` object already computes `wonOutcomes`. Add this field to the returned object (next to `conversionSignals`):

```ts
      funnelStages: [
        { label: "Leads", count: leadRows.length },
        { label: "Bookings", count: jobRows.length },
        { label: "Won", count: wonOutcomes.length },
      ],
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm build`
Expected: build succeeds (no consumer breaks — field is additive).

- [ ] **Step 4: Commit**

```bash
git add src/lib/performance/read-model.ts
git commit -m "feat(analytics): expose conversion funnel stage counts in read-model"
```

---

## Task 4: Chart theme hook + shared chart kit

**Files:**
- Create: `src/app/analytics/_components/charts/use-chart-theme.ts`
- Create: `src/app/analytics/_components/charts/chart-kit.tsx`

- [ ] **Step 1: Write the theme hook**

Create `src/app/analytics/_components/charts/use-chart-theme.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

export type ChartTheme = {
  accent: string;
  ok: string;
  warn: string;
  priority: string;
  textPrimary: string;
  textMuted: string;
  grid: string;
  surface: string;
};

/** Fallbacks match globals.css :root (gold theme) so SSR/first paint is sane before resolution. */
const FALLBACK: ChartTheme = {
  accent: "#c8a24a",
  ok: "#7fb89a",
  warn: "#d8b65e",
  priority: "#cc6666",
  textPrimary: "#f1ede2",
  textMuted: "#86868e",
  grid: "#2c2c33",
  surface: "#202027",
};

function read(varName: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}

/** Resolves live CSS tokens to concrete colors so Recharts (which needs real color strings) tracks the active theme. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    setTheme({
      accent: read("--accent", FALLBACK.accent),
      ok: read("--ok", FALLBACK.ok),
      warn: read("--warn", FALLBACK.warn),
      priority: read("--priority", FALLBACK.priority),
      textPrimary: read("--text-primary", FALLBACK.textPrimary),
      textMuted: read("--text-muted", FALLBACK.textMuted),
      grid: read("--border-hairline", FALLBACK.grid),
      surface: read("--surface-inset", FALLBACK.surface),
    });
  }, []);

  return theme;
}
```

- [ ] **Step 2: Write the shared kit**

Create `src/app/analytics/_components/charts/chart-kit.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

/** True when the user asked the OS to reduce motion; charts disable animation when so. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** A small muted chip stating a metric has no data yet — keeps the page honest without a fake chart. */
export function NeedsDataChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2 py-1 text-xs font-medium text-[var(--text-muted)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]" aria-hidden="true" />
      {label} — needs data
    </span>
  );
}

/** Themed tooltip for Recharts. `formatter` lets callers render dollars vs counts. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload?: { displayValue?: string } }>;
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  const text = point.payload?.displayValue ?? (formatter ? formatter(point.value) : String(point.value));
  return (
    <div className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--elev-panel)]">
      <div className="text-xs font-semibold text-[var(--text-primary)]">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold text-[var(--accent)]">{text}</div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/_components/charts/use-chart-theme.ts src/app/analytics/_components/charts/chart-kit.tsx
git commit -m "feat(analytics): chart theme hook and shared chart kit"
```

---

## Task 5: BarBreakdown chart

**Files:**
- Create: `src/app/analytics/_components/charts/bar-breakdown.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/analytics/_components/charts/bar-breakdown.tsx`:

```tsx
"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState } from "@/app/_components/page-header";
import type { ChartPoint } from "../campaign-analytics-model";
import { ChartTooltip, NeedsDataChip, useReducedMotion } from "./chart-kit";
import { useChartTheme, type ChartTheme } from "./use-chart-theme";

function toneColor(tone: ChartPoint["tone"], theme: ChartTheme): string {
  switch (tone) {
    case "green":
      return theme.ok;
    case "amber":
      return theme.warn;
    case "red":
      return theme.priority;
    default:
      return theme.accent;
  }
}

export function BarBreakdown({
  points,
  missing = [],
  emptyTitle,
  emptyDetail,
  formatter,
}: {
  points: ChartPoint[];
  missing?: string[];
  emptyTitle: string;
  emptyDetail: string;
  formatter?: (value: number) => string;
}) {
  const theme = useChartTheme();
  const reduced = useReducedMotion();

  if (points.length === 0) {
    return (
      <div className="p-4">
        <EmptyState title={emptyTitle} detail={emptyDetail} />
        {missing.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {missing.map((label) => (
              <NeedsDataChip key={label} label={label} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  // Each row ~44px keeps labels legible; min height avoids a squashed single-bar chart.
  const height = Math.max(points.length * 44, 120);
  const data = points.map((point) => ({
    ...point,
    displayValue: formatter ? formatter(point.value) : String(point.value),
  }));

  return (
    <div className="p-4">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap={10}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tickLine={false}
            axisLine={false}
            tick={{ fill: theme.textMuted, fontSize: 12 }}
          />
          <Tooltip cursor={{ fill: theme.surface }} content={<ChartTooltip formatter={formatter} />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={!reduced} animationDuration={420}>
            {data.map((point) => (
              <Cell key={point.label} fill={toneColor(point.tone, theme)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {missing.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {missing.map((label) => (
            <NeedsDataChip key={label} label={label} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/analytics/_components/charts/bar-breakdown.tsx
git commit -m "feat(analytics): BarBreakdown chart component"
```

---

## Task 6: DonutSplit chart

**Files:**
- Create: `src/app/analytics/_components/charts/donut-split.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/analytics/_components/charts/donut-split.tsx`:

```tsx
"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ChartTooltip, useReducedMotion } from "./chart-kit";
import { useChartTheme } from "./use-chart-theme";

export type DonutSegment = { key: string; label: string; value: number; toneVar: "ok" | "warn" | "priority" | "muted" };

/** Donut of approval states with a center headline (big % + caption). Renders a calm empty ring when total is 0. */
export function DonutSplit({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
}) {
  const theme = useChartTheme();
  const reduced = useReducedMotion();
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  const color = (toneVar: DonutSegment["toneVar"]) =>
    toneVar === "ok" ? theme.ok : toneVar === "warn" ? theme.warn : toneVar === "priority" ? theme.priority : theme.grid;

  // When empty, draw a single muted ring so the shape is present without implying data.
  const data = total > 0 ? segments.filter((segment) => segment.value > 0) : [{ key: "empty", label: "No pieces yet", value: 1, toneVar: "muted" as const }];

  return (
    <div className="relative h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={64}
            outerRadius={92}
            paddingAngle={total > 0 ? 2 : 0}
            stroke="none"
            isAnimationActive={!reduced}
            animationDuration={480}
          >
            {data.map((segment) => (
              <Cell key={segment.key} fill={color(segment.toneVar)} />
            ))}
          </Pie>
          {total > 0 ? <Tooltip content={<ChartTooltip />} /> : null}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-3xl font-bold tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">{centerValue}</div>
        <div className="mt-1 max-w-[10rem] text-center text-xs font-medium text-[var(--text-muted)]">{centerLabel}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/analytics/_components/charts/donut-split.tsx
git commit -m "feat(analytics): DonutSplit chart component"
```

---

## Task 7: FunnelFlow + SegmentedBar

**Files:**
- Create: `src/app/analytics/_components/charts/funnel-flow.tsx`
- Create: `src/app/analytics/_components/charts/segmented-bar.tsx`

- [ ] **Step 1: Write FunnelFlow**

Create `src/app/analytics/_components/charts/funnel-flow.tsx`. CSS-only horizontal funnel (no Recharts needed — widths are proportional to the first stage; clearer than a Recharts funnel for 3 stages):

```tsx
"use client";

export type FunnelStage = { label: string; count: number };

/** Horizontal funnel: each stage's bar width is proportional to the first (largest) stage. */
export function FunnelFlow({ stages }: { stages: FunnelStage[] }) {
  const top = stages[0]?.count ?? 0;
  return (
    <div className="space-y-3 p-4">
      {stages.map((stage, index) => {
        const pct = top > 0 ? Math.max((stage.count / top) * 100, stage.count > 0 ? 6 : 0) : 0;
        const stepRate = index > 0 && stages[index - 1].count > 0 ? Math.round((stage.count / stages[index - 1].count) * 100) : null;
        return (
          <div key={stage.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-[var(--text-primary)]">{stage.label}</span>
              <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {stage.count}
                {stepRate !== null ? <span className="ml-2 text-xs font-medium text-[var(--text-muted)]">{stepRate}% of prior</span> : null}
              </span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-[var(--surface-inset)]">
              <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write SegmentedBar**

Create `src/app/analytics/_components/charts/segmented-bar.tsx`. CSS-only stacked bar for list rows:

```tsx
"use client";

export type BarSegment = { key: string; value: number; toneVar: "ok" | "warn" | "priority" | "idle" };

const TONE_CLASS: Record<BarSegment["toneVar"], string> = {
  ok: "bg-[var(--ok)]",
  warn: "bg-[var(--warn)]",
  priority: "bg-[var(--priority)]",
  idle: "bg-[var(--border-strong)]",
};

/** Thin stacked bar (approved/waiting/changes/draft) for a campaign list row. Empty -> a single idle track. */
export function SegmentedBar({ segments }: { segments: BarSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-inset)]" aria-hidden="true">
      {total > 0 ? (
        segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <div key={segment.key} className={TONE_CLASS[segment.toneVar]} style={{ width: `${(segment.value / total) * 100}%` }} />
          ))
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/_components/charts/funnel-flow.tsx src/app/analytics/_components/charts/segmented-bar.tsx
git commit -m "feat(analytics): FunnelFlow and SegmentedBar components"
```

---

## Task 8: Wire the main analytics page

**Files:**
- Modify: `src/app/analytics/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/app/analytics/page.tsx`, add these new imports:

```tsx
import { buildPortfolioSplit } from "./_components/campaign-analytics-model";
import { DonutSplit, type DonutSegment } from "./_components/charts/donut-split";
import { SegmentedBar } from "./_components/charts/segmented-bar";
```

Then edit the existing `workspace` import — the current line is `import { MetricStrip, WorkspacePanel } from "../_components/workspace";`. This task removes the only `MetricStrip` usage, so change that line to `import { WorkspacePanel } from "../_components/workspace";`.

- [ ] **Step 2: Replace the `<MetricStrip>` block with the hero donut**

In the live return, delete the entire `<MetricStrip metrics={[...]} />` block (lines computing the 4 tiles) and replace with a hero panel. Just before the return, compute:

```tsx
  const split = buildPortfolioSplit(campaigns);
  const heroSegments: DonutSegment[] = [
    { key: "approved", label: "Approved", value: split.approved, toneVar: "ok" },
    { key: "pending", label: "Waiting on you", value: split.pending, toneVar: "warn" },
    { key: "changes", label: "Needs changes", value: split.changes, toneVar: "priority" },
    { key: "draft", label: "In draft", value: split.draft, toneVar: "muted" },
  ];
  const heroStats = [
    { label: "Waiting on you", value: waitingOnYou, href: waitingOnYou > 0 ? "/campaigns" : undefined, toneVar: "warn" as const },
    { label: "Approved & ready", value: readyCount, toneVar: "ok" as const },
    { label: "Campaigns", value: list.totals.campaigns, toneVar: "accent" as const },
    { label: "Creative made", value: list.totals.assets, toneVar: "accent" as const },
  ];
```

Then render this in place of `<MetricStrip>`:

```tsx
      <WorkspacePanel className="mb-5">
        <div className="grid gap-6 p-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
          <DonutSplit
            segments={heroSegments}
            centerValue={`${split.readiness}%`}
            centerLabel={split.total > 0 ? "of your work is approved" : "nothing drafted yet"}
          />
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--border-hairline)]">
            {heroStats.map((stat) => {
              const dot =
                stat.toneVar === "ok" ? "bg-[var(--ok)]" : stat.toneVar === "warn" ? "bg-[var(--warn)]" : "bg-[var(--accent)]";
              const body = (
                <>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
                    {stat.label}
                  </div>
                  <div className="mt-2 font-display text-3xl font-bold tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">{stat.value}</div>
                </>
              );
              return stat.href ? (
                <Link key={stat.label} href={stat.href} className="bg-[var(--surface-panel)] p-4 transition hover:bg-[var(--surface-inset)]">
                  {body}
                </Link>
              ) : (
                <div key={stat.label} className="bg-[var(--surface-panel)] p-4">
                  {body}
                </div>
              );
            })}
          </dl>
        </div>
      </WorkspacePanel>
```

- [ ] **Step 3: Upgrade the comparison row progress to a segmented bar**

In `ComparisonRow`, replace the `<ProgressBar readiness={row.readiness} />` line with:

```tsx
          <SegmentedBar
            segments={[
              { key: "approved", value: row.approved, toneVar: "ok" },
              { key: "pending", value: row.pending, toneVar: "warn" },
              { key: "changes", value: row.changes, toneVar: "priority" },
              { key: "draft", value: Math.max(row.total - row.approved - row.pending - row.changes, 0), toneVar: "idle" },
            ]}
          />
```

Then delete the now-unused `ProgressBar` function definition.

- [ ] **Step 4: Verify build and lint**

Run: `pnpm build`
Expected: build succeeds, no unused-symbol errors (confirm `ProgressBar` and `MetricStrip` are fully removed).
Run: `pnpm exec eslint src/app/analytics/page.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/analytics/page.tsx
git commit -m "feat(analytics): portfolio donut hero and segmented campaign rows"
```

---

## Task 9: Wire the tab breakdowns

**Files:**
- Modify: `src/app/analytics/_components/performance-breakdowns.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/app/analytics/_components/performance-breakdowns.tsx`, add:

```tsx
import { toChartPoints } from "./campaign-analytics-model";
import { BarBreakdown } from "./charts/bar-breakdown";
import { FunnelFlow } from "./charts/funnel-flow";
```

- [ ] **Step 2: Convert `LeadVolumeTab` to bar charts**

Replace the `LeadVolumeTab` body's two `<BreakdownPanel>` calls so each panel wraps a `BarBreakdown`:

```tsx
export function LeadVolumeTab({ performance }: { performance: LivePerformance }) {
  const byPersona = toChartPoints(performance.leadVolumeByPersona);
  const bySource = toChartPoints(performance.leadVolumeBySource);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <WorkspacePanel eyebrow="Lead volume" title="By persona" description="Current lead records grouped by persona.">
        <BarBreakdown points={byPersona.points} missing={byPersona.missing} emptyTitle="No persona data yet" emptyDetail="Lead records do not have persona data yet." />
      </WorkspacePanel>
      <WorkspacePanel eyebrow="Lead volume" title="By source" description="Where current lead records came from.">
        <BarBreakdown points={bySource.points} missing={bySource.missing} emptyTitle="No source data yet" emptyDetail="No lead source values are available yet." />
      </WorkspacePanel>
    </div>
  );
}
```

- [ ] **Step 3: Add the funnel to `ConversionTab`**

Change the signature to take the live performance model (so it gets `funnelStages`), and render the funnel above the existing proxy cards. Update `ConversionTab`:

```tsx
export function ConversionTab({ performance }: { performance: LivePerformance }) {
  return (
    <div className="space-y-5">
      <WorkspacePanel eyebrow="Conversion" title="Lead to booked work" description="How many leads become bookings, and bookings become won work. Counts only — no faked rates.">
        <FunnelFlow stages={performance.funnelStages} />
      </WorkspacePanel>
      <WorkspacePanel
        eyebrow="Conversion"
        title="Booking, estimate, and close signals"
        description="These use existing lead, job, and outcome rows. Anything labeled proxy is not a final business KPI yet."
      >
        <SignalGrid rows={performance.conversionSignals} />
      </WorkspacePanel>
    </div>
  );
}
```

- [ ] **Step 4: Convert `RevenueTab` revenue panel to a $ bar chart**

In `RevenueTab`, replace the revenue-by-persona `<BreakdownPanel>` with a `BarBreakdown` using a dollar formatter; keep the CTA panel but route it through `toChartPoints` + `BarBreakdown`:

```tsx
export function RevenueTab({ performance }: { performance: LivePerformance }) {
  const revenue = toChartPoints(performance.revenueByPersona);
  const cta = toChartPoints(performance.ctaSignals);
  const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <WorkspacePanel eyebrow="Revenue intelligence" title="Revenue by persona" description="Outcome revenue grouped by persona when present.">
        <BarBreakdown points={revenue.points} missing={revenue.missing} formatter={dollars} emptyTitle="No revenue attributed yet" emptyDetail="No outcome revenue by persona exists yet." />
      </WorkspacePanel>
      <WorkspacePanel eyebrow="CTA events" title="Form, photo-upload, and landing conversion" description="Internal reporting only.">
        <BarBreakdown points={cta.points} missing={cta.missing} emptyTitle="No CTA events yet" emptyDetail="No CTA/form/photo-upload events are tracked yet." />
      </WorkspacePanel>
    </div>
  );
}
```

Note: `revenueByPersona` values are currency *strings* today (`formatMoney`), so `toChartPoints` will route them all to `missing`. Fix the read-model to return numeric dollars for this breakdown: in `buildRevenueByPersona` (`src/lib/performance/read-model.ts`), change the mapped `value` from `formatMoney(cents)` to `Math.round(cents / 100)` (a number). The `dollars` formatter restores the `$` display. Verify no other consumer relies on the string form (search `revenueByPersona`).

- [ ] **Step 5: Convert `PartnerSignalsTab` to a bar chart with honest chips**

```tsx
export function PartnerSignalsTab({ rows }: { rows: PerformanceBreakdown[] }) {
  const { points, missing } = toChartPoints(rows);
  return (
    <WorkspacePanel eyebrow="Partners" title="Referral attribution structure" description="Partner-tiered companies are visible now; referral count and revenue need explicit attribution.">
      <BarBreakdown points={points} missing={missing} emptyTitle="No partner records yet" emptyDetail="No partner records are available yet." />
    </WorkspacePanel>
  );
}
```

- [ ] **Step 6: Update the caller for the new `ConversionTab` signature**

In `src/app/analytics/page.tsx`, change `<ConversionTab rows={performance.conversionSignals} />` to `<ConversionTab performance={performance} />`.

- [ ] **Step 7: Remove now-unused helpers**

If `BreakdownPanel` and `SignalList` are no longer referenced after these edits, delete them. (`SignalGrid`, `SignalCard`, `ToneTag` are still used by `ConversionTab`/`ContractTab` — keep them.) Confirm with a search before deleting.

- [ ] **Step 8: Verify build, tests, lint**

Run: `pnpm build`
Expected: succeeds.
Run: `pnpm test src/app/analytics`
Expected: PASS.
Run: `pnpm exec eslint src/app/analytics/_components/performance-breakdowns.tsx src/lib/performance/read-model.ts`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/analytics/_components/performance-breakdowns.tsx src/app/analytics/page.tsx src/lib/performance/read-model.ts
git commit -m "feat(analytics): charts for leads, conversion funnel, revenue, partners"
```

---

## Task 10: Wire the campaign detail page

**Files:**
- Modify: `src/app/analytics/_components/campaign-analytics-detail.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { DonutSplit, type DonutSegment } from "./charts/donut-split";
import { BarBreakdown } from "./charts/bar-breakdown";
import type { ChartPoint } from "./campaign-analytics-model";
```

- [ ] **Step 2: Add a readiness donut beside the metric strip**

After the existing `<MetricStrip>` block, insert a hero donut panel:

```tsx
      <WorkspacePanel eyebrow="Readiness" title="Where this campaign stands" description="Every piece in this package by approval state.">
        <div className="grid gap-6 p-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
          <DonutSplit
            segments={[
              { key: "approved", label: "Approved", value: funnel.approved, toneVar: "ok" },
              { key: "pending", label: "Waiting", value: funnel.pending, toneVar: "warn" },
              { key: "changes", label: "Needs changes", value: funnel.changes, toneVar: "priority" },
              { key: "draft", label: "In draft", value: Math.max(funnel.total - funnel.approved - funnel.pending - funnel.changes, 0), toneVar: "muted" },
            ]}
            centerValue={`${funnel.readiness}%`}
            centerLabel={funnel.total > 0 ? "approved" : "nothing drafted yet"}
          />
          <BarBreakdown
            points={composition.map((row): ChartPoint => ({ label: row.label, value: row.value, tone: "blue" }))}
            emptyTitle="Nothing attached yet"
            emptyDetail="Once Arc drafts pieces, the package composition appears here."
          />
        </div>
      </WorkspacePanel>
```

- [ ] **Step 3: Convert the Channels panel to a bar chart**

Replace the channels list (the `channels.map(...)` block inside the Channels `WorkspacePanel`) with:

```tsx
        <BarBreakdown
          points={channels.map((row): ChartPoint => ({ label: row.channel, value: row.count, tone: "blue" }))}
          emptyTitle="No deliverables yet"
          emptyDetail="Once Arc drafts pieces for this campaign, their channels appear here."
        />
```

Remove the now-unused `EmptyState` import only if no longer referenced elsewhere in the file (the locked-claims/measurement sections may still use it — check first).

- [ ] **Step 4: Verify build and lint**

Run: `pnpm build`
Expected: succeeds.
Run: `pnpm exec eslint src/app/analytics/_components/campaign-analytics-detail.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/analytics/_components/campaign-analytics-detail.tsx
git commit -m "feat(analytics): readiness donut and channel/composition charts on campaign detail"
```

---

## Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check + build**

Run: `pnpm build`
Expected: succeeds with no type errors.

- [ ] **Step 2: Full analytics test run**

Run: `pnpm test src/app/analytics`
Expected: all PASS.

- [ ] **Step 3: Lint changed files**

Run: `pnpm exec eslint src/app/analytics src/lib/performance/read-model.ts`
Expected: no errors (lint is scoped to changed files; the repo-wide lint reports vendor noise).

- [ ] **Step 4: Manual smoke (run the app)**

Run: `pnpm dev`, open `/analytics`. Verify: hero donut renders (or honest empty ring with no data), tabs switch and each shows its chart or a "needs data" chip, a campaign detail page shows the readiness donut + channel bars. Confirm charts re-tint if the theme is switched. Confirm reduced-motion disables chart animation.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(analytics): verification-pass adjustments"
```
```
```
