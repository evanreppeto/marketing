# Per-Campaign Money & Traffic Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface real per-campaign money (linked revenue/margin/pipeline) and traffic (internal engagement events) on `/analytics/[campaignId]`, with honest empty states where data doesn't exist.

**Architecture:** Pure tested aggregator in `src/domain/campaign-performance.ts`; I/O read-model `getCampaignPerformance(campaignId)` in `src/lib/performance/campaign-performance.ts` that matches a campaign's `lead_id`/`company_id` to outcomes/jobs and `campaign_id` to engagement_events; two new sections in the existing detail component. No migrations, no external integrations, no fabricated numbers.

**Tech Stack:** Next.js 16 (App Router server components), React 19, TypeScript, Supabase JS v2, Vitest, Tailwind v4 tokens. pnpm. Path alias `@/*` → `./src/*`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/domain/campaign-performance.ts` | Create | Pure aggregation: `summarizeCampaignMoney`, `summarizeCampaignTraffic`. No I/O, no formatting. |
| `src/domain/__tests__/campaign-performance.test.ts` | Create | Vitest unit tests for the aggregators. |
| `src/domain/index.ts` | Modify | Re-export the new module through the `@/domain` barrel. |
| `src/lib/performance/campaign-performance.ts` | Create | `getCampaignPerformance(campaignId)` — loads campaign ids, fetches matched outcomes/jobs/events, calls the aggregators. |
| `src/app/analytics/[campaignId]/page.tsx` | Modify | Load `getCampaignPerformance` in parallel with the detail; pass it through. |
| `src/app/analytics/_components/campaign-analytics-detail.tsx` | Modify | Add `performance` prop; render Money + Traffic panels after the MetricStrip. |

---

## Task 1: Domain aggregators (pure logic + tests)

**Files:**
- Create: `src/domain/campaign-performance.ts`
- Test: `src/domain/__tests__/campaign-performance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/campaign-performance.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { summarizeCampaignMoney, summarizeCampaignTraffic } from "../campaign-performance";

describe("summarizeCampaignMoney", () => {
  it("sums revenue/margin, counts won outcomes, and sums job pipeline", () => {
    const outcomes = [
      { lead_id: "l1", company_id: null, status: "won", gross_revenue_cents: 10000, gross_margin_cents: 4000 },
      { lead_id: "l1", company_id: null, status: "paid", gross_revenue_cents: 5000, gross_margin_cents: 2000 },
      { lead_id: "l1", company_id: null, status: "lost", gross_revenue_cents: null, gross_margin_cents: null },
    ];
    const jobs = [
      { lead_id: "l1", status: "scheduled", estimated_revenue_cents: 8000 },
      { lead_id: "l1", status: "active", estimated_revenue_cents: null },
    ];
    expect(summarizeCampaignMoney(outcomes, jobs)).toEqual({
      realizedRevenueCents: 15000,
      marginCents: 6000,
      wonCount: 2,
      outcomeCount: 3,
      estimatedPipelineCents: 8000,
      jobCount: 2,
      hasData: true,
    });
  });

  it("reports hasData false when there are no outcomes or jobs", () => {
    expect(summarizeCampaignMoney([], [])).toEqual({
      realizedRevenueCents: 0,
      marginCents: 0,
      wonCount: 0,
      outcomeCount: 0,
      estimatedPipelineCents: 0,
      jobCount: 0,
      hasData: false,
    });
  });
});

describe("summarizeCampaignTraffic", () => {
  it("counts events and groups by type and channel, descending", () => {
    const events = [
      { event_type: "click", channel: "Email" },
      { event_type: "form_submit", channel: "Email" },
      { event_type: "click", channel: "Meta" },
      { event_type: "", channel: null },
    ];
    expect(summarizeCampaignTraffic(events)).toEqual({
      totalEvents: 4,
      byType: [
        { label: "click", count: 2 },
        { label: "form_submit", count: 1 },
        { label: "Other", count: 1 },
      ],
      byChannel: [
        { label: "Email", count: 2 },
        { label: "Meta", count: 1 },
        { label: "Unassigned", count: 1 },
      ],
      hasData: true,
    });
  });

  it("reports hasData false for no events", () => {
    expect(summarizeCampaignTraffic([])).toEqual({
      totalEvents: 0,
      byType: [],
      byChannel: [],
      hasData: false,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/domain/__tests__/campaign-performance.test.ts`
Expected: FAIL — cannot find module `../campaign-performance`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/campaign-performance.ts`:

```ts
type OutcomeRow = {
  lead_id: string | null;
  company_id: string | null;
  status: string | null;
  gross_revenue_cents: number | null;
  gross_margin_cents: number | null;
};

type JobRow = {
  lead_id: string | null;
  status: string | null;
  estimated_revenue_cents: number | null;
};

type EventRow = {
  event_type: string | null;
  channel: string | null;
};

/** Won set mirrors the existing performance read-model. */
const WON_STATUSES = ["won", "closed_won", "paid"];

export type CampaignMoney = {
  realizedRevenueCents: number;
  marginCents: number;
  wonCount: number;
  outcomeCount: number;
  estimatedPipelineCents: number;
  jobCount: number;
  hasData: boolean;
};

export type CampaignTraffic = {
  totalEvents: number;
  byType: Array<{ label: string; count: number }>;
  byChannel: Array<{ label: string; count: number }>;
  hasData: boolean;
};

/** Money attributed to a campaign via its already-matched outcomes + jobs.
 *  Returns raw cents/counts; presentation formats currency. */
export function summarizeCampaignMoney(outcomes: OutcomeRow[], jobs: JobRow[]): CampaignMoney {
  const realizedRevenueCents = outcomes.reduce((sum, o) => sum + (o.gross_revenue_cents ?? 0), 0);
  const marginCents = outcomes.reduce((sum, o) => sum + (o.gross_margin_cents ?? 0), 0);
  const wonCount = outcomes.filter((o) => WON_STATUSES.includes(o.status ?? "")).length;
  const estimatedPipelineCents = jobs.reduce((sum, j) => sum + (j.estimated_revenue_cents ?? 0), 0);
  return {
    realizedRevenueCents,
    marginCents,
    wonCount,
    outcomeCount: outcomes.length,
    estimatedPipelineCents,
    jobCount: jobs.length,
    hasData: outcomes.length > 0 || jobs.length > 0,
  };
}

function groupCounts(labels: string[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/** Internal engagement events (already filtered to one campaign) grouped by type/channel. */
export function summarizeCampaignTraffic(events: EventRow[]): CampaignTraffic {
  const byType = groupCounts(events.map((e) => (e.event_type?.trim() ? e.event_type.trim() : "Other")));
  const byChannel = groupCounts(events.map((e) => (e.channel?.trim() ? e.channel.trim() : "Unassigned")));
  return {
    totalEvents: events.length,
    byType,
    byChannel,
    hasData: events.length > 0,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/domain/__tests__/campaign-performance.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint src/domain/campaign-performance.ts src/domain/__tests__/campaign-performance.test.ts`
Expected: clean. (Do NOT run `pnpm lint` — it scans vendored files.)

- [ ] **Step 6: Commit**

```bash
git add src/domain/campaign-performance.ts src/domain/__tests__/campaign-performance.test.ts
git commit -m "feat: add pure campaign money/traffic aggregators with tests"
```

---

## Task 2: Re-export through the domain barrel

**Files:**
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Add the re-export**

In `src/domain/index.ts`, add this line at the end (after the existing `export * from "./knowledge-graph";`):

```ts
export * from "./campaign-performance";
```

- [ ] **Step 2: Verify no export collision / type errors**

Run: `pnpm exec tsc --noEmit`
Expected: no NEW errors mentioning `campaign-performance` or `domain/index`. (Pre-existing unrelated errors elsewhere are acceptable; the verified clean baseline for this work is "no errors mentioning these files".)

- [ ] **Step 3: Commit**

```bash
git add src/domain/index.ts
git commit -m "feat: export campaign-performance from domain barrel"
```

---

## Task 3: `getCampaignPerformance` read-model (I/O)

**Files:**
- Create: `src/lib/performance/campaign-performance.ts`

Context: mirrors the guard/try-catch pattern of `getPerformanceReadModel` in `src/lib/performance/read-model.ts` — `isSupabaseAdminConfigured()` gate, `getSupabaseAdminClient()`, per-table error → throw, catch → `unavailable`. The `engagement_events` table is OPTIONAL (the existing read-model already tolerates its absence). Supabase JS v2 supports `.maybeSingle()` and `.or("col.eq.val,col2.eq.val2")`.

- [ ] **Step 1: Create the read-model**

Create `src/lib/performance/campaign-performance.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { summarizeCampaignMoney, summarizeCampaignTraffic, type CampaignMoney, type CampaignTraffic } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

type OutcomeRow = {
  lead_id: string | null;
  company_id: string | null;
  status: string | null;
  gross_revenue_cents: number | null;
  gross_margin_cents: number | null;
};

type JobRow = {
  lead_id: string | null;
  status: string | null;
  estimated_revenue_cents: number | null;
};

type EventRow = {
  event_type: string | null;
  channel: string | null;
};

export type CampaignPerformance =
  | { status: "live"; money: CampaignMoney; traffic: CampaignTraffic; trafficTracked: boolean }
  | { status: "unavailable"; message: string };

/** Per-campaign money + traffic. Money attributes via the campaign's lead_id/company_id
 *  to outcomes (revenue/margin) and jobs (estimated pipeline); traffic counts the
 *  campaign's engagement_events. Honest empties where joins/tables are missing. */
export async function getCampaignPerformance(campaignId: string, client?: SupabaseClient): Promise<CampaignPerformance> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();

    const campaignResult = await supabase
      .from("campaigns")
      .select("id,lead_id,company_id")
      .eq("id", campaignId)
      .maybeSingle();
    if (campaignResult.error) throw new Error(`campaigns: ${campaignResult.error.message}`);
    const campaign = campaignResult.data as { id: string; lead_id: string | null; company_id: string | null } | null;
    if (!campaign) {
      return { status: "unavailable", message: "Campaign not found." };
    }

    const { lead_id: leadId, company_id: companyId } = campaign;

    const outcomesPromise = (async (): Promise<OutcomeRow[]> => {
      if (!leadId && !companyId) return [];
      let query = supabase
        .from("outcomes")
        .select("lead_id,company_id,status,gross_revenue_cents,gross_margin_cents")
        .limit(1000);
      if (leadId && companyId) {
        query = query.or(`lead_id.eq.${leadId},company_id.eq.${companyId}`);
      } else if (leadId) {
        query = query.eq("lead_id", leadId);
      } else if (companyId) {
        query = query.eq("company_id", companyId);
      }
      const res = await query;
      if (res.error) throw new Error(`outcomes: ${res.error.message}`);
      return (res.data ?? []) as OutcomeRow[];
    })();

    const jobsPromise = (async (): Promise<JobRow[]> => {
      if (!leadId) return [];
      const res = await supabase
        .from("jobs")
        .select("lead_id,status,estimated_revenue_cents")
        .eq("lead_id", leadId)
        .limit(1000);
      if (res.error) throw new Error(`jobs: ${res.error.message}`);
      return (res.data ?? []) as JobRow[];
    })();

    // Optional table: a query error here means engagement_events isn't available,
    // which is a known/tolerated state — NOT a hard failure.
    const eventsResult = await supabase
      .from("engagement_events")
      .select("event_type,channel")
      .eq("campaign_id", campaignId)
      .limit(1000);
    const trafficTracked = !eventsResult.error;
    const eventRows = trafficTracked ? ((eventsResult.data ?? []) as EventRow[]) : [];

    const [outcomeRows, jobRows] = await Promise.all([outcomesPromise, jobsPromise]);

    return {
      status: "live",
      money: summarizeCampaignMoney(outcomeRows, jobRows),
      traffic: summarizeCampaignTraffic(eventRows),
      trafficTracked,
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Campaign performance is unavailable." };
  }
}
```

- [ ] **Step 2: Verify type-check and lint**

Run: `pnpm exec tsc --noEmit`
Expected: no errors mentioning `campaign-performance.ts`. (If `.maybeSingle`/`.or` produce a typing error, confirm the Supabase client version supports them by checking another repo file that uses `.eq(...)` chaining, e.g. `src/lib/performance/read-model.ts`; these are standard v2 methods.)

Run: `pnpm exec eslint src/lib/performance/campaign-performance.ts`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/performance/campaign-performance.ts
git commit -m "feat: add getCampaignPerformance read-model"
```

---

## Task 4: Wire the route to load performance

**Files:**
- Modify: `src/app/analytics/[campaignId]/page.tsx`

Context: current route loads only `getCampaignWorkspaceDetail`. Add a parallel `getCampaignPerformance` load and pass it to the detail component. The not-found/unavailable branch (when the detail isn't live) stays unchanged and does not use performance.

- [ ] **Step 1: Add the import**

In `src/app/analytics/[campaignId]/page.tsx`, add this import alongside the others:

```tsx
import { getCampaignPerformance } from "@/lib/performance/campaign-performance";
```

- [ ] **Step 2: Load performance in parallel and pass it through**

Find this block:

```tsx
  const { campaignId } = await params;
  const { assistantName } = await getAppSettings();
  const agentName = getAgentDisplayName(assistantName);
  const detail = await getCampaignWorkspaceDetail(campaignId, undefined, agentName);
```

Replace it with:

```tsx
  const { campaignId } = await params;
  const { assistantName } = await getAppSettings();
  const agentName = getAgentDisplayName(assistantName);
  const [detail, performance] = await Promise.all([
    getCampaignWorkspaceDetail(campaignId, undefined, agentName),
    getCampaignPerformance(campaignId),
  ]);
```

Then find the final return:

```tsx
  return <CampaignAnalyticsDetail detail={detail} />;
```

and replace it with:

```tsx
  return <CampaignAnalyticsDetail detail={detail} performance={performance} />;
```

(Leave the `if (detail.status !== "live") { ... }` not-found branch exactly as-is.)

- [ ] **Step 3: Verify type-check**

Run: `pnpm exec tsc --noEmit`
Expected: ONE expected error remains until Task 5 — that `CampaignAnalyticsDetail` doesn't yet accept a `performance` prop. That's fine; Task 5 adds it. Confirm there are no OTHER new errors in this file (e.g., a bad import path or wrong call signature). If you want a clean checkpoint, you may do Task 4 and Task 5 back-to-back before committing, but commit them separately as written.

- [ ] **Step 4: Commit**

```bash
git add "src/app/analytics/[campaignId]/page.tsx"
git commit -m "feat: load per-campaign performance in analytics route"
```

---

## Task 5: Render Money & Traffic panels in the detail component

**Files:**
- Modify: `src/app/analytics/_components/campaign-analytics-detail.tsx`

Context: the component currently takes `{ detail }`. Add a `performance: CampaignPerformance` prop and render two `WorkspacePanel` sections immediately after the existing `MetricStrip` (before the "Package composition" panel). Add three small local helpers and a currency formatter.

- [ ] **Step 1: Add the import**

At the top of `src/app/analytics/_components/campaign-analytics-detail.tsx`, add (with the other `@/lib` imports):

```tsx
import { type CampaignPerformance } from "@/lib/performance/campaign-performance";
```

- [ ] **Step 2: Update the component signature**

Change:

```tsx
export function CampaignAnalyticsDetail({ detail }: { detail: LiveCampaignWorkspace }) {
```

to:

```tsx
export function CampaignAnalyticsDetail({ detail, performance }: { detail: LiveCampaignWorkspace; performance: CampaignPerformance }) {
```

- [ ] **Step 3: Insert the Money + Traffic panels after the MetricStrip**

Find the closing `/>` of the `<MetricStrip ... />` block (it ends with `]}\n      />`). Immediately AFTER that `/>` and BEFORE the `<WorkspacePanel eyebrow="Package composition"` block, insert:

```tsx
      <WorkspacePanel
        eyebrow="Money"
        title="Linked revenue"
        description="Revenue and margin from outcomes linked to this campaign's lead and company, plus estimated pipeline from its jobs. Attribution is approximate — it follows the campaign's linked lead, not a full multi-touch model."
      >
        {performance.status === "live" && performance.money.hasData ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Realized revenue" value={formatUsd(performance.money.realizedRevenueCents)} />
            <StatCard label="Margin" value={formatUsd(performance.money.marginCents)} />
            <StatCard label="Won outcomes" value={`${performance.money.wonCount} of ${performance.money.outcomeCount}`} />
            <StatCard label="Estimated pipeline" value={formatUsd(performance.money.estimatedPipelineCents)} />
          </div>
        ) : (
          <EmptyState
            title="No revenue linked yet"
            detail="Once this campaign's lead or company has booked jobs or won outcomes, the linked revenue and margin show here."
          />
        )}
      </WorkspacePanel>

      <WorkspacePanel
        eyebrow="Traffic"
        title="Engagement events"
        description="First-party clicks, form submits, and photo uploads attributed to this campaign — not ad impressions or page views."
      >
        {performance.status === "live" && performance.trafficTracked && performance.traffic.hasData ? (
          <div className="grid gap-5 p-4 xl:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Total events</div>
              <div className="mt-2 font-display text-3xl font-bold tabular-nums tracking-[-0.04em] text-[var(--text-primary)]">
                {performance.traffic.totalEvents}
              </div>
              <div className="mt-4">
                <TrafficList title="By type" rows={performance.traffic.byType} />
              </div>
            </div>
            <TrafficList title="By channel" rows={performance.traffic.byChannel} />
          </div>
        ) : (
          <EmptyState
            title={performance.status === "live" && !performance.trafficTracked ? "Engagement isn't tracked yet" : "No engagement events for this campaign yet"}
            detail={
              performance.status === "live" && !performance.trafficTracked
                ? "The engagement events source isn't available, so clicks, form submits, and photo uploads can't be counted yet."
                : "When someone clicks, submits a form, or uploads photos tied to this campaign, those events appear here."
            }
          />
        )}
      </WorkspacePanel>
```

- [ ] **Step 4: Add the local helpers**

At the BOTTOM of the file (module scope, after the `CampaignAnalyticsDetail` function's closing brace), add:

```tsx
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 font-display text-2xl font-bold tabular-nums tracking-[-0.04em] text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function TrafficList({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{title}</div>
      <div className="mt-2 divide-y divide-[var(--border-hairline)] overflow-hidden rounded-xl border border-[var(--border-hairline)]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="font-semibold text-[var(--text-primary)]">{row.label}</span>
            <span className="font-mono text-sm font-bold text-[var(--accent)]">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Local USD formatter (mirrors formatMoney in the performance read-model; kept
 *  local so that module needn't export it). */
function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
```

- [ ] **Step 5: Verify type-check and lint**

Run: `pnpm exec tsc --noEmit`
Expected: clean — no errors (the Task 4 prop-mismatch error is now resolved). Confirm no errors mention `campaign-analytics-detail.tsx` or the route file.

Run: `pnpm exec eslint src/app/analytics/_components/campaign-analytics-detail.tsx`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/analytics/_components/campaign-analytics-detail.tsx
git commit -m "feat: render money and traffic panels on campaign analytics detail"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS, including the new `campaign-performance.test.ts` (4 tests).

- [ ] **Step 2: Type-check the whole project**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: build succeeds; `/analytics/[campaignId]` compiles.

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev` (or use an already-running dev server), then load `/analytics/<a campaign id>`:
- The Money and Traffic panels appear directly under the metric strip.
- With no Supabase configured (local), both panels show their empty states ("No revenue linked yet" / "Engagement isn't tracked yet") — NOT an error or crash.
- The existing readiness/composition/channel/"needs data" sections are unchanged.

- [ ] **Step 5: Final commit (only if Step 4 required a fix)**

```bash
git add -A
git commit -m "chore: money/traffic analytics verification cleanup"
```

(Skip if nothing changed.)

---

## Notes for the implementer

- **Approval-safe & honest:** read-only over existing tables; show real values where the join produces them and explicit empty states otherwise. Never fabricate numbers.
- **`pnpm lint` scans vendored files** (~31k pre-existing problems) — only `pnpm exec eslint <paths>` on files you touched.
- **`pnpm lint` does not type-check** — use `pnpm exec tsc --noEmit` (or `pnpm build`).
- **Domain stays pure:** no Supabase, no `Intl`/formatting in `campaign-performance.ts`. Currency formatting lives in the presentation component (`formatUsd`).
- The domain row types and the lib row types are intentionally identical in shape; TypeScript structural typing lets the lib pass its rows straight into the domain aggregators.
