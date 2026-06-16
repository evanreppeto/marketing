# Gallery — Deployed Work + Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/gallery` page showcasing Live (deployed) campaigns and their creative, with hybrid analytics — real Outbox dispatch funnel + reach now, and `campaign_results` marketing metrics via a new bearer-gated ingest API (+ seed).

**Architecture:** `src/domain/` (pure parse) → `src/lib/gallery/` (pure aggregate helpers, read-model, results persistence) → `src/app/gallery/` (page) + `src/app/api/v1/campaigns/results/` (ingest). The read-model reuses `getCampaignWorkspaceList` filtered to `lifecycle === "Live"` (no duplicated lifecycle logic) and joins `campaign_dispatches` + `campaign_results`. No schema changes.

**Tech Stack:** Next.js 16 server components, Supabase admin client, Vitest, Tailwind (design tokens per `DESIGN.md`).

**Reference spec:** `docs/superpowers/specs/2026-06-05-gallery-analytics-design.md`

---

## File Structure

**Phase 1 (gallery + read — independently shippable):**
- Create `src/lib/gallery/aggregate.ts` (+ `__tests__/aggregate.test.ts`) — pure types + `countDispatchFunnel`, `aggregateCampaignResults`, `aggregateTotals`.
- Create `src/lib/gallery/read-model.ts` (+ `__tests__/read-model.test.ts`) — `getGalleryData`.
- Create `src/app/gallery/page.tsx`, `src/app/gallery/_components/gallery-grid.tsx`, `src/app/gallery/_components/aggregate-strip.tsx`.
- Modify `src/app/_components/console-frame.tsx` + `src/app/_data/growth-engine.ts` (+ its test) — nav.

**Phase 2 (ingest + seed):**
- Create `src/domain/campaign-results.ts` (+ `src/domain/__tests__/campaign-results.test.ts`); modify `src/domain/index.ts` (re-export).
- Create `src/lib/gallery/results-persistence.ts` (+ `results-persistence.test.ts`).
- Create `src/app/api/v1/campaigns/results/route.ts`.
- Create `scripts/seed-campaign-results.mjs`; modify `package.json` (script) + `.env.example`.

---

# PHASE 1

## Task 1: Gallery aggregate helpers (pure)

**Files:**
- Create: `src/lib/gallery/aggregate.ts`, `src/lib/gallery/__tests__/aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/gallery/__tests__/aggregate.test.ts
import { describe, expect, it } from "vitest";

import { aggregateCampaignResults, aggregateTotals, countDispatchFunnel, type GalleryCampaign } from "../aggregate";

describe("countDispatchFunnel", () => {
  it("counts dispatch rows by status with a total", () => {
    const funnel = countDispatchFunnel([{ status: "sent" }, { status: "sent" }, { status: "delivered" }, { status: "queued" }]);
    expect(funnel).toMatchObject({ queued: 1, sent: 2, delivered: 1, scheduled: 0, failed: 0, canceled: 0, total: 4 });
  });
  it("is all-zero for no rows", () => {
    expect(countDispatchFunnel([])).toMatchObject({ total: 0, sent: 0, delivered: 0 });
  });
});

describe("aggregateCampaignResults", () => {
  it("sums metric columns and derives ctr/cpl/roi", () => {
    const m = aggregateCampaignResults([
      { impressions: 1000, clicks: 50, calls: 4, forms: 6, leads: 10, jobs: 2, won_revenue_cents: 500000, spend_cents: 100000 },
      { impressions: 1000, clicks: 50, calls: 0, forms: 4, leads: 0, jobs: 0, won_revenue_cents: 0, spend_cents: 0 },
    ]);
    expect(m).toMatchObject({ impressions: 2000, clicks: 100, leads: 10, jobs: 2, wonRevenueCents: 500000, spendCents: 100000, hasData: true });
    expect(m.ctr).toBeCloseTo(0.05); // 100/2000
    expect(m.costPerLeadCents).toBe(10000); // 100000/10
    expect(m.roi).toBeCloseTo(5); // 500000/100000
  });
  it("returns null derived rates on zero denominators, hasData false for no rows", () => {
    const m = aggregateCampaignResults([]);
    expect(m).toMatchObject({ impressions: 0, ctr: null, costPerLeadCents: null, roi: null, hasData: false });
  });
});

describe("aggregateTotals", () => {
  it("sums funnel + metrics across campaigns and re-derives rates", () => {
    const base: GalleryCampaign = {
      id: "c1", name: "A", persona: "PM", href: "/campaigns/c1", thumbnailUrl: null, assetTypes: [], assetCount: 0, mediaCount: 0,
      dispatch: { queued: 0, scheduled: 0, sent: 2, delivered: 1, failed: 0, canceled: 0, total: 3 },
      metrics: { impressions: 1000, clicks: 50, calls: 0, forms: 0, leads: 5, jobs: 1, wonRevenueCents: 200000, spendCents: 50000, ctr: 0.05, costPerLeadCents: 10000, roi: 4, hasData: true },
    };
    const totals = aggregateTotals([base, { ...base, id: "c2" }]);
    expect(totals.campaigns).toBe(2);
    expect(totals.dispatch.total).toBe(6);
    expect(totals.metrics.impressions).toBe(2000);
    expect(totals.metrics.leads).toBe(10);
    expect(totals.metrics.costPerLeadCents).toBe(10000); // 100000/10
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/gallery/__tests__/aggregate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/gallery/aggregate.ts`**

```ts
export type DispatchFunnel = {
  queued: number;
  scheduled: number;
  sent: number;
  delivered: number;
  failed: number;
  canceled: number;
  total: number;
};

export type CampaignMetrics = {
  impressions: number;
  clicks: number;
  calls: number;
  forms: number;
  leads: number;
  jobs: number;
  wonRevenueCents: number;
  spendCents: number;
  ctr: number | null;
  costPerLeadCents: number | null;
  roi: number | null;
  hasData: boolean;
};

export type GalleryCampaign = {
  id: string;
  name: string;
  persona: string;
  href: string;
  thumbnailUrl: string | null;
  assetTypes: string[];
  assetCount: number;
  mediaCount: number;
  dispatch: DispatchFunnel;
  metrics: CampaignMetrics;
};

export type GalleryTotals = {
  campaigns: number;
  dispatch: DispatchFunnel;
  metrics: CampaignMetrics;
};

export type CampaignResultMetricRow = {
  impressions: number | null;
  clicks: number | null;
  calls: number | null;
  forms: number | null;
  leads: number | null;
  jobs: number | null;
  won_revenue_cents: number | null;
  spend_cents: number | null;
};

const EMPTY_FUNNEL: DispatchFunnel = { queued: 0, scheduled: 0, sent: 0, delivered: 0, failed: 0, canceled: 0, total: 0 };

/** Pure: count dispatch rows into the lifecycle funnel. Unknown statuses are ignored. */
export function countDispatchFunnel(rows: Array<{ status: string }>): DispatchFunnel {
  const funnel: DispatchFunnel = { ...EMPTY_FUNNEL };
  for (const row of rows) {
    if (row.status in funnel && row.status !== "total") {
      funnel[row.status as keyof DispatchFunnel] += 1;
      funnel.total += 1;
    }
  }
  return funnel;
}

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Pure: derived rate helpers, null when the denominator is 0. */
function deriveRates(metrics: { impressions: number; clicks: number; leads: number; spendCents: number; wonRevenueCents: number }) {
  return {
    ctr: metrics.impressions > 0 ? metrics.clicks / metrics.impressions : null,
    costPerLeadCents: metrics.leads > 0 ? Math.round(metrics.spendCents / metrics.leads) : null,
    roi: metrics.spendCents > 0 ? metrics.wonRevenueCents / metrics.spendCents : null,
  };
}

/** Pure: sum campaign_results rows into a CampaignMetrics with derived rates. */
export function aggregateCampaignResults(rows: CampaignResultMetricRow[]): CampaignMetrics {
  const summed = {
    impressions: 0,
    clicks: 0,
    calls: 0,
    forms: 0,
    leads: 0,
    jobs: 0,
    wonRevenueCents: 0,
    spendCents: 0,
  };
  for (const row of rows) {
    summed.impressions += num(row.impressions);
    summed.clicks += num(row.clicks);
    summed.calls += num(row.calls);
    summed.forms += num(row.forms);
    summed.leads += num(row.leads);
    summed.jobs += num(row.jobs);
    summed.wonRevenueCents += num(row.won_revenue_cents);
    summed.spendCents += num(row.spend_cents);
  }
  return { ...summed, ...deriveRates(summed), hasData: rows.length > 0 };
}

/** Pure: roll up gallery campaigns into top-line totals. */
export function aggregateTotals(campaigns: GalleryCampaign[]): GalleryTotals {
  const dispatch: DispatchFunnel = { ...EMPTY_FUNNEL };
  const summed = { impressions: 0, clicks: 0, calls: 0, forms: 0, leads: 0, jobs: 0, wonRevenueCents: 0, spendCents: 0 };
  let hasData = false;

  for (const campaign of campaigns) {
    for (const key of Object.keys(dispatch) as Array<keyof DispatchFunnel>) {
      dispatch[key] += campaign.dispatch[key];
    }
    summed.impressions += campaign.metrics.impressions;
    summed.clicks += campaign.metrics.clicks;
    summed.calls += campaign.metrics.calls;
    summed.forms += campaign.metrics.forms;
    summed.leads += campaign.metrics.leads;
    summed.jobs += campaign.metrics.jobs;
    summed.wonRevenueCents += campaign.metrics.wonRevenueCents;
    summed.spendCents += campaign.metrics.spendCents;
    hasData = hasData || campaign.metrics.hasData;
  }

  return {
    campaigns: campaigns.length,
    dispatch,
    metrics: { ...summed, ...deriveRates(summed), hasData },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/gallery/__tests__/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gallery/aggregate.ts src/lib/gallery/__tests__/aggregate.test.ts
git commit -m "feat(gallery): pure dispatch-funnel + campaign-results aggregation helpers"
```

---

## Task 2: Gallery read-model

**Files:**
- Create: `src/lib/gallery/read-model.ts`, `src/lib/gallery/__tests__/read-model.test.ts`

- [ ] **Step 1: Write the failing test (pure assembly via injected client)**

```ts
// src/lib/gallery/__tests__/read-model.test.ts
import { describe, expect, it } from "vitest";

import { assembleGalleryCampaign } from "../read-model";

describe("assembleGalleryCampaign", () => {
  it("combines a live list item with its dispatch rows and result rows", () => {
    const item = {
      id: "c1", name: "Spring", persona: "Property Manager", href: "/campaigns/c1",
      thumbnailUrl: "http://x/img.png", assetTypes: ["Email", "Social Ad"], assetCount: 4, mediaCount: 2,
    };
    const out = assembleGalleryCampaign(
      item,
      [{ status: "sent" }, { status: "delivered" }],
      [{ impressions: 1000, clicks: 50, calls: 0, forms: 0, leads: 5, jobs: 1, won_revenue_cents: 200000, spend_cents: 50000 }],
    );
    expect(out).toMatchObject({ id: "c1", name: "Spring", href: "/campaigns/c1", thumbnailUrl: "http://x/img.png" });
    expect(out.dispatch).toMatchObject({ sent: 1, delivered: 1, total: 2 });
    expect(out.metrics).toMatchObject({ impressions: 1000, leads: 5, hasData: true, roi: 4 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/gallery/__tests__/read-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/gallery/read-model.ts`**

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { getCampaignWorkspaceList, type CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import {
  aggregateCampaignResults,
  aggregateTotals,
  countDispatchFunnel,
  type CampaignResultMetricRow,
  type GalleryCampaign,
  type GalleryTotals,
} from "./aggregate";

/** The subset of a campaigns list item the gallery showcase needs. */
export type GalleryListItem = Pick<
  CampaignWorkspaceListItem,
  "id" | "name" | "persona" | "href" | "thumbnailUrl" | "assetTypes" | "assetCount" | "mediaCount"
>;

export type GalleryData =
  | { status: "live"; campaigns: GalleryCampaign[]; totals: GalleryTotals }
  | { status: "unavailable"; message: string };

/** Pure: combine one live campaign's showcase fields with its dispatch + result rows. */
export function assembleGalleryCampaign(
  item: GalleryListItem,
  dispatchRows: Array<{ status: string }>,
  resultRows: CampaignResultMetricRow[],
): GalleryCampaign {
  return {
    id: item.id,
    name: item.name,
    persona: item.persona,
    href: item.href,
    thumbnailUrl: item.thumbnailUrl,
    assetTypes: item.assetTypes,
    assetCount: item.assetCount,
    mediaCount: item.mediaCount,
    dispatch: countDispatchFunnel(dispatchRows),
    metrics: aggregateCampaignResults(resultRows),
  };
}

type DispatchRow = { campaign_id: string; status: string };
type ResultRow = CampaignResultMetricRow & { campaign_id: string };

/** Live (deployed) campaigns + their dispatch funnel + marketing metrics. */
export async function getGalleryData(client?: SupabaseClient): Promise<GalleryData> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const list = await getCampaignWorkspaceList(client);
    if (list.status === "unavailable") {
      return { status: "unavailable", message: list.message };
    }

    const live = list.campaigns.filter((campaign) => campaign.lifecycle === "Live");
    if (live.length === 0) {
      return { status: "live", campaigns: [], totals: aggregateTotals([]) };
    }

    const supabase = client ?? getSupabaseAdminClient();
    const ids = live.map((campaign) => campaign.id);

    const { data: dispatchData, error: dispatchError } = await supabase
      .from("campaign_dispatches")
      .select("campaign_id,status")
      .in("campaign_id", ids);
    if (dispatchError) throw new Error(`campaign_dispatches: ${dispatchError.message}`);

    const { data: resultData, error: resultError } = await supabase
      .from("campaign_results")
      .select("campaign_id,impressions,clicks,calls,forms,leads,jobs,won_revenue_cents,spend_cents")
      .in("campaign_id", ids);
    if (resultError) throw new Error(`campaign_results: ${resultError.message}`);

    const dispatchByCampaign = new Map<string, DispatchRow[]>();
    for (const row of (dispatchData ?? []) as DispatchRow[]) {
      const list = dispatchByCampaign.get(row.campaign_id) ?? [];
      list.push(row);
      dispatchByCampaign.set(row.campaign_id, list);
    }
    const resultsByCampaign = new Map<string, ResultRow[]>();
    for (const row of (resultData ?? []) as ResultRow[]) {
      const list = resultsByCampaign.get(row.campaign_id) ?? [];
      list.push(row);
      resultsByCampaign.set(row.campaign_id, list);
    }

    const campaigns = live.map((item) =>
      assembleGalleryCampaign(item, dispatchByCampaign.get(item.id) ?? [], resultsByCampaign.get(item.id) ?? []),
    );

    return { status: "live", campaigns, totals: aggregateTotals(campaigns) };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Gallery is unavailable." };
  }
}
```

> Confirm `getCampaignWorkspaceList` accepts an optional client arg and its items expose `lifecycle`, `thumbnailUrl`, `assetTypes`, `assetCount`, `mediaCount`, `href`, `persona`, `name` (they do — verified in `read-model.ts`). The `GalleryListItem` `Pick` keeps the dependency explicit.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/gallery/__tests__/read-model.test.ts`
Expected: PASS. Then `pnpm test src/lib/gallery` — all green. Then `pnpm build` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gallery/read-model.ts src/lib/gallery/__tests__/read-model.test.ts
git commit -m "feat(gallery): read-model assembling live campaigns + dispatch + results"
```

---

## Task 3: Gallery page + nav

**Files:**
- Create: `src/app/gallery/page.tsx`, `src/app/gallery/_components/gallery-grid.tsx`, `src/app/gallery/_components/aggregate-strip.tsx`
- Modify: `src/app/_components/console-frame.tsx`, `src/app/_data/growth-engine.ts`, `src/app/_data/__tests__/growth-engine.test.ts`

- [ ] **Step 1: Add nav (sidebar + quick-jump) + test**

In `src/app/_components/console-frame.tsx`, add to `navItems` after the Outbox entry:

```ts
  { label: "Gallery", href: "/gallery", iconSrc: "/brand/nav-icons/personas-icon.png", matches: ["/gallery"] },
```

> No dedicated gallery icon exists under `public/brand/nav-icons/` (available: crm, arc, personas, review, settings, today, vault — `today` is used by Outbox, `review` by Campaigns, `crm` by CRM). `personas-icon.png` is a placeholder reuse; flag in the report that a real gallery icon should be supplied. Confirm the chosen file exists with `ls public/brand/nav-icons/`.

In `src/app/_data/growth-engine.ts`, add to `navItems` after the Outbox entry:

```ts
  { label: "Gallery", href: "/gallery", icon: "approval" },
```

Append to `src/app/_data/__tests__/growth-engine.test.ts`:

```ts
  it("includes a Gallery entry pointing at /gallery", () => {
    const gallery = navItems.find((item) => item.href === "/gallery");
    expect(gallery?.label).toBe("Gallery");
  });
```

Run: `pnpm test src/app/_data/__tests__/growth-engine.test.ts` → PASS.

- [ ] **Step 2: Create the aggregate strip** `src/app/gallery/_components/aggregate-strip.tsx`:

```tsx
import { StatusPill } from "@/app/_components/page-header";
import type { GalleryTotals } from "@/lib/gallery/aggregate";

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function AggregateStrip({ totals }: { totals: GalleryTotals }) {
  const { dispatch, metrics } = totals;
  const stats: Array<{ label: string; value: string }> = [
    { label: "Deployed", value: String(totals.campaigns) },
    { label: "Dispatched", value: String(dispatch.total) },
    { label: "Delivered", value: String(dispatch.delivered) },
  ];
  if (metrics.hasData) {
    stats.push(
      { label: "Impressions", value: metrics.impressions.toLocaleString("en-US") },
      { label: "Clicks", value: metrics.clicks.toLocaleString("en-US") },
      { label: "CTR", value: metrics.ctr !== null ? `${(metrics.ctr * 100).toFixed(1)}%` : "—" },
      { label: "Leads", value: String(metrics.leads) },
      { label: "Jobs", value: String(metrics.jobs) },
      { label: "Revenue", value: money(metrics.wonRevenueCents) },
      { label: "Spend", value: money(metrics.spendCents) },
      { label: "ROI", value: metrics.roi !== null ? `${metrics.roi.toFixed(1)}x` : "—" },
    );
  }

  return (
    <section className="module-rise mb-5 rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Deployed performance</span>
        {!metrics.hasData ? <StatusPill tone="gray">Awaiting results data</StatusPill> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{stat.label}</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-[var(--text-primary)]">{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create the grid** `src/app/gallery/_components/gallery-grid.tsx`:

```tsx
import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import type { GalleryCampaign } from "@/lib/gallery/aggregate";

export function GalleryGrid({ campaigns }: { campaigns: GalleryCampaign[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {campaigns.map((campaign) => (
        <GalleryCard key={campaign.id} campaign={campaign} />
      ))}
    </div>
  );
}

function GalleryCard({ campaign }: { campaign: GalleryCampaign }) {
  const { dispatch, metrics } = campaign;
  return (
    <Link
      href={campaign.href}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] transition hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <div className="flex h-40 items-center justify-center overflow-hidden bg-[oklch(0.14_0.025_246)]">
        {campaign.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Arc emits arbitrary remote creative URLs; no optimizer config
          <img src={campaign.thumbnailUrl} alt={campaign.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <span className="px-4 text-center font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {campaign.assetTypes.join(" · ") || "No creative cover"}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate font-black text-[var(--text-primary)]">{campaign.name}</h3>
          <StatusPill tone="blue">Live</StatusPill>
        </div>
        <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-muted)]">{campaign.persona}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border-hairline)] pt-3 text-xs text-[var(--text-secondary)]">
          <Stat label="Sent" value={dispatch.sent} />
          <Stat label="Delivered" value={dispatch.delivered} />
          {metrics.hasData ? <Stat label="Leads" value={metrics.leads} /> : null}
          {metrics.hasData ? <Stat label="Jobs" value={metrics.jobs} /> : null}
          {metrics.hasData && metrics.roi !== null ? <Stat label="ROI" value={`${metrics.roi.toFixed(1)}x`} /> : null}
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono tabular-nums font-bold text-[var(--text-primary)]">{value}</span>
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Create the page** `src/app/gallery/page.tsx`:

```tsx
import { connection } from "next/server";

import { EmptyState, PageHeader } from "@/app/_components/page-header";
import { getGalleryData } from "@/lib/gallery/read-model";

import { AggregateStrip } from "./_components/aggregate-strip";
import { GalleryGrid } from "./_components/gallery-grid";

export default async function GalleryPage() {
  await connection();

  const data = await getGalleryData();

  if (data.status === "unavailable") {
    return (
      <>
        <PageHeader eyebrow="Showcase" title="Gallery" description={data.message} />
        <EmptyState title="Gallery unavailable" detail={data.message} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Showcase"
        title="Gallery"
        description="Every deployed campaign and its creative, with delivery and results. Read-only — the app records and measures; it does not send."
      />
      {data.campaigns.length === 0 ? (
        <EmptyState title="Nothing deployed yet" detail="Launch a campaign from Campaigns and it will appear here once it goes live." />
      ) : (
        <>
          <AggregateStrip totals={data.totals} />
          <GalleryGrid campaigns={data.campaigns} />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 5: Verify build + lint**

Run: `pnpm lint && pnpm build`
Expected: clean; `/gallery` compiles; sidebar shows Campaigns / CRM / Outbox / Gallery.

- [ ] **Step 6: Commit**

```bash
git add src/app/gallery src/app/_components/console-frame.tsx src/app/_data/growth-engine.ts src/app/_data/__tests__/growth-engine.test.ts
git commit -m "feat(gallery): /gallery deployed-work page + aggregate strip + nav"
```

> **Phase 1 is independently shippable** — real dispatch/reach numbers now; marketing metrics show "Awaiting results data" until Phase 2 ingests them.

---

# PHASE 2

## Task 4: Domain — parse campaign-results payload

**Files:**
- Create: `src/domain/campaign-results.ts`, `src/domain/__tests__/campaign-results.test.ts`
- Modify: `src/domain/index.ts` (re-export)

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/__tests__/campaign-results.test.ts
import { describe, expect, it } from "vitest";

import { CampaignResultsValidationError, parseCampaignResultsPayload } from "../campaign-results";

const valid = {
  campaign_id: "11111111-1111-1111-1111-111111111111",
  period_start: "2026-05-01",
  period_end: "2026-05-31",
  impressions: 1000,
  clicks: 50,
  leads: 5,
  won_revenue_cents: 200000,
  spend_cents: 50000,
};

describe("parseCampaignResultsPayload", () => {
  it("parses a single result into a one-element array with defaulted zero metrics", () => {
    const out = parseCampaignResultsPayload(valid);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      campaign_id: valid.campaign_id,
      period_start: "2026-05-01",
      period_end: "2026-05-31",
      impressions: 1000,
      clicks: 50,
      leads: 5,
      calls: 0,
      forms: 0,
      jobs: 0,
      won_revenue_cents: 200000,
      spend_cents: 50000,
    });
  });

  it("parses an array of results", () => {
    expect(parseCampaignResultsPayload([valid, { ...valid, period_start: "2026-06-01", period_end: "2026-06-30" }])).toHaveLength(2);
  });

  it("rejects a missing/invalid campaign_id", () => {
    expect(() => parseCampaignResultsPayload({ ...valid, campaign_id: "nope" })).toThrow(CampaignResultsValidationError);
  });

  it("rejects period_end before period_start", () => {
    expect(() => parseCampaignResultsPayload({ ...valid, period_start: "2026-06-30", period_end: "2026-06-01" })).toThrow(/period/i);
  });

  it("rejects negative metrics", () => {
    expect(() => parseCampaignResultsPayload({ ...valid, clicks: -1 })).toThrow(CampaignResultsValidationError);
  });

  it("rejects an empty array", () => {
    expect(() => parseCampaignResultsPayload([])).toThrow(/at least one/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/domain/__tests__/campaign-results.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/campaign-results.ts`**

```ts
export class CampaignResultsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignResultsValidationError";
  }
}

export type ParsedCampaignResult = {
  campaign_id: string;
  campaign_asset_id: string | null;
  channel: string | null;
  period_start: string;
  period_end: string;
  impressions: number;
  clicks: number;
  calls: number;
  forms: number;
  leads: number;
  jobs: number;
  won_revenue_cents: number;
  spend_cents: number;
  metadata: Record<string, unknown>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const METRIC_KEYS = ["impressions", "clicks", "calls", "forms", "leads", "jobs", "won_revenue_cents", "spend_cents"] as const;

function asObject(value: unknown, index: number): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CampaignResultsValidationError(`Result at index ${index} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonNegativeInt(value: unknown, field: string, index: number): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "${field}" must be a non-negative integer.`);
  }
  return value;
}

function parseOne(raw: unknown, index: number): ParsedCampaignResult {
  const obj = asObject(raw, index);

  const campaignId = obj.campaign_id;
  if (typeof campaignId !== "string" || !UUID_RE.test(campaignId)) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "campaign_id" must be a valid UUID.`);
  }

  const periodStart = obj.period_start;
  const periodEnd = obj.period_end;
  if (typeof periodStart !== "string" || !DATE_RE.test(periodStart) || typeof periodEnd !== "string" || !DATE_RE.test(periodEnd)) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "period_start"/"period_end" must be YYYY-MM-DD dates.`);
  }
  if (periodEnd < periodStart) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "period_end" must not be before "period_start".`);
  }

  const metrics = Object.fromEntries(METRIC_KEYS.map((key) => [key, nonNegativeInt(obj[key], key, index)])) as Record<
    (typeof METRIC_KEYS)[number],
    number
  >;

  const assetId = obj.campaign_asset_id;
  if (assetId !== undefined && assetId !== null && (typeof assetId !== "string" || !UUID_RE.test(assetId))) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "campaign_asset_id" must be a UUID when provided.`);
  }

  const channel = obj.channel;
  if (channel !== undefined && channel !== null && typeof channel !== "string") {
    throw new CampaignResultsValidationError(`Result at index ${index}: "channel" must be a string when provided.`);
  }

  const metadata = obj.metadata;
  if (metadata !== undefined && (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "metadata" must be an object when provided.`);
  }

  return {
    campaign_id: campaignId,
    campaign_asset_id: (assetId as string | undefined) ?? null,
    channel: (channel as string | undefined) ?? null,
    period_start: periodStart,
    period_end: periodEnd,
    ...metrics,
    metadata: (metadata as Record<string, unknown> | undefined) ?? {},
  };
}

/** Pure: validate + normalize one result or an array of results. Throws on bad input. */
export function parseCampaignResultsPayload(payload: unknown): ParsedCampaignResult[] {
  const list = Array.isArray(payload) ? payload : [payload];
  if (list.length === 0) {
    throw new CampaignResultsValidationError("Provide at least one campaign result.");
  }
  return list.map((entry, index) => parseOne(entry, index));
}
```

- [ ] **Step 4: Re-export from `src/domain/index.ts`**

Add a line alongside the other re-exports:

```ts
export * from "./campaign-results";
```

> Confirm the file uses `export * from "./<module>"` style for its other modules; match it. If it uses named re-exports, add `export { parseCampaignResultsPayload, CampaignResultsValidationError, type ParsedCampaignResult } from "./campaign-results";`.

- [ ] **Step 5: Run tests + build**

Run: `pnpm test src/domain/__tests__/campaign-results.test.ts` → PASS. Then `pnpm build` clean.

- [ ] **Step 6: Commit**

```bash
git add src/domain/campaign-results.ts src/domain/__tests__/campaign-results.test.ts src/domain/index.ts
git commit -m "feat(gallery): domain parser for campaign-results ingest payloads"
```

---

## Task 5: Persistence — upsert campaign results

**Files:**
- Create: `src/lib/gallery/results-persistence.ts`, `src/lib/gallery/results-persistence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/gallery/results-persistence.test.ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";
import type { ParsedCampaignResult } from "@/domain";

import { persistCampaignResults } from "./results-persistence";

function findCalls(supabase: { calls: Array<[string, ...unknown[]]> }, method: string) {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

const row: ParsedCampaignResult = {
  campaign_id: "11111111-1111-1111-1111-111111111111",
  campaign_asset_id: null,
  channel: "meta_ad",
  period_start: "2026-05-01",
  period_end: "2026-05-31",
  impressions: 1000, clicks: 50, calls: 0, forms: 0, leads: 5, jobs: 1,
  won_revenue_cents: 200000, spend_cents: 50000, metadata: {},
};

describe("persistCampaignResults", () => {
  it("inserts a new result when no matching period row exists", async () => {
    const supabase = createSupabaseQueryMock({ campaign_results: { data: null, error: null } });
    const out = await persistCampaignResults([row], supabase);
    expect(out).toMatchObject({ inserted: 1, updated: 0 });
    expect(findCalls(supabase, "insert")).toContainEqual(expect.objectContaining({ campaign_id: row.campaign_id, impressions: 1000 }));
  });

  it("updates the existing row when a matching period row exists", async () => {
    const supabase = createSupabaseQueryMock({ campaign_results: { data: { id: "res-1" }, error: null } });
    const out = await persistCampaignResults([row], supabase);
    expect(out).toMatchObject({ inserted: 0, updated: 1 });
    expect(findCalls(supabase, "update")).toContainEqual(expect.objectContaining({ impressions: 1000 }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/gallery/results-persistence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/gallery/results-persistence.ts`**

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { type ParsedCampaignResult } from "@/domain";

export type PersistResultsSummary = { inserted: number; updated: number };

/** Upsert campaign_results rows on the natural period key
 *  (campaign_id, campaign_asset_id, channel, period_start, period_end) using
 *  select-then-insert/update in app code (no DB unique constraint needed). */
export async function persistCampaignResults(
  rows: ParsedCampaignResult[],
  client: SupabaseClient,
): Promise<PersistResultsSummary> {
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    let query = client
      .from("campaign_results")
      .select("id")
      .eq("campaign_id", row.campaign_id)
      .eq("period_start", row.period_start)
      .eq("period_end", row.period_end);
    query = row.campaign_asset_id ? query.eq("campaign_asset_id", row.campaign_asset_id) : query.is("campaign_asset_id", null);
    query = row.channel ? query.eq("channel", row.channel) : query.is("channel", null);

    const { data: existing, error: lookupError } = await query.maybeSingle<{ id: string }>();
    if (lookupError) throw new Error(`campaign_results lookup: ${lookupError.message}`);

    if (existing) {
      const { error: updateError } = await client.from("campaign_results").update(row).eq("id", existing.id);
      if (updateError) throw new Error(`campaign_results update: ${updateError.message}`);
      updated += 1;
    } else {
      const { error: insertError } = await client.from("campaign_results").insert(row);
      if (insertError) throw new Error(`campaign_results insert: ${insertError.message}`);
      inserted += 1;
    }
  }

  return { inserted, updated };
}
```

- [ ] **Step 4: Run test + build**

Run: `pnpm test src/lib/gallery/results-persistence.test.ts` → PASS. Then `pnpm build` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gallery/results-persistence.ts src/lib/gallery/results-persistence.test.ts
git commit -m "feat(gallery): upsert persistence for campaign results"
```

---

## Task 6: Ingest API route

**Files:**
- Create: `src/app/api/v1/campaigns/results/route.ts`

- [ ] **Step 1: Implement the route** (mirrors `src/app/api/v1/leads/ingest/route.ts` codes: 400 / 202 / 201 / 502; bearer via `checkBearerToken`)

```ts
import { NextResponse } from "next/server";

import { CampaignResultsValidationError, parseCampaignResultsPayload } from "@/domain";
import { checkBearerToken } from "@/lib/auth/api-token";
import { persistCampaignResults } from "@/lib/gallery/results-persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const auth = checkBearerToken(request, "CAMPAIGN_RESULTS_API_TOKEN", { required: false });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, status: "unauthorized", errors: [{ code: "unauthorized", message: "Campaign results ingest requires a valid bearer token." }] },
      { status: auth.status },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "rejected", errors: [{ code: "invalid_json", message: "Request body must be valid JSON." }] }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseCampaignResultsPayload(payload);
  } catch (error) {
    if (error instanceof CampaignResultsValidationError) {
      return NextResponse.json({ ok: false, status: "rejected", errors: [{ code: "validation_error", message: error.message }] }, { status: 400 });
    }
    throw error;
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: true, status: "accepted", received: parsed.length, persistence: { status: "not_configured", message: "Supabase persistence is not connected." } },
      { status: 202 },
    );
  }

  try {
    const summary = await persistCampaignResults(parsed, getSupabaseAdminClient());
    return NextResponse.json({ ok: true, status: "persisted", received: parsed.length, persistence: { status: "persisted", ...summary } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to persist campaign results.";
    return NextResponse.json({ ok: false, status: "failed", persistence: { status: "failed", message } }, { status: 502 });
  }
}
```

- [ ] **Step 2: Verify build + lint**

Run: `pnpm lint && pnpm build`
Expected: clean; route compiles at `/api/v1/campaigns/results`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/campaigns/results/route.ts
git commit -m "feat(gallery): POST /api/v1/campaigns/results ingest endpoint"
```

---

## Task 7: Seed script + docs

**Files:**
- Create: `scripts/seed-campaign-results.mjs`
- Modify: `package.json` (scripts), `.env.example`

- [ ] **Step 1: Create `scripts/seed-campaign-results.mjs`** (mirrors the env bootstrap in `scripts/seed-test-campaign.mjs`)

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const envText = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    process.env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
}

function getSupabase() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Demo metrics per channel — realistic-ish numbers for a single 30-day period.
const CHANNELS = [
  { channel: "meta_ad", impressions: 42000, clicks: 940, calls: 12, forms: 28, leads: 22, jobs: 4, won_revenue_cents: 4200000, spend_cents: 850000 },
  { channel: "google_ads", impressions: 31000, clicks: 1280, calls: 31, forms: 41, leads: 37, jobs: 7, won_revenue_cents: 7100000, spend_cents: 1200000 },
  { channel: "email", impressions: 8600, clicks: 510, calls: 6, forms: 19, leads: 14, jobs: 3, won_revenue_cents: 2600000, spend_cents: 0 },
];

async function main() {
  const supabase = getSupabase();
  // Seed results for currently-live campaigns (launch_locked = false).
  const { data: campaigns, error } = await supabase.from("campaigns").select("id,name").eq("launch_locked", false).limit(20);
  if (error) throw new Error(`campaigns lookup failed: ${error.message}`);
  if (!campaigns || campaigns.length === 0) {
    console.log("No live campaigns (launch_locked = false). Launch one first, then re-run.");
    return;
  }

  let inserted = 0;
  for (const campaign of campaigns) {
    for (const c of CHANNELS) {
      const { error: insertError } = await supabase.from("campaign_results").insert({
        campaign_id: campaign.id,
        channel: c.channel,
        period_start: "2026-05-01",
        period_end: "2026-05-31",
        impressions: c.impressions,
        clicks: c.clicks,
        calls: c.calls,
        forms: c.forms,
        leads: c.leads,
        jobs: c.jobs,
        won_revenue_cents: c.won_revenue_cents,
        spend_cents: c.spend_cents,
        metadata: { source: "seed-campaign-results" },
      });
      if (insertError) throw new Error(`campaign_results insert failed: ${insertError.message}`);
      inserted += 1;
    }
    console.log(`Seeded results for "${campaign.name}" (${campaign.id})`);
  }
  console.log(`Done — inserted ${inserted} campaign_results rows across ${campaigns.length} live campaign(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the package.json script**

In `package.json` `scripts`, after `"seed:media-campaign"`, add:

```json
    "seed:campaign-results": "node scripts/seed-campaign-results.mjs",
```

- [ ] **Step 3: Document the env var in `.env.example`**

Add a line near the other API token vars:

```
# Bearer token for POST /api/v1/campaigns/results (campaign analytics ingest). Optional; when unset the endpoint stays open in dev.
CAMPAIGN_RESULTS_API_TOKEN=
```

> Read `.env.example` first and match its comment style/section placement (group with `ARC_AGENT_API_TOKEN` / `LEADS_INGEST_API_TOKEN`).

- [ ] **Step 4: Verify**

Run: `node --check scripts/seed-campaign-results.mjs` (syntax check). Confirm `package.json` is valid JSON: `node -e "require('./package.json')"`.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-campaign-results.mjs package.json .env.example
git commit -m "feat(gallery): seed script + token doc for campaign results"
```

---

## Task 8: Full verification

- [ ] **Step 1: Whole suite** — Run: `pnpm test` → all green (existing + new gallery/domain tests).
- [ ] **Step 2: Lint + build** — Run: `pnpm lint && pnpm build` → clean.
- [ ] **Step 3: Manual smoke (if Supabase + a live campaign exist)** — `pnpm seed:campaign-results`, then `pnpm dev`: `/gallery` shows the live campaign cards; the aggregate strip shows impressions/clicks/CTR/leads/jobs/revenue/ROI; before seeding it shows "Awaiting results data" but real Sent/Delivered counts. `POST /api/v1/campaigns/results` with a valid body returns 201 (or 202 without Supabase, 400 on bad input).
- [ ] **Step 4: Final commit (if any fixups)** — `git add -A && git commit -m "chore(gallery): verification fixups"`.

---

## Self-Review notes (already reconciled)

- **Spec coverage:** gallery page+nav ✓ (T3); Live filter reuse ✓ (T2 reuses `getCampaignWorkspaceList`); dispatch funnel + reach ✓ (T1/T2); `campaign_results` read + derived rates ✓ (T1/T2); aggregate top-line ✓ (T1 `aggregateTotals`, T3 strip); ingest domain ✓ (T4); persistence upsert ✓ (T5); route w/ 400/202/201/502 ✓ (T6); seed + token doc ✓ (T7). Out-of-scope items (ads table, OAuth, AI insights, per-asset drill-down, unique-constraint migration) intentionally absent.
- **Type consistency:** `DispatchFunnel`/`CampaignMetrics`/`GalleryCampaign`/`GalleryTotals`/`CampaignResultMetricRow` defined in `aggregate.ts` (T1), consumed by `read-model.ts` (T2) and the page components (T3). `ParsedCampaignResult` defined in `src/domain/campaign-results.ts` (T4), consumed by persistence (T5) and route (T6). `getGalleryData` return union matches the page's `data.status` checks.
- **Verify-first points (flagged inline):** gallery nav icon placeholder (T3), `getCampaignWorkspaceList` client arg + item fields (T2), `src/domain/index.ts` re-export style (T4), `.env.example` section (T7).
