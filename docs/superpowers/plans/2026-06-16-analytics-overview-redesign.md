# Analytics Overview Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tab-heavy `/analytics` page with one professional, scrollable Overview — KPI band with deltas, a real weekly trend chart, plain-language guidance, an upgraded chart grid with type toggles, and the technical data-contract content demoted to a collapsible footer.

**Architecture:** Pure, unit-tested helpers (`overview-shape.ts`) bucket existing `created_at` timestamps into a weekly trend and period deltas; `getPerformanceReadModel` (which already fetches those rows) exposes `trend` + recent counts so there's no second query. New `"use client"` leaf components (trend chart, chart-type toggle, section nav) render the data; `analytics/page.tsx` becomes a single scrollable server component composing sections. Truthful throughout — missing data degrades to honest "needs data".

**Tech Stack:** Next.js 16, React 19, Recharts 3.8, Tailwind (theme tokens), Vitest.

---

## File structure

```
Create:
  src/lib/performance/overview-shape.ts                         # PURE helpers + types (trend, delta, takeaway)
  src/lib/performance/__tests__/overview-shape.test.ts          # unit tests
  src/app/analytics/_components/overview/trend-chart.tsx        # "use client" Area/Line + toggle
  src/app/analytics/_components/overview/kpi-band.tsx           # KPI stat cards w/ delta (server)
  src/app/analytics/_components/overview/takeaway-banner.tsx    # plain-language summary (server)
  src/app/analytics/_components/overview/section-nav.tsx        # "use client" sticky anchor nav + scroll-spy
  src/app/analytics/_components/charts/donut-points.tsx         # "use client" donut of ChartPoint[]
  src/app/analytics/_components/charts/toggle-chart.tsx         # "use client" Bars<->Donut wrapper

Modify:
  src/lib/performance/read-model.ts                             # add trend + leadsRecent + revenueRecent to live model
  src/app/analytics/_components/performance-breakdowns.tsx      # export section bodies for reuse (no tab chrome)
  src/app/analytics/page.tsx                                    # rewrite: single scrollable Overview
```

Phase 1 = Tasks 1–9. Phase 2 (date-range selector) = Task 10.

---

## Task 1: Pure overview-shape helpers (TDD)

**Files:**
- Create: `src/lib/performance/overview-shape.ts`
- Test: `src/lib/performance/__tests__/overview-shape.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/performance/__tests__/overview-shape.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildTrendBuckets, computeDelta, sumTwoPeriods, buildTakeaway } from "../overview-shape";

// Fixed reference instant: 2026-06-15T00:00:00Z (a Monday-agnostic anchor).
const NOW = Date.UTC(2026, 5, 15);
const day = 24 * 60 * 60 * 1000;

describe("computeDelta", () => {
  it("returns up with rounded percent when current exceeds prior", () => {
    expect(computeDelta(120, 100)).toEqual({ pct: 20, dir: "up" });
  });
  it("returns down for a decrease", () => {
    expect(computeDelta(80, 100)).toEqual({ pct: 20, dir: "down" });
  });
  it("returns flat for no change", () => {
    expect(computeDelta(100, 100)).toEqual({ pct: 0, dir: "flat" });
  });
  it("returns null when there is no prior baseline", () => {
    expect(computeDelta(50, 0)).toBeNull();
  });
});

describe("sumTwoPeriods", () => {
  it("sums weights into current (last N days) and prior (the N days before that)", () => {
    const items = [
      { at: new Date(NOW - 2 * day).toISOString(), weight: 1 }, // current
      { at: new Date(NOW - 10 * day).toISOString(), weight: 1 }, // current (within 30)
      { at: new Date(NOW - 40 * day).toISOString(), weight: 1 }, // prior (31-60)
      { at: new Date(NOW - 90 * day).toISOString(), weight: 1 }, // older, ignored
      { at: null, weight: 1 }, // unparseable, ignored
    ];
    expect(sumTwoPeriods(items, NOW, 30)).toEqual({ current: 2, prior: 1 });
  });
  it("sums dollar weights, not just counts", () => {
    const items = [{ at: new Date(NOW - 1 * day).toISOString(), weight: 500 }];
    expect(sumTwoPeriods(items, NOW, 30)).toEqual({ current: 500, prior: 0 });
  });
});

describe("buildTrendBuckets", () => {
  it("buckets leads and jobs into the last N weekly buckets, oldest first", () => {
    const leads = [{ created_at: new Date(NOW - 1 * day).toISOString() }, { created_at: new Date(NOW - 8 * day).toISOString() }];
    const jobs = [{ created_at: new Date(NOW - 2 * day).toISOString() }];
    const trend = buildTrendBuckets(leads, jobs, NOW, 3);
    expect(trend).toHaveLength(3);
    // newest bucket (last) holds items 0-6 days ago
    expect(trend[2]).toMatchObject({ leads: 1, bookings: 1 });
    // second-newest holds 7-13 days ago
    expect(trend[1]).toMatchObject({ leads: 1, bookings: 0 });
    expect(trend[0]).toMatchObject({ leads: 0, bookings: 0 });
    expect(typeof trend[0].week).toBe("string");
  });
  it("returns N empty buckets when there is no data", () => {
    expect(buildTrendBuckets([], [], NOW, 4)).toHaveLength(4);
  });
});

describe("buildTakeaway", () => {
  it("celebrates when nothing is waiting", () => {
    const s = { approved: 10, pending: 0, changes: 0, draft: 0, total: 10, readiness: 100 };
    expect(buildTakeaway(s, 0)).toMatch(/caught up|all/i);
  });
  it("calls out waiting and changes when present", () => {
    const s = { approved: 6, pending: 2, changes: 1, draft: 1, total: 10, readiness: 60 };
    const text = buildTakeaway(s, 2);
    expect(text).toMatch(/60%/);
    expect(text).toMatch(/2/);
  });
  it("handles the empty portfolio", () => {
    const s = { approved: 0, pending: 0, changes: 0, draft: 0, total: 0, readiness: 0 };
    expect(buildTakeaway(s, 0)).toMatch(/no campaigns|nothing/i);
  });
});
```

- [ ] **Step 2: Run tests, verify they FAIL**

Run: `pnpm test src/lib/performance/__tests__/overview-shape.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement**

Create `src/lib/performance/overview-shape.ts`:

```ts
export type TrendPoint = { week: string; leads: number; bookings: number };
export type KpiDelta = { pct: number; dir: "up" | "down" | "flat" };
// Structural shape of a portfolio split (defined locally so this lib module does not depend on the app layer).
type SplitLike = { approved: number; pending: number; changes: number; draft: number; total: number; readiness: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Percent change of current vs prior. Null when there's no prior baseline (can't honestly compute). */
export function computeDelta(current: number, prior: number): KpiDelta | null {
  if (prior <= 0) return null;
  const change = (current - prior) / prior;
  const pct = Math.round(Math.abs(change) * 100);
  const dir = current > prior ? "up" : current < prior ? "down" : "flat";
  return { pct, dir };
}

/** Sum weights for items in the last `days` (current) vs the `days` before that (prior). Unparseable timestamps are skipped. */
export function sumTwoPeriods(items: Array<{ at: string | null; weight: number }>, nowMs: number, days: number): { current: number; prior: number } {
  const currentStart = nowMs - days * DAY_MS;
  const priorStart = nowMs - 2 * days * DAY_MS;
  let current = 0;
  let prior = 0;
  for (const item of items) {
    if (!item.at) continue;
    const t = Date.parse(item.at);
    if (Number.isNaN(t)) continue;
    if (t >= currentStart && t <= nowMs) current += item.weight;
    else if (t >= priorStart && t < currentStart) prior += item.weight;
  }
  return { current, prior };
}

/** Bucket leads/jobs into `weeks` 7-day buckets ending at nowMs, oldest first. Label is the bucket's start date (M/D). */
export function buildTrendBuckets(
  leads: Array<{ created_at: string | null }>,
  jobs: Array<{ created_at: string | null }>,
  nowMs: number,
  weeks: number,
): TrendPoint[] {
  const buckets: TrendPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = nowMs - i * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const label = new Date(start + DAY_MS).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    buckets.push({ week: label, leads: 0, bookings: 0 });
  }
  const place = (at: string | null, key: "leads" | "bookings") => {
    if (!at) return;
    const t = Date.parse(at);
    if (Number.isNaN(t)) return;
    const weeksAgo = Math.floor((nowMs - t) / (7 * DAY_MS));
    if (weeksAgo < 0 || weeksAgo >= weeks) return;
    buckets[weeks - 1 - weeksAgo][key] += 1;
  };
  for (const lead of leads) place(lead.created_at, "leads");
  for (const job of jobs) place(job.created_at, "bookings");
  return buckets;
}

/** One plain-language sentence summarizing portfolio state for a non-technical reader. */
export function buildTakeaway(split: SplitLike, waitingOnYou: number): string {
  if (split.total === 0) return "No campaigns yet. When Arc drafts one or you create one, its progress shows up here.";
  if (waitingOnYou === 0 && split.changes === 0) {
    return `You're all caught up — ${split.readiness}% of your campaign work is approved and nothing needs your attention right now.`;
  }
  const parts: string[] = [];
  if (waitingOnYou > 0) parts.push(`${waitingOnYou} ${waitingOnYou === 1 ? "piece is" : "pieces are"} waiting on your approval`);
  if (split.changes > 0) parts.push(`${split.changes} ${split.changes === 1 ? "was" : "were"} sent back for changes`);
  return `${split.readiness}% of your campaign work is approved. ${parts.join(", and ")}.`;
}
```

- [ ] **Step 4: Run tests, verify they PASS**

Run: `pnpm test src/lib/performance/__tests__/overview-shape.test.ts`
Expected: PASS (all cases). Then `pnpm test src/app/analytics` and `pnpm test src/lib/performance` to confirm nothing else broke.

- [ ] **Step 5: Commit**

```bash
git add src/lib/performance/overview-shape.ts src/lib/performance/__tests__/overview-shape.test.ts
git commit -m "feat(analytics): pure trend/delta/takeaway helpers for overview"
```

---

## Task 2: Extend the performance read-model with trend + recent counts

**Files:**
- Modify: `src/lib/performance/read-model.ts`

- [ ] **Step 1: Add imports + types to the live model**

At the top of `src/lib/performance/read-model.ts`, add:
```ts
import { buildTrendBuckets, computeDelta, sumTwoPeriods, type KpiDelta, type TrendPoint } from "./overview-shape";
```
In the `PerformanceReadModel` `status: "live"` object type, after `funnelStages: { label: string; count: number }[];` add:
```ts
      trend: TrendPoint[];
      leadsRecent: { count: number; delta: KpiDelta | null };
      revenueRecent: { cents: number; delta: KpiDelta | null };
```

- [ ] **Step 2: Compute them in `getPerformanceReadModel`**

Inside `getPerformanceReadModel`, the local rows `leadRows`, `jobRows`, `outcomeRows` already exist with `created_at` (and outcomes have `closed_at`). Just before the `return { status: "live", ... }`, add:
```ts
    const now = Date.now();
    const leadPeriods = sumTwoPeriods(leadRows.map((lead) => ({ at: lead.created_at, weight: 1 })), now, 30);
    const revenuePeriods = sumTwoPeriods(
      outcomeRows.map((outcome) => ({ at: outcome.closed_at ?? outcome.created_at, weight: outcome.gross_revenue_cents ?? 0 })),
      now,
      30,
    );
```
Then add these three fields to the returned live object (next to `funnelStages`):
```ts
      trend: buildTrendBuckets(leadRows, jobRows, now, 8),
      leadsRecent: { count: leadPeriods.current, delta: computeDelta(leadPeriods.current, leadPeriods.prior) },
      revenueRecent: { cents: revenuePeriods.current, delta: computeDelta(revenuePeriods.current, revenuePeriods.prior) },
```
(`buildTrendBuckets` accepts `{created_at}` objects — `leadRows`/`jobRows` satisfy this structurally.)

- [ ] **Step 2b: Update existing read-model test expectations if needed**

Run the read-model's own tests if any exist: `pnpm test src/lib/performance`. If a snapshot/shape test asserts the exact live object keys, add the three new fields to its expectation. If no such test exists, skip.

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit` — clean.
Run: `pnpm test src/lib/performance src/app/analytics` — pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/performance/read-model.ts
git commit -m "feat(analytics): expose weekly trend and 30d lead/revenue deltas in read-model"
```

---

## Task 3: TrendChart component (Area/Line toggle)

**Files:**
- Create: `src/app/analytics/_components/overview/trend-chart.tsx`

- [ ] **Step 1: Implement**

Create `src/app/analytics/_components/overview/trend-chart.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendPoint } from "@/lib/performance/overview-shape";
import { EmptyState } from "@/app/_components/page-header";
import { ChartTooltip, useReducedMotion } from "../charts/chart-kit";
import { useChartTheme } from "../charts/use-chart-theme";

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const theme = useChartTheme();
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<"area" | "line">("area");

  const hasData = data.some((point) => point.leads > 0 || point.bookings > 0);
  if (!hasData) {
    return <div className="p-4"><EmptyState title="No trend yet" detail="Once leads and jobs have timestamps, the weekly trend appears here." /></div>;
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs font-medium text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: theme.accent }} />New leads</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: theme.ok }} />Booked jobs</span>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--border-panel)]">
          {(["area", "line"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`px-3 py-1 text-xs font-semibold capitalize transition ${mode === value ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        {mode === "area" ? (
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="trend-leads" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={theme.accent} stopOpacity={0.35} /><stop offset="100%" stopColor={theme.accent} stopOpacity={0} /></linearGradient>
              <linearGradient id="trend-bookings" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={theme.ok} stopOpacity={0.3} /><stop offset="100%" stopColor={theme.ok} stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fill: theme.textMuted, fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: theme.textMuted, fontSize: 11 }} width={36} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="leads" stroke={theme.accent} strokeWidth={2} fill="url(#trend-leads)" isAnimationActive={!reduced} />
            <Area type="monotone" dataKey="bookings" stroke={theme.ok} strokeWidth={2} fill="url(#trend-bookings)" isAnimationActive={!reduced} />
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fill: theme.textMuted, fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: theme.textMuted, fontSize: 11 }} width={36} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="leads" stroke={theme.accent} strokeWidth={2} dot={false} isAnimationActive={!reduced} />
            <Line type="monotone" dataKey="bookings" stroke={theme.ok} strokeWidth={2} dot={false} isAnimationActive={!reduced} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm exec tsc --noEmit` — clean. Confirm `Area, AreaChart, CartesianGrid, Line, LineChart` are valid recharts 3.8 exports (they are) and the `ResponsiveContainer` single-child conditional type-checks. If tsc complains that `ResponsiveContainer` needs a single element, the ternary already returns one element — fine.

- [ ] **Step 3: Commit**

```bash
git add src/app/analytics/_components/overview/trend-chart.tsx
git commit -m "feat(analytics): weekly trend chart with area/line toggle"
```

---

## Task 4: Donut-of-points + ToggleChart (Bars <-> Donut)

**Files:**
- Create: `src/app/analytics/_components/charts/donut-points.tsx`
- Create: `src/app/analytics/_components/charts/toggle-chart.tsx`

- [ ] **Step 1: Implement the points donut**

Create `src/app/analytics/_components/charts/donut-points.tsx`:

```tsx
"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ChartPoint } from "../campaign-analytics-model";
import { ChartTooltip, useReducedMotion } from "./chart-kit";
import { useChartTheme } from "./use-chart-theme";

// Gold-forward categorical ramp drawn from theme tokens — calm, no neon.
function palette(theme: ReturnType<typeof useChartTheme>): string[] {
  return [theme.accent, theme.ok, theme.warn, theme.priority, theme.textMuted];
}

export function DonutPoints({ points, formatter }: { points: ChartPoint[]; formatter?: (value: number) => string }) {
  const theme = useChartTheme();
  const reduced = useReducedMotion();
  const colors = palette(theme);
  const data = points.map((point) => ({ ...point, displayValue: formatter ? formatter(point.value) : String(point.value) }));

  return (
    <div className="flex items-center gap-5 p-4">
      <div className="h-[160px] w-[160px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none" isAnimationActive={!reduced}>
              {data.map((point, index) => (
                <Cell key={point.label} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={formatter} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((point, index) => (
          <li key={point.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-[var(--text-secondary)]">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colors[index % colors.length] }} />
              <span className="truncate">{point.label}</span>
            </span>
            <span className="font-mono text-xs font-bold text-[var(--text-primary)]">{point.displayValue}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Implement the toggle wrapper**

Create `src/app/analytics/_components/charts/toggle-chart.tsx`:

```tsx
"use client";

import { useState } from "react";

import type { ChartPoint } from "../campaign-analytics-model";
import { BarBreakdown } from "./bar-breakdown";
import { DonutPoints } from "./donut-points";
import { NeedsDataChip } from "./chart-kit";

/** A breakdown that the viewer can flip between a bar chart and a donut. Missing items stay honest chips. */
export function ToggleChart({
  points,
  missing = [],
  emptyTitle,
  emptyDetail,
  formatter,
  initial = "bars",
}: {
  points: ChartPoint[];
  missing?: string[];
  emptyTitle: string;
  emptyDetail: string;
  formatter?: (value: number) => string;
  initial?: "bars" | "donut";
}) {
  const [mode, setMode] = useState<"bars" | "donut">(initial);
  if (points.length === 0) {
    return <BarBreakdown points={points} missing={missing} emptyTitle={emptyTitle} emptyDetail={emptyDetail} formatter={formatter} />;
  }
  return (
    <div>
      <div className="flex justify-end px-4 pt-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--border-panel)]">
          {(["bars", "donut"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`px-3 py-1 text-xs font-semibold capitalize transition ${mode === value ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {mode === "bars" ? (
        <BarBreakdown points={points} missing={[]} emptyTitle={emptyTitle} emptyDetail={emptyDetail} formatter={formatter} />
      ) : (
        <DonutPoints points={points} formatter={formatter} />
      )}
      {missing.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {missing.map((label) => (
            <NeedsDataChip key={label} label={label} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit` — clean for both files.

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/_components/charts/donut-points.tsx src/app/analytics/_components/charts/toggle-chart.tsx
git commit -m "feat(analytics): donut-of-points and Bars/Donut toggle chart"
```

---

## Task 5: KpiBand component

**Files:**
- Create: `src/app/analytics/_components/overview/kpi-band.tsx`

- [ ] **Step 1: Implement**

Create `src/app/analytics/_components/overview/kpi-band.tsx`:

```tsx
import Link from "next/link";

import type { KpiDelta } from "@/lib/performance/overview-shape";

export type Kpi = {
  label: string;
  value: string;
  delta?: KpiDelta | null;
  caption?: string;
  toneVar: "ok" | "warn" | "accent";
  href?: string;
};

const DOT: Record<Kpi["toneVar"], string> = {
  ok: "bg-[var(--ok)]",
  warn: "bg-[var(--warn)]",
  accent: "bg-[var(--accent)]",
};

function DeltaTag({ delta }: { delta: KpiDelta | null | undefined }) {
  if (!delta) return <span className="text-xs text-[var(--text-muted)]">—</span>;
  if (delta.dir === "flat") return <span className="text-xs text-[var(--text-muted)]">no change</span>;
  const up = delta.dir === "up";
  return (
    <span className={`text-xs font-semibold ${up ? "text-[var(--ok)]" : "text-[var(--priority)]"}`}>
      {up ? "▲" : "▼"} {delta.pct}%
    </span>
  );
}

export function KpiBand({ kpis }: { kpis: Kpi[] }) {
  return (
    <section className="module-rise mb-5 grid overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => {
        const body = (
          <>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[kpi.toneVar]}`} aria-hidden="true" />
              {kpi.label}
            </div>
            <div className="mt-3 font-display text-3xl font-bold tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">{kpi.value}</div>
            <div className="mt-1.5 flex items-center gap-2">
              {kpi.delta !== undefined ? <DeltaTag delta={kpi.delta} /> : null}
              {kpi.caption ? <span className="text-xs text-[var(--text-secondary)]">{kpi.caption}</span> : null}
            </div>
          </>
        );
        return kpi.href ? (
          <Link key={kpi.label} href={kpi.href} className="border-b border-r border-[var(--border-hairline)] p-4 transition hover:bg-[var(--surface-inset)]">{body}</Link>
        ) : (
          <div key={kpi.label} className="border-b border-r border-[var(--border-hairline)] p-4">{body}</div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm exec tsc --noEmit` — clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/analytics/_components/overview/kpi-band.tsx
git commit -m "feat(analytics): KPI band with period-over-period deltas"
```

---

## Task 6: TakeawayBanner + SectionNav

**Files:**
- Create: `src/app/analytics/_components/overview/takeaway-banner.tsx`
- Create: `src/app/analytics/_components/overview/section-nav.tsx`

- [ ] **Step 1: Implement the takeaway banner (server component)**

Create `src/app/analytics/_components/overview/takeaway-banner.tsx`:

```tsx
export function TakeawayBanner({ text }: { text: string }) {
  return (
    <div className="mb-5 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)]">
      {text}
    </div>
  );
}
```

- [ ] **Step 2: Implement the sticky section nav (client, scroll-spy)**

Create `src/app/analytics/_components/overview/section-nav.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

export type SectionLink = { id: string; label: string };

/** Sticky in-page nav. Highlights the section currently in view; clicking smooth-scrolls to it. */
export function SectionNav({ links }: { links: SectionLink[] }) {
  const [active, setActive] = useState(links[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const link of links) {
      const el = document.getElementById(link.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [links]);

  return (
    <nav className="sticky top-2 z-10 mb-5 flex flex-wrap gap-1 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]/95 p-1.5 backdrop-blur">
      {links.map((link) => (
        <a
          key={link.id}
          href={`#${link.id}`}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${active === link.id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]"}`}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit` — clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/_components/overview/takeaway-banner.tsx src/app/analytics/_components/overview/section-nav.tsx
git commit -m "feat(analytics): takeaway banner and sticky section nav"
```

---

## Task 7: Refactor performance-breakdowns into reusable section bodies

**Files:**
- Modify: `src/app/analytics/_components/performance-breakdowns.tsx`

The current tab components each wrap content in their own panels. For the Overview we want the inner chart content with the togglable breakdowns. Keep the existing exports working (the campaign detail / any caller) but add section variants that use `ToggleChart`.

- [ ] **Step 1: Add imports**

Add to the top of `performance-breakdowns.tsx`:
```tsx
import { ToggleChart } from "./charts/toggle-chart";
```

- [ ] **Step 2: Switch togglable breakdowns to `ToggleChart`**

In `LeadVolumeTab`, replace the two `<BarBreakdown .../>` usages with `<ToggleChart .../>` (same props — `ToggleChart` is prop-compatible: `points`, `missing`, `emptyTitle`, `emptyDetail`, `formatter`). In `RevenueTab`, replace the revenue-by-persona `<BarBreakdown ... formatter={formatDollars} />` with `<ToggleChart ... formatter={formatDollars} initial="bars" />`. Leave CTA + Partners as `BarBreakdown` (their data is often missing; a toggle adds little). Leave `ConversionTab` (funnel + signal grid) unchanged.

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit` — clean.
Run: `pnpm test src/app/analytics` — pass.
Run: `pnpm exec eslint src/app/analytics/_components/performance-breakdowns.tsx` — clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/_components/performance-breakdowns.tsx
git commit -m "feat(analytics): make lead/revenue breakdowns Bars/Donut togglable"
```

---

## Task 8: Rewrite the analytics page as a single scrollable Overview

**Files:**
- Modify: `src/app/analytics/page.tsx`

READ the current `page.tsx` first. This rewrite removes the `TabNav`-as-primary-navigation and renders one scrollable page. Keep `ComparisonRow`, `StateBadge`, `toComparisonRow`, `byMostNeedingAttention`, `AnalyticsHeader`, `STAT_DOT_CLASS` helpers and the `ComparisonRowData` type. Keep the `list.status === "unavailable"` early return.

- [ ] **Step 1: Update imports**

Replace the tab-component import and add the overview pieces:
```tsx
import { buildTakeaway } from "@/lib/performance/overview-shape";
import { KpiBand, type Kpi } from "./_components/overview/kpi-band";
import { TrendChart } from "./_components/overview/trend-chart";
import { TakeawayBanner } from "./_components/overview/takeaway-banner";
import { SectionNav } from "./_components/overview/section-nav";
import { ConversionTab, ContractTab, LeadVolumeTab, PartnerSignalsTab, RevenueTab } from "./_components/performance-breakdowns";
import { DonutSplit, type DonutSegment } from "./_components/charts/donut-split";
import { WorkspacePanel } from "../_components/workspace";
```
Remove the now-unused `TabNav` import and the `analyticsTabs`/`AnalyticsTabKey`/`normalizeTab` tab machinery (the page no longer switches tabs via query param). Keep `buildPortfolioSplit`, `SegmentedBar`, `Link`, `EmptyState`, `PageHeader`, `connection`, the read-model getters, and `getAppSettings`.

- [ ] **Step 2: Compute view data in the live branch**

After the existing `const split = buildPortfolioSplit(campaigns);` and `heroSegments` (keep these), build the KPI list and takeaway. Replace the old `heroStats` array with:
```tsx
  const perf = performance.status === "live" ? performance : null;
  const fmtMoney = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
  const kpis: Kpi[] = [
    { label: "Waiting on you", value: String(waitingOnYou), caption: waitingOnYou > 0 ? "need approval" : "all clear", toneVar: "warn", href: waitingOnYou > 0 ? "/campaigns" : undefined },
    { label: "Approved & ready", value: String(readyCount), caption: "signed off", toneVar: "ok" },
    { label: "Leads (30d)", value: perf ? String(perf.leadsRecent.count) : "—", delta: perf ? perf.leadsRecent.delta : null, toneVar: "accent" },
    { label: "Revenue linked (30d)", value: perf ? fmtMoney(perf.revenueRecent.cents) : "—", delta: perf ? perf.revenueRecent.delta : null, toneVar: "accent" },
  ];
  const takeaway = buildTakeaway(split, waitingOnYou);
  const sectionLinks = [
    { id: "overview", label: "Overview" },
    { id: "leads", label: "Leads" },
    { id: "conversion", label: "Conversion" },
    { id: "revenue", label: "Revenue" },
    { id: "partners", label: "Partners" },
  ];
```

- [ ] **Step 3: Replace the return JSX (live branch)**

Replace everything from `<AnalyticsHeader ... />` through the end of the tab conditional with this single scrollable structure (keep `AnalyticsHeader` and the existing campaign comparison `<ul>`/`ComparisonRow` block — reuse them):

```tsx
  return (
    <>
      <AnalyticsHeader brand={brand} />
      <SectionNav links={sectionLinks} />

      <section id="overview" className="scroll-mt-20">
        <KpiBand kpis={kpis} />
        <TakeawayBanner text={takeaway} />
        <div className="mb-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <WorkspacePanel eyebrow="Trend" title="Leads & booked work" description="New leads vs. booked jobs over the last 8 weeks.">
            {perf ? <TrendChart data={perf.trend} /> : <EmptyState title="Trend unavailable" detail={performance.status === "unavailable" ? performance.message : "No data yet."} />}
          </WorkspacePanel>
          <WorkspacePanel eyebrow="Readiness" title="Portfolio approval">
            <div className="grid gap-5 p-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
              <DonutSplit segments={heroSegments} centerValue={`${split.readiness}%`} centerLabel={split.total > 0 ? "approved" : "nothing drafted yet"} />
              <dl className="space-y-2 text-sm">
                {heroSegments.map((seg) => (
                  <div key={seg.key} className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-[var(--text-secondary)]"><span className={`h-2 w-2 rounded-sm ${seg.toneVar === "ok" ? "bg-[var(--ok)]" : seg.toneVar === "warn" ? "bg-[var(--warn)]" : seg.toneVar === "priority" ? "bg-[var(--priority)]" : "bg-[var(--border-strong)]"}`} />{seg.label}</dt>
                    <dd className="font-mono text-xs font-bold text-[var(--text-primary)]">{seg.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </WorkspacePanel>
        </div>
        <WorkspacePanel title="Compare your campaigns" description="Each campaign and how far it has moved from draft to approved. Select one to see its full analytics.">
          {rows.length > 0 ? (
            <ul className="divide-y divide-[var(--border-hairline)]">
              {rows.map((row) => (<ComparisonRow key={row.id} row={row} />))}
            </ul>
          ) : (
            <EmptyState title="No campaigns yet" detail="When Arc drafts a campaign or you create one, it will appear here with its progress." />
          )}
        </WorkspacePanel>
      </section>

      {perf ? (
        <>
          <section id="leads" className="mt-8 scroll-mt-20"><SectionHeading title="Leads" /><LeadVolumeTab performance={perf} /></section>
          <section id="conversion" className="mt-8 scroll-mt-20"><SectionHeading title="Conversion" /><ConversionTab performance={perf} /></section>
          <section id="revenue" className="mt-8 scroll-mt-20"><SectionHeading title="Revenue" /><RevenueTab performance={perf} /></section>
          <section id="partners" className="mt-8 scroll-mt-20"><SectionHeading title="Partners" /><PartnerSignalsTab rows={perf.partnerSignals} /></section>
          <details className="mt-8 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--text-secondary)]">What we can&apos;t measure yet</summary>
            <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-muted)]">The fields below are the backend data still needed before deeper performance numbers are trustworthy.</p>
            <div className="mt-3"><ContractTab contracts={perf.contracts} /></div>
          </details>
        </>
      ) : (
        <EmptyState title="Performance data unavailable" detail={performance.status === "unavailable" ? performance.message : "No data yet."} />
      )}
    </>
  );
```

- [ ] **Step 4: Add the small `SectionHeading` helper**

Near the other helpers at the bottom of the file, add:
```tsx
function SectionHeading({ title }: { title: string }) {
  return <h2 className="mb-3 font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>;
}
```

- [ ] **Step 5: Verify**

Run: `pnpm exec tsc --noEmit` — clean (confirm no leftover references to `TabNav`, `analyticsTabs`, `normalizeTab`, `activeTab`, `STAT_DOT_CLASS` if it's now unused — remove anything orphaned).
Run: `pnpm build` — succeeds.
Run: `pnpm exec eslint src/app/analytics/page.tsx` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/analytics/page.tsx
git commit -m "feat(analytics): single scrollable Overview with KPI band, trend, sections"
```

---

## Task 9: Phase 1 verification pass

**Files:** none (verification only)

- [ ] **Step 1:** Run `pnpm build` — succeeds, `/analytics` compiles.
- [ ] **Step 2:** Run `pnpm test src/app/analytics src/lib/performance` — all pass.
- [ ] **Step 3:** Run `pnpm exec eslint src/app/analytics src/lib/performance` — clean (scope to these; repo-wide lint includes vendored noise).
- [ ] **Step 4:** Dev smoke: `PORT=3199 pnpm dev`, GET `/analytics` → HTTP 200, no runtime errors in the dev log; confirm sections render and the page scrolls (empty states are expected without Supabase).
- [ ] **Step 5:** Commit any fixes: `git add -A && git commit -m "fix(analytics): phase-1 verification adjustments"`.

---

## Task 10 (Phase 2): Date-range selector

**Files:**
- Modify: `src/lib/performance/read-model.ts`, `src/app/analytics/page.tsx`

- [ ] **Step 1: Parameterize the read-model by range**

Change `getPerformanceReadModel(client?)` to `getPerformanceReadModel(client?, rangeDays: number = 30)`. Use `rangeDays` in the `sumTwoPeriods(..., now, rangeDays)` calls and pass `Math.ceil(rangeDays / 7)` (min 8) as the `weeks` arg to `buildTrendBuckets` so the trend window matches the range (cap at, say, 26 weeks). Default preserves current behavior. Do NOT filter the breakdown queries yet (persona/source/etc. stay all-time) — only the trend + recent KPIs honor the range in this task; note that in a code comment so it's not mistaken for a bug.

- [ ] **Step 2: Read the range from searchParams in the page**

In `page.tsx`, parse `?range=` (`"30" | "90" | "365"`, default `30`) from `searchParams`, pass it to `getPerformanceReadModel(undefined, range)`. Render a small selector next to the section nav:
```tsx
const ranges = [{ v: 30, label: "30 days" }, { v: 90, label: "90 days" }, { v: 365, label: "1 year" }];
```
as `<Link href={`/analytics?range=${v}`}>` pills, marking the active one with `--accent-soft`/`--accent`. Update KPI labels to reflect the active range (e.g. `Leads (${rangeLabel})`).

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm test src/lib/performance src/app/analytics`, `pnpm build`, `pnpm exec eslint src/app/analytics src/lib/performance` — all clean/pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/performance/read-model.ts src/app/analytics/page.tsx
git commit -m "feat(analytics): date-range selector for trend and recent KPIs"
```
```
