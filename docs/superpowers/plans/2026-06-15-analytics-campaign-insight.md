# Analytics Campaign-Insight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/analytics` the single home for campaign insight — click a campaign to see its analytics at `/analytics/[campaignId]` (never the campaign workspace), and fold `/reports` in.

**Architecture:** Read-only server components over existing read-models (`getCampaignWorkspaceList`, `getCampaignWorkspaceDetail`, `getPerformanceReadModel`). A new per-campaign detail route renders real signals (approval funnel, package composition, channel breakdown) plus honest "needs data" placeholders. The top-level page gains a `TabNav`; `/reports` redirects to `/analytics`. No DB migrations, no outbound behavior.

**Tech Stack:** Next.js 16 (App Router, `connection()`, `redirect` from `next/navigation`), React 19, TypeScript, Vitest, Tailwind v4 tokens. Package manager: pnpm. Path alias `@/*` → `./src/*`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/performance/measurement-copy.ts` | Create | Shared `MEASUREMENT_PLAN` + `LOCKED_CLAIMS` copy (extracted from `performance-tab.tsx`) so both the campaign tab and the new analytics detail reuse one source. |
| `src/app/campaigns/_components/performance-tab.tsx` | Modify | Import the copy from the shared module instead of declaring it locally. |
| `src/app/analytics/_components/campaign-analytics-model.ts` | Create | Pure derivations: funnel, channel breakdown, composition. Unit-tested. |
| `src/app/analytics/_components/__tests__/campaign-analytics-model.test.ts` | Create | Vitest tests for the model. |
| `src/app/analytics/_components/campaign-analytics-detail.tsx` | Create | Presentation for the per-campaign analytics page. |
| `src/app/analytics/_components/performance-breakdowns.tsx` | Create | The breakdown render components moved out of `reports/page.tsx` (leads/conversion/revenue/partners/contract + shared row/card helpers). |
| `src/app/analytics/[campaignId]/page.tsx` | Create | Server route: load detail, render detail component, handle not-found/unavailable. |
| `src/app/analytics/page.tsx` | Modify | Add `TabNav`; Campaigns tab = comparison list with rows → `/analytics/[id]`; other tabs = folded breakdowns; remove `/reports` footnote. |
| `src/app/reports/page.tsx` | Modify | Replace body with `redirect("/analytics")`. |

---

## Task 1: Extract measurement copy to a shared module

**Files:**
- Create: `src/lib/performance/measurement-copy.ts`
- Modify: `src/app/campaigns/_components/performance-tab.tsx:106-138` (the `MEASUREMENT_PLAN` and `LOCKED_CLAIMS` declarations)

- [ ] **Step 1: Create the shared copy module**

Create `src/lib/performance/measurement-copy.ts` with exactly the arrays currently in `performance-tab.tsx`:

```ts
/** Plain-language measurement checkpoints surfaced once a campaign goes live.
 *  Shared by the campaign Performance tab and the analytics campaign detail so
 *  the "what we'll measure / what's locked" copy stays in one place. */
export const MEASUREMENT_PLAN = [
  {
    area: "Reach",
    currentSignal: "Needs delivery data",
    question: "Did the target audience actually see this campaign?",
    nextStep: "Connect approved sending, publishing, or ad-platform results before reporting impressions, sends, clicks, or engagement.",
  },
  {
    area: "Response",
    currentSignal: "Needs lead events",
    question: "Did anyone call, submit a form, upload photos, or ask for help?",
    nextStep: "Track internal CTA, form, phone, and photo-upload events with the campaign id attached to each response.",
  },
  {
    area: "Quality",
    currentSignal: "Needs outcome data",
    question: "Were the responses from the right property, partner, or restoration scenario?",
    nextStep: "Join responses to lead, company, contact, job, and partner handoff records before ranking campaign quality.",
  },
  {
    area: "ROI",
    currentSignal: "Needs booked work",
    question: "Did the campaign lead to booked jobs or measurable revenue?",
    nextStep: "Only report ROI after approved campaigns are linked to outcomes, booked jobs, revenue, and attribution confidence.",
  },
] as const;

export const LOCKED_CLAIMS = [
  { title: "Ad performance", detail: "No live platform delivery data is attached yet, so clicks, impressions, CTR, and spend are not available." },
  { title: "Lead volume", detail: "No response events are linked yet, so the package cannot claim calls, forms, photo uploads, or conversions." },
  { title: "Revenue impact", detail: "No booked job or outcome attribution is linked yet, so ROI and revenue claims remain unavailable." },
  { title: "Optimization", detail: "No automatic sending, spending, publishing, or audience changes can run from this package without approval." },
] as const;

export type MeasurementPlanItem = (typeof MEASUREMENT_PLAN)[number];
export type LockedClaim = (typeof LOCKED_CLAIMS)[number];
```

- [ ] **Step 2: Re-point `performance-tab.tsx` to the shared module**

In `src/app/campaigns/_components/performance-tab.tsx`, delete the local `const MEASUREMENT_PLAN = [...]` and `const LOCKED_CLAIMS = [...]` blocks (lines ~106-138) and add this import near the top with the other imports:

```ts
import { MEASUREMENT_PLAN, LOCKED_CLAIMS } from "@/lib/performance/measurement-copy";
```

- [ ] **Step 3: Verify nothing else broke**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors referencing `performance-tab.tsx` or `measurement-copy.ts`.

Run: `pnpm exec eslint src/app/campaigns/_components/performance-tab.tsx src/lib/performance/measurement-copy.ts`
Expected: clean (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/performance/measurement-copy.ts src/app/campaigns/_components/performance-tab.tsx
git commit -m "refactor: extract measurement copy to shared module"
```

---

## Task 2: Per-campaign analytics model (pure logic + tests)

**Files:**
- Create: `src/app/analytics/_components/campaign-analytics-model.ts`
- Test: `src/app/analytics/_components/__tests__/campaign-analytics-model.test.ts`

Context: `CampaignRollup` is `{ approved: number; pending: number; changes: number; total: number }` (from `@/domain`, used in `src/app/analytics/page.tsx`). `CampaignWorkspaceAsset` has a `channel: string` field. `CampaignWorkspaceMetrics` is `{ assets: number; approvals: number; media: number; sources: number }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/analytics/_components/__tests__/campaign-analytics-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildFunnel, buildChannelBreakdown, buildComposition } from "../campaign-analytics-model";

describe("buildFunnel", () => {
  it("computes readiness as approved/total percent", () => {
    expect(buildFunnel({ approved: 3, pending: 1, changes: 0, total: 4 })).toEqual({
      approved: 3,
      pending: 1,
      changes: 0,
      total: 4,
      readiness: 75,
    });
  });

  it("returns 0 readiness when there are no pieces", () => {
    expect(buildFunnel({ approved: 0, pending: 0, changes: 0, total: 0 }).readiness).toBe(0);
  });
});

describe("buildChannelBreakdown", () => {
  it("groups assets by channel and sorts by count descending", () => {
    const assets = [
      { channel: "Email" },
      { channel: "Meta" },
      { channel: "Email" },
      { channel: "" },
    ];
    expect(buildChannelBreakdown(assets)).toEqual([
      { channel: "Email", count: 2 },
      { channel: "Meta", count: 1 },
      { channel: "Unassigned", count: 1 },
    ]);
  });

  it("returns an empty array when there are no assets", () => {
    expect(buildChannelBreakdown([])).toEqual([]);
  });
});

describe("buildComposition", () => {
  it("maps metric counts into labeled composition rows", () => {
    const rows = buildComposition({ assets: 5, approvals: 2, media: 3, sources: 4 });
    expect(rows).toEqual([
      { label: "Deliverables", value: 5 },
      { label: "Approval items", value: 2 },
      { label: "Media signals", value: 3 },
      { label: "Source records", value: 4 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/analytics/_components/__tests__/campaign-analytics-model.test.ts`
Expected: FAIL — cannot find module `../campaign-analytics-model`.

- [ ] **Step 3: Write the model**

Create `src/app/analytics/_components/campaign-analytics-model.ts`:

```ts
import type { CampaignRollup } from "@/domain";

export type AnalyticsFunnel = CampaignRollup & { readiness: number };
export type ChannelCount = { channel: string; count: number };
export type CompositionRow = { label: string; value: number };

/** Approval funnel for one campaign: raw counts plus approved/total readiness. */
export function buildFunnel(rollup: CampaignRollup): AnalyticsFunnel {
  const readiness = rollup.total > 0 ? Math.round((rollup.approved / rollup.total) * 100) : 0;
  return { ...rollup, readiness };
}

/** Deliverables grouped by channel, most-used first. Blank channels read as "Unassigned". */
export function buildChannelBreakdown(assets: Array<{ channel: string }>): ChannelCount[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const channel = asset.channel.trim() || "Unassigned";
    counts.set(channel, (counts.get(channel) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);
}

/** Real structural counts that exist today, as labeled rows. */
export function buildComposition(metrics: { assets: number; approvals: number; media: number; sources: number }): CompositionRow[] {
  return [
    { label: "Deliverables", value: metrics.assets },
    { label: "Approval items", value: metrics.approvals },
    { label: "Media signals", value: metrics.media },
    { label: "Source records", value: metrics.sources },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/analytics/_components/__tests__/campaign-analytics-model.test.ts`
Expected: PASS (3 suites, all green).

- [ ] **Step 5: Commit**

```bash
git add src/app/analytics/_components/campaign-analytics-model.ts src/app/analytics/_components/__tests__/campaign-analytics-model.test.ts
git commit -m "feat: add per-campaign analytics model with tests"
```

---

## Task 3: CampaignAnalyticsDetail presentation component

**Files:**
- Create: `src/app/analytics/_components/campaign-analytics-detail.tsx`

Context: consumes a `LiveCampaignWorkspace` (`import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model"`). Uses `MetricStrip`, `WorkspacePanel` from `@/app/_components/workspace`, `StatusPill`, `EmptyState` from `@/app/_components/page-header`, the model from Task 2, and the shared copy from Task 1. `detail.campaign` has `name`, `persona`, `updatedAt`, `rollup`; `detail.launchState.lifecycle` is the lifecycle label; `detail.assets` each have `channel`; `detail.metrics` is `{ assets, approvals, media, sources }`.

- [ ] **Step 1: Create the component**

Create `src/app/analytics/_components/campaign-analytics-detail.tsx`:

```tsx
import Link from "next/link";

import { EmptyState, PageHeader, StatusPill } from "@/app/_components/page-header";
import { MetricStrip, WorkspacePanel } from "@/app/_components/workspace";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import { LOCKED_CLAIMS, MEASUREMENT_PLAN } from "@/lib/performance/measurement-copy";

import { buildChannelBreakdown, buildComposition, buildFunnel } from "./campaign-analytics-model";

export function CampaignAnalyticsDetail({ detail }: { detail: LiveCampaignWorkspace }) {
  const { campaign, launchState, assets, metrics } = detail;
  const funnel = buildFunnel(campaign.rollup);
  const channels = buildChannelBreakdown(assets);
  const composition = buildComposition(metrics);

  return (
    <div className="space-y-5">
      <PageHeader
        title={campaign.name}
        description={`How "${campaign.name}" is progressing toward approval, and what still needs backend data before live performance can be measured.`}
        backHref="/analytics"
        backLabel="analytics"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="blue">{campaign.persona}</StatusPill>
            <StatusPill tone="amber">{launchState.lifecycle}</StatusPill>
            <span className="font-mono text-xs text-[var(--text-muted)]">updated {campaign.updatedAt}</span>
          </div>
        }
      />

      <MetricStrip
        metrics={[
          { label: "Approved", value: funnel.approved, detail: "Pieces signed off.", tone: funnel.approved > 0 ? "green" : "gray" },
          { label: "Waiting on you", value: funnel.pending, detail: "Pieces awaiting approval.", tone: funnel.pending > 0 ? "amber" : "gray" },
          { label: "Needs changes", value: funnel.changes, detail: "Pieces sent back for revision.", tone: funnel.changes > 0 ? "red" : "gray" },
          { label: "Ready", value: `${funnel.readiness}%`, detail: `${funnel.approved} of ${funnel.total} pieces approved.`, tone: funnel.readiness === 100 && funnel.total > 0 ? "green" : "blue" },
        ]}
      />

      <WorkspacePanel
        eyebrow="Package composition"
        title="What this campaign is made of"
        description="The real records attached to this campaign right now."
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {composition.map((row) => (
            <div key={row.label} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{row.label}</div>
              <div className="mt-2 font-display text-2xl font-bold tabular-nums tracking-[-0.04em] text-[var(--text-primary)]">{row.value}</div>
            </div>
          ))}
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        eyebrow="Channels"
        title="Deliverables by channel"
        description="Where this campaign's pieces are headed once approved."
      >
        {channels.length > 0 ? (
          <div className="divide-y divide-[var(--border-hairline)]">
            {channels.map((row) => (
              <div key={row.channel} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="font-bold text-[var(--text-primary)]">{row.channel}</span>
                <span className="font-mono text-sm font-bold text-[var(--accent)]">{row.count} {row.count === 1 ? "piece" : "pieces"}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No deliverables yet" detail="Once Arc drafts pieces for this campaign, their channels appear here." />
        )}
      </WorkspacePanel>

      <WorkspacePanel
        eyebrow="Performance — needs data"
        title="What we'll measure once this campaign is live"
        description="There's no live delivery or outcome data yet. These are the checkpoints that become real numbers once approved sending and outcome tracking are connected."
        aside={<StatusPill tone="amber">Outbound locked</StatusPill>}
      >
        <div className="divide-y divide-[var(--border-hairline)]">
          {MEASUREMENT_PLAN.map((item) => (
            <div key={item.area} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[var(--text-primary)]">{item.area}</span>
                <StatusPill tone="amber">{item.currentSignal}</StatusPill>
              </div>
              <p className="mt-1.5 text-sm font-semibold leading-6 text-[var(--text-primary)]">{item.question}</p>
              <p className="mt-1 max-w-[80ch] text-sm leading-6 text-[var(--text-secondary)]">{item.nextStep}</p>
            </div>
          ))}
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        eyebrow="Not claimable yet"
        title="Locked until real outcome data exists"
        description="These stay unavailable so nothing here can imply results the data doesn't support."
      >
        <ul className="divide-y divide-[var(--border-hairline)]">
          {LOCKED_CLAIMS.map((claim) => (
            <li key={claim.title} className="px-5 py-3">
              <div className="font-bold text-[var(--text-primary)]">{claim.title}</div>
              <p className="mt-0.5 max-w-[80ch] text-sm leading-6 text-[var(--text-secondary)]">{claim.detail}</p>
            </li>
          ))}
        </ul>
      </WorkspacePanel>

      <p className="text-sm leading-6 text-[var(--text-secondary)]">
        Want to act on this campaign?{" "}
        <Link className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline" href={`/campaigns/${campaign.id}`}>
          Open it in the campaign workspace
        </Link>
        .
      </p>
    </div>
  );
}
```

Note: the single deliberate link to `/campaigns/[id]` is an explicit "go act on it" affordance in body copy — the campaign *row* in the list never navigates there (that is the behavior the user asked to remove).

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in `campaign-analytics-detail.tsx`. If `PageHeader` lacks `backHref`/`backLabel`/`aside` props, confirm against `src/app/_components/page-header.tsx` and adjust prop names to match (the campaign detail page uses `backHref`/`backLabel`; the analytics header uses `aside`).

- [ ] **Step 3: Commit**

```bash
git add src/app/analytics/_components/campaign-analytics-detail.tsx
git commit -m "feat: add campaign analytics detail component"
```

---

## Task 4: `/analytics/[campaignId]` route

**Files:**
- Create: `src/app/analytics/[campaignId]/page.tsx`

Context: mirror the loader in `src/app/campaigns/[campaignId]/page.tsx` (uses `connection()`, `getCampaignWorkspaceDetail(campaignId, undefined, agentName)`, `getAgentDisplayName`, `getAppSettings`), but render the analytics detail and point the back link at `/analytics`.

- [ ] **Step 1: Create the route**

Create `src/app/analytics/[campaignId]/page.tsx`:

```tsx
import { connection } from "next/server";

import { EmptyState, PageHeader } from "../../_components/page-header";
import { getCampaignWorkspaceDetail } from "@/lib/campaigns/read-model";
import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";

import { CampaignAnalyticsDetail } from "../_components/campaign-analytics-detail";

export const metadata = {
  title: "Campaign analytics",
};

type CampaignAnalyticsPageProps = {
  params: Promise<{ campaignId: string }>;
};

export default async function CampaignAnalyticsPage({ params }: CampaignAnalyticsPageProps) {
  await connection();

  const { campaignId } = await params;
  const { assistantName } = await getAppSettings();
  const agentName = getAgentDisplayName(assistantName);
  const detail = await getCampaignWorkspaceDetail(campaignId, undefined, agentName);

  if (detail.status !== "live") {
    const notFound = detail.status === "not_found";
    return (
      <>
        <PageHeader
          title={notFound ? "Campaign not found" : "Analytics unavailable"}
          backHref="/analytics"
          backLabel="analytics"
        />
        <EmptyState
          title={notFound ? "We couldn't find that campaign" : "Campaign analytics unavailable"}
          detail={
            notFound
              ? "This campaign does not exist in the Arc database, or it was removed."
              : detail.message
          }
        />
      </>
    );
  }

  return <CampaignAnalyticsDetail detail={detail} />;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. Confirm `getCampaignWorkspaceDetail`'s third arg name/signature matches `campaigns/[campaignId]/page.tsx` (copy its call exactly).

- [ ] **Step 3: Commit**

```bash
git add "src/app/analytics/[campaignId]/page.tsx"
git commit -m "feat: add per-campaign analytics route"
```

---

## Task 5: Move performance breakdowns out of `/reports`

**Files:**
- Create: `src/app/analytics/_components/performance-breakdowns.tsx`

Context: `reports/page.tsx` currently defines `LeadVolumeTab`, `ConversionTab`, `PartnerSignalsTab`, `RevenueTab`, `ContractTab` and the shared helpers `BreakdownPanel`, `SignalGrid`, `SignalList`, `SignalCard`, `ToneTag`. These render `getPerformanceReadModel()` data. Move the ones the analytics tabs need into a reusable module. `PerformanceBreakdown` and `PerformanceTone` types come from `@/lib/performance/read-model`.

- [ ] **Step 1: Create the breakdowns module**

Create `src/app/analytics/_components/performance-breakdowns.tsx` with the relocated components (copy the bodies verbatim from `reports/page.tsx`, lines ~140-216 for the tabs and ~279-365 for the helpers):

```tsx
import { EmptyState } from "@/app/_components/page-header";
import { WorkspacePanel } from "@/app/_components/workspace";
import type { PerformanceBreakdown, PerformanceReadModel, PerformanceTone } from "@/lib/performance/read-model";

type LivePerformance = Extract<PerformanceReadModel, { status: "live" }>;

export function LeadVolumeTab({ performance }: { performance: LivePerformance }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <BreakdownPanel
        eyebrow="Lead volume"
        title="By persona"
        description="Current lead records grouped by persona. Missing persona stays visible instead of being hidden."
        rows={performance.leadVolumeByPersona}
        empty="Lead records do not have persona/source data yet."
      />
      <BreakdownPanel
        eyebrow="Lead volume"
        title="By source"
        description="Where current lead records came from. This becomes source ROI once outcomes are joined."
        rows={performance.leadVolumeBySource}
        empty="No lead source values are available yet."
      />
    </div>
  );
}

export function ConversionTab({ rows }: { rows: PerformanceBreakdown[] }) {
  return (
    <WorkspacePanel
      eyebrow="Conversion"
      title="Booking, estimate, and close signals"
      description="These use existing lead, job, and outcome rows. Anything labeled proxy is not a final business KPI yet."
    >
      <SignalGrid rows={rows} />
    </WorkspacePanel>
  );
}

export function PartnerSignalsTab({ rows }: { rows: PerformanceBreakdown[] }) {
  return (
    <BreakdownPanel
      eyebrow="Partners"
      title="Referral attribution structure"
      description="Partner-tiered companies are visible now; referral count and revenue need explicit attribution."
      rows={rows}
      empty="No partner records are available yet."
    />
  );
}

export function RevenueTab({ performance }: { performance: LivePerformance }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <BreakdownPanel
        eyebrow="Revenue intelligence"
        title="Revenue by persona"
        description="Uses outcome revenue grouped by persona when present. Missing persona means attribution is incomplete."
        rows={performance.revenueByPersona}
        empty="No outcome revenue by persona exists yet."
      />
      <BreakdownPanel
        eyebrow="CTA events"
        title="Form, photo-upload, and landing conversion"
        description="Internal reporting only. This app does not publish landing pages or execute outbound campaigns."
        rows={performance.ctaSignals}
        empty="No CTA/form/photo-upload events are tracked yet."
      />
    </div>
  );
}

export function ContractTab({ contracts }: { contracts: LivePerformance["contracts"] }) {
  return (
    <WorkspacePanel
      eyebrow="Backend contract"
      title="Fields needed for real revenue intelligence"
      description="These are the database/API fields needed before optimization recommendations become trustworthy."
    >
      <div className="divide-y divide-[var(--border-hairline)]">
        {contracts.map((contract) => (
          <div className="grid gap-3 px-5 py-4 lg:grid-cols-[180px_minmax(0,1fr)]" key={contract.area}>
            <div>
              <div className="font-bold text-[var(--text-primary)]">{contract.area}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{contract.currentSignal}</div>
            </div>
            <div className="space-y-2">
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Missing fields</div>
                <div className="mt-1 font-mono text-xs leading-5 text-[var(--text-secondary)]">{contract.missingFields}</div>
              </div>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">{contract.nextBackendStep}</p>
            </div>
          </div>
        ))}
      </div>
    </WorkspacePanel>
  );
}

function BreakdownPanel({
  eyebrow,
  title,
  description,
  rows,
  empty,
}: {
  eyebrow: string;
  title: string;
  description: string;
  rows: PerformanceBreakdown[];
  empty: string;
}) {
  return (
    <WorkspacePanel eyebrow={eyebrow} title={title} description={description}>
      {rows.length > 0 ? <SignalList rows={rows} /> : <EmptyState title="No live signal yet" detail={empty} />}
    </WorkspacePanel>
  );
}

function SignalGrid({ rows }: { rows: PerformanceBreakdown[] }) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-3">
      {rows.map((row) => (
        <SignalCard key={row.label} row={row} />
      ))}
    </div>
  );
}

function SignalList({ rows }: { rows: PerformanceBreakdown[] }) {
  return (
    <div className="divide-y divide-[var(--border-hairline)]">
      {rows.map((row) => (
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_110px]" key={row.label}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-bold text-[var(--text-primary)]">{row.label}</div>
              <ToneTag tone={row.tone} />
            </div>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{row.detail}</p>
          </div>
          <div className="font-mono text-sm font-bold text-[var(--accent)] sm:text-right">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function SignalCard({ row }: { row: PerformanceBreakdown }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="font-bold text-[var(--text-primary)]">{row.label}</div>
        <ToneTag tone={row.tone} />
      </div>
      <div className="mt-3 font-display text-2xl font-bold tracking-[-0.04em] text-[var(--text-primary)]">{row.value}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{row.detail}</p>
    </div>
  );
}

function ToneTag({ tone }: { tone: PerformanceTone }) {
  const label =
    tone === "green"
      ? "Ready"
      : tone === "amber"
        ? "Needs data"
        : tone === "red"
          ? "Risk"
          : tone === "blue"
            ? "Live"
            : "Empty";

  const className =
    tone === "green"
      ? "border-[oklch(0.78_0.14_158/0.36)] bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]"
      : tone === "amber"
        ? "border-[oklch(0.82_0.13_85/0.36)] bg-[oklch(0.82_0.13_85/0.12)] text-[oklch(0.9_0.09_85)]"
        : tone === "red"
          ? "border-[oklch(0.68_0.2_26/0.4)] bg-[oklch(0.68_0.2_26/0.13)] text-[oklch(0.86_0.09_26)]"
          : tone === "blue"
            ? "border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--text-muted)]";

  return <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${className}`}>{label}</span>;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in `performance-breakdowns.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/analytics/_components/performance-breakdowns.tsx
git commit -m "feat: relocate performance breakdowns for analytics tabs"
```

---

## Task 6: Rewire `/analytics` top-level (tabs + drill-down hrefs)

**Files:**
- Modify: `src/app/analytics/page.tsx`

Context: the page already builds `rows` (campaign comparison) and the workspace `MetricStrip`. Add a `TabNav` keyed off `?tab=`, route each `ComparisonRow` to `/analytics/[id]`, render the folded breakdown tabs from `getPerformanceReadModel()`, and remove the `/reports` footnote.

- [ ] **Step 1: Update imports and signature**

At the top of `src/app/analytics/page.tsx`, replace the import block with this. Note `import Link from "next/link"` stays (the existing footnote `Link` goes away, but `ComparisonRow` still uses `Link`):

```tsx
import { connection } from "next/server";
import Link from "next/link";

import { EmptyState, PageHeader } from "../_components/page-header";
import { TabNav } from "../_components/tab-nav";
import { MetricStrip, WorkspacePanel } from "../_components/workspace";
import { getCampaignWorkspaceList, type CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { getPerformanceReadModel } from "@/lib/performance/read-model";
import { getAppSettings } from "@/lib/settings/store";

import { ConversionTab, ContractTab, LeadVolumeTab, PartnerSignalsTab, RevenueTab } from "./_components/performance-breakdowns";
```

- [ ] **Step 2: Add the tab list and normalizer**

Add near the top of the file (module scope, after imports):

```tsx
type AnalyticsTabKey = "campaigns" | "leads" | "conversion" | "revenue" | "partners" | "contract";

const analyticsTabs: Array<{ key: AnalyticsTabKey; label: string; detail: string }> = [
  { key: "campaigns", label: "Campaigns", detail: "Per-campaign progress and insight." },
  { key: "leads", label: "Leads", detail: "Persona and source volume." },
  { key: "conversion", label: "Conversion", detail: "Booking, estimate, and close signals." },
  { key: "revenue", label: "Revenue", detail: "Persona revenue and CTA events." },
  { key: "partners", label: "Partners", detail: "Referral and partner attribution." },
  { key: "contract", label: "Data contract", detail: "Backend fields still needed." },
];

function normalizeTab(value: string | string[] | undefined): AnalyticsTabKey {
  const tab = Array.isArray(value) ? value[0] : value;
  return analyticsTabs.some((item) => item.key === tab) ? (tab as AnalyticsTabKey) : "campaigns";
}
```

- [ ] **Step 3: Update the page component to read `searchParams`, load performance, and render tabs**

Replace the `AnalyticsPage` function signature and body down to the closing `</>` (currently lines ~13-98). Keep the existing `unavailable` early return and the existing `MetricStrip`. The new body:

```tsx
export default async function AnalyticsPage({ searchParams }: { searchParams?: Promise<{ tab?: string | string[] }> }) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const activeTab = normalizeTab(query.tab);
  const [list, performance, settings] = await Promise.all([
    getCampaignWorkspaceList(),
    getPerformanceReadModel(),
    getAppSettings(),
  ]);
  const brand = { workspaceName: settings.workspaceName, logoUrl: settings.brandLogoUrl };

  if (list.status === "unavailable") {
    return (
      <>
        <AnalyticsHeader brand={brand} />
        <EmptyState
          title="No campaign data to show yet"
          detail="Once campaigns are connected, this page will show how each one is doing and what is waiting on you."
        />
      </>
    );
  }

  const campaigns = list.campaigns;
  const rows = campaigns.map(toComparisonRow).sort(byMostNeedingAttention);

  const readyCount = rows.filter((row) => row.state === "ready").length;
  const waitingOnYou = rows.reduce((total, row) => total + row.pending, 0);

  return (
    <>
      <AnalyticsHeader brand={brand} />

      <MetricStrip
        metrics={[
          {
            label: "Waiting on you",
            value: waitingOnYou,
            detail: waitingOnYou > 0 ? "Pieces that need your approval." : "You're all caught up.",
            tone: waitingOnYou > 0 ? "amber" : "green",
            href: waitingOnYou > 0 ? "/campaigns" : undefined,
          },
          {
            label: "Approved & ready",
            value: readyCount,
            detail: "Every piece signed off.",
            tone: readyCount > 0 ? "green" : "gray",
          },
          {
            label: "Campaigns",
            value: list.totals.campaigns,
            detail: "All campaigns in your workspace.",
            tone: list.totals.campaigns > 0 ? "blue" : "gray",
          },
          {
            label: "Creative made",
            value: list.totals.assets,
            detail: "Assets drafted across campaigns.",
            tone: list.totals.assets > 0 ? "blue" : "gray",
          },
        ]}
      />

      <TabNav
        ariaLabel="Analytics sections"
        activeKey={activeTab}
        columns="sm:grid-cols-2 xl:grid-cols-6"
        className="mb-5"
        tabs={analyticsTabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          detail: tab.detail,
          href: `/analytics?tab=${tab.key}`,
        }))}
      />

      {activeTab === "campaigns" ? (
        <WorkspacePanel
          title="Compare your campaigns"
          description="Each campaign and how far it has moved from draft to approved. Select one to see its full analytics."
        >
          {rows.length > 0 ? (
            <ul className="divide-y divide-[var(--border-hairline)]">
              {rows.map((row) => (
                <ComparisonRow key={row.id} row={row} />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No campaigns yet"
              detail="When Arc drafts a campaign or you create one, it will appear here with its progress."
            />
          )}
        </WorkspacePanel>
      ) : performance.status === "unavailable" ? (
        <EmptyState title="Performance data unavailable" detail={performance.message} />
      ) : activeTab === "leads" ? (
        <LeadVolumeTab performance={performance} />
      ) : activeTab === "conversion" ? (
        <ConversionTab rows={performance.conversionSignals} />
      ) : activeTab === "revenue" ? (
        <RevenueTab performance={performance} />
      ) : activeTab === "partners" ? (
        <PartnerSignalsTab rows={performance.partnerSignals} />
      ) : (
        <ContractTab contracts={performance.contracts} />
      )}
    </>
  );
}
```

- [ ] **Step 4: Point campaign rows at the analytics detail route**

In the `ComparisonRow` component (still in this file), change the `Link` `href` from `row.href` to the analytics route. Find:

```tsx
      <Link
        className="grid gap-4 px-5 py-4 transition hover:bg-[var(--surface-inset)] sm:grid-cols-[minmax(0,1fr)_200px_150px] sm:items-center"
        href={row.href}
      >
```

and change `href={row.href}` to `href={`/analytics/${row.id}`}`.

- [ ] **Step 5: Verify type-check and lint**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (`row.href` may now be unused in `ComparisonRowData` — that's fine; leave the field, it documents the source. If lint flags it as unused it is a type field, not a variable, so it will not.)

Run: `pnpm exec eslint src/app/analytics/page.tsx`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/analytics/page.tsx
git commit -m "feat: make analytics the single insight home with campaign drill-down"
```

---

## Task 7: Redirect `/reports` to `/analytics`

**Files:**
- Modify: `src/app/reports/page.tsx` (replace entire file)

- [ ] **Step 1: Replace the reports page with a redirect**

Replace the entire contents of `src/app/reports/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

/** Analytics is now the single home for performance insight. Old /reports links
 *  (and bookmarks) land on the consolidated analytics page. */
export default function ReportsPage() {
  redirect("/analytics");
}
```

- [ ] **Step 2: Verify type-check and lint**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (the old `getPerformanceReadModel`, `IntelligencePanel`, `TabNav`, etc. imports are gone with the file body).

Run: `pnpm exec eslint src/app/reports/page.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/reports/page.tsx
git commit -m "feat: redirect /reports to consolidated /analytics"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS, including the new `campaign-analytics-model.test.ts`.

- [ ] **Step 2: Type-check the whole project**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: build succeeds; `/analytics`, `/analytics/[campaignId]`, and `/reports` all compile.

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev`, then check:
- `/analytics` shows tabs (Campaigns default). Campaign rows link to `/analytics/<id>` (hover the URL) — NOT `/campaigns/<id>`.
- Switching tabs updates `?tab=` and shows leads/conversion/revenue/partners/contract content.
- `/analytics/<a real campaign id>` shows the funnel, composition, channels, and "needs data" sections with a "← analytics" back link.
- Visiting `/reports` redirects to `/analytics`.
- An invalid `/analytics/does-not-exist` shows the not-found empty state with the back link.

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore: analytics consolidation verification cleanup"
```

(Skip if nothing changed in Step 4.)

---

## Notes for the implementer

- **Approval-safe:** every view is read-only over existing read-models. Do not add mutations, sending, or publishing.
- **No fake numbers:** the per-campaign "Performance" sections are intentionally placeholders labeled "needs data." Do not substitute sample metrics.
- **`pnpm lint` scans vendored files** (~31k pre-existing problems) — only lint the specific files you touched (`pnpm exec eslint <paths>`), not the whole repo.
- **`pnpm lint` does not type-check** — always run `pnpm exec tsc --noEmit` (or `pnpm build`) to catch type errors.
- If `PageHeader` prop names differ from what Task 3/4 assume (`backHref`, `backLabel`, `aside`), match the real signature in `src/app/_components/page-header.tsx` — `campaigns/[campaignId]/page.tsx` and `analytics/page.tsx` are working references for both prop sets.
