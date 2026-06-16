# Campaign Results Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "Results" section to the campaign page that closes the loop after deploy — Delivery (send outcomes + failures), Engagement (traffic), and Business outcomes (revenue/jobs) — from data that already exists.

**Architecture:** A pure, unit-tested model (`buildCampaignResults`) turns the already-fetched dispatches + a newly-fetched `getCampaignPerformance` into a serializable view with honest per-tier empty states. A presentational `CampaignResults` component renders it; the page fetches performance and passes it down. No new backend, no outbound behavior.

**Tech Stack:** Next.js 16 (RSC), React 19, TypeScript, Vitest, Tailwind CSS-variable tokens.

**Design reference:** `docs/superpowers/specs/2026-06-16-campaign-results-loop-design.md`

---

## Context an implementer needs

- **Read the spec first.** This is a **read-only display** feature — no sends, no mutations. Failures link to the existing `/outbox`; do not add a retry action here.
- **Data sources (reuse, do not modify):**
  - `getCampaignDispatches(campaignId)` (`src/lib/dispatch/read-model.ts`) → `DispatchView[]`. Already fetched by the page. `DispatchView` (from `src/lib/dispatch/status.ts`): `{ id, campaignId, campaignName, assetId, deliverable, channel, status, scheduledFor, dispatchedAt, recipientSummary, audienceCount, resultNote, updatedAt }`. `status: DispatchStatus = "queued" | "scheduled" | "sent" | "delivered" | "failed" | "canceled"`.
  - `getCampaignPerformance(campaignId)` (`src/lib/performance/campaign-performance.ts`) → `CampaignPerformance = { status: "live"; money: CampaignMoney; traffic: CampaignTraffic; trafficTracked: boolean } | { status: "unavailable"; message: string }`. NOT yet fetched on the detail page.
    - `CampaignMoney` (`src/domain/campaign-performance.ts`): `{ realizedRevenueCents, marginCents, wonCount, outcomeCount, estimatedPipelineCents, jobCount, hasData }` (all numbers except `hasData: boolean`).
    - `CampaignTraffic`: `{ totalEvents: number; byType: {label,count}[]; byChannel: {label,count}[]; hasData: boolean }`.
- **Dispatch status helpers** (`src/lib/dispatch/status.ts`): `DISPATCH_STATUS_ORDER: DispatchStatus[]`, `statusLabel(status): string`, `STATUS_TONE: Record<DispatchStatus, "amber"|"blue"|"green"|"red"|"gray">`, `groupByStatus(dispatches)`.
- **UI primitive:** `StatusPill` (`src/app/_components/page-header.tsx`) — props `tone` + children.
- **Pattern to mirror:** the deploy launchpad shipped recently — `campaign-deploy-model.ts` (pure model + `__tests__/campaign-deploy-model.test.ts`) + `campaign-deploy-launchpad.tsx` (component) + wiring in `campaign-simple-detail.tsx`. Follow that shape exactly.
- **Commands:** `pnpm test <file>` (vitest), `pnpm build` (types — lint does NOT typecheck), `pnpm lint <files>` (scope to changed files; repo-wide lint scans vendored files and floods output).
- **Design rules** (`DESIGN.md`): warm near-black surfaces, antique-gold accent, canonical `StatusPill`, no emojis, no fake/placeholder metrics, no side-stripe accent borders, no nested cards.

## File structure

**New**
- `src/app/campaigns/_components/campaign-results-model.ts` — pure `buildCampaignResults` + types + `formatUsdCents`.
- `src/app/campaigns/_components/__tests__/campaign-results-model.test.ts` — model tests.
- `src/app/campaigns/_components/campaign-results.tsx` — presentational section (`id="results"`).

**Modified**
- `src/app/campaigns/[campaignId]/page.tsx` — fetch `getCampaignPerformance`, pass `performance` down.
- `src/app/campaigns/_components/campaign-simple-detail.tsx` — build results, render `<CampaignResults>` after the two-column grid.

---

## Task 1: Pure model — `buildCampaignResults`

**Files:**
- Create: `src/app/campaigns/_components/campaign-results-model.ts`
- Test: `src/app/campaigns/_components/__tests__/campaign-results-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/campaigns/_components/__tests__/campaign-results-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { DispatchStatus, DispatchView } from "@/lib/dispatch/status";
import type { CampaignPerformance } from "@/lib/performance/campaign-performance";

import { buildCampaignResults, formatUsdCents } from "../campaign-results-model";

function dispatch(partial: Partial<DispatchView> & { status: DispatchStatus }): DispatchView {
  return {
    id: "d1",
    campaignId: "c1",
    campaignName: "Storm follow-up",
    assetId: "a1",
    deliverable: "Welcome email",
    channel: "Email",
    status: partial.status,
    scheduledFor: null,
    dispatchedAt: null,
    recipientSummary: null,
    audienceCount: null,
    resultNote: null,
    updatedAt: "2026-06-16",
    ...partial,
  };
}

const livePerf = (over: Partial<Extract<CampaignPerformance, { status: "live" }>> = {}): CampaignPerformance => ({
  status: "live",
  trafficTracked: true,
  money: { realizedRevenueCents: 0, marginCents: 0, wonCount: 0, outcomeCount: 0, estimatedPipelineCents: 0, jobCount: 0, hasData: false },
  traffic: { totalEvents: 0, byType: [], byChannel: [], hasData: false },
  ...over,
});

describe("formatUsdCents", () => {
  it("formats cents as whole-dollar USD", () => {
    expect(formatUsdCents(125000)).toBe("$1,250");
    expect(formatUsdCents(0)).toBe("$0");
  });
});

describe("buildCampaignResults", () => {
  it("delivery is empty when there are no dispatches", () => {
    const r = buildCampaignResults({ dispatches: [], performance: livePerf() });
    expect(r.delivery.hasAnyDispatch).toBe(false);
    expect(r.delivery.buckets).toEqual([]);
    expect(r.delivery.failures).toEqual([]);
  });

  it("counts dispatches into lifecycle-ordered buckets and lists failures", () => {
    const r = buildCampaignResults({
      dispatches: [
        dispatch({ status: "delivered" }),
        dispatch({ id: "d2", status: "sent" }),
        dispatch({ id: "d3", status: "failed", deliverable: "Reminder SMS", channel: "SMS", resultNote: "no number on file" }),
      ],
      performance: livePerf(),
    });
    expect(r.delivery.hasAnyDispatch).toBe(true);
    // lifecycle order is queued, scheduled, sent, delivered, failed, canceled
    expect(r.delivery.buckets.map((b) => b.status)).toEqual(["sent", "delivered", "failed"]);
    expect(r.delivery.buckets.find((b) => b.status === "sent")?.count).toBe(1);
    expect(r.delivery.failures).toEqual([
      { id: "d3", deliverable: "Reminder SMS", channel: "SMS", note: "no number on file" },
    ]);
  });

  it("engagement is 'untracked' when performance is unavailable", () => {
    const r = buildCampaignResults({ dispatches: [], performance: { status: "unavailable", message: "no supabase" } });
    expect(r.engagement.state).toBe("untracked");
    expect(r.outcomes.state).toBe("unavailable");
  });

  it("engagement is 'untracked' when trafficTracked is false", () => {
    const r = buildCampaignResults({ dispatches: [], performance: livePerf({ trafficTracked: false }) });
    expect(r.engagement.state).toBe("untracked");
  });

  it("engagement is 'empty' when tracked but no data", () => {
    const r = buildCampaignResults({ dispatches: [], performance: livePerf({ trafficTracked: true }) });
    expect(r.engagement.state).toBe("empty");
  });

  it("engagement is 'data' with formatted breakdowns", () => {
    const r = buildCampaignResults({
      dispatches: [],
      performance: livePerf({ traffic: { totalEvents: 12, byType: [{ label: "Open", count: 8 }], byChannel: [{ label: "Email", count: 12 }], hasData: true } }),
    });
    expect(r.engagement).toMatchObject({ state: "data", totalEvents: 12 });
    if (r.engagement.state === "data") {
      expect(r.engagement.byType).toEqual([{ label: "Open", value: "8" }]);
      expect(r.engagement.byChannel).toEqual([{ label: "Email", value: "12" }]);
    }
  });

  it("outcomes is 'empty' when live but money has no data", () => {
    const r = buildCampaignResults({ dispatches: [], performance: livePerf() });
    expect(r.outcomes.state).toBe("empty");
  });

  it("outcomes is 'data' with USD-formatted money stats", () => {
    const r = buildCampaignResults({
      dispatches: [],
      performance: livePerf({ money: { realizedRevenueCents: 500000, marginCents: 200000, wonCount: 2, outcomeCount: 3, estimatedPipelineCents: 1000000, jobCount: 4, hasData: true } }),
    });
    expect(r.outcomes.state).toBe("data");
    if (r.outcomes.state === "data") {
      expect(r.outcomes.stats).toEqual([
        { label: "Realized revenue", value: "$5,000" },
        { label: "Margin", value: "$2,000" },
        { label: "Jobs won", value: "2 of 3" },
        { label: "Pipeline", value: "$10,000 (4 jobs)" },
      ]);
    }
  });

  it("isEmpty only when no dispatches and no engagement/outcomes data", () => {
    expect(buildCampaignResults({ dispatches: [], performance: livePerf() }).isEmpty).toBe(true);
    expect(buildCampaignResults({ dispatches: [dispatch({ status: "sent" })], performance: livePerf() }).isEmpty).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/campaigns/_components/__tests__/campaign-results-model.test.ts`
Expected: FAIL — module not found / `buildCampaignResults` not exported.

- [ ] **Step 3: Write the model**

Create `src/app/campaigns/_components/campaign-results-model.ts`:

```ts
import { DISPATCH_STATUS_ORDER, statusLabel, type DispatchStatus, type DispatchView } from "@/lib/dispatch/status";
import type { CampaignPerformance } from "@/lib/performance/campaign-performance";

export type DeliveryBucket = { status: DispatchStatus; label: string; count: number };
export type DeliveryFailure = { id: string; deliverable: string; channel: string; note: string | null };
export type DeliveryTier = { hasAnyDispatch: boolean; buckets: DeliveryBucket[]; failures: DeliveryFailure[] };

export type MetricStat = { label: string; value: string };

export type EngagementTier =
  | { state: "untracked" }
  | { state: "empty" }
  | { state: "data"; totalEvents: number; byType: MetricStat[]; byChannel: MetricStat[] };

export type OutcomesTier = { state: "unavailable" } | { state: "empty" } | { state: "data"; stats: MetricStat[] };

export type CampaignResults = {
  delivery: DeliveryTier;
  engagement: EngagementTier;
  outcomes: OutcomesTier;
  /** true only when no tier has anything real to show — drives one whole-section empty state. */
  isEmpty: boolean;
};

export type BuildCampaignResultsInput = {
  dispatches: DispatchView[];
  performance: CampaignPerformance;
};

/** Whole-dollar USD from cents. No shared formatter exists in the codebase. */
export function formatUsdCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function buildDelivery(dispatches: DispatchView[]): DeliveryTier {
  const buckets = DISPATCH_STATUS_ORDER.map((status) => ({
    status,
    label: statusLabel(status),
    count: dispatches.filter((d) => d.status === status).length,
  })).filter((b) => b.count > 0);

  const failures = dispatches
    .filter((d) => d.status === "failed")
    .map((d) => ({ id: d.id, deliverable: d.deliverable, channel: d.channel, note: d.resultNote }));

  return { hasAnyDispatch: dispatches.length > 0, buckets, failures };
}

function buildEngagement(performance: CampaignPerformance): EngagementTier {
  if (performance.status !== "live" || !performance.trafficTracked) return { state: "untracked" };
  const t = performance.traffic;
  if (!t.hasData) return { state: "empty" };
  return {
    state: "data",
    totalEvents: t.totalEvents,
    byType: t.byType.map((x) => ({ label: x.label, value: String(x.count) })),
    byChannel: t.byChannel.map((x) => ({ label: x.label, value: String(x.count) })),
  };
}

function buildOutcomes(performance: CampaignPerformance): OutcomesTier {
  if (performance.status !== "live") return { state: "unavailable" };
  const m = performance.money;
  if (!m.hasData) return { state: "empty" };
  return {
    state: "data",
    stats: [
      { label: "Realized revenue", value: formatUsdCents(m.realizedRevenueCents) },
      { label: "Margin", value: formatUsdCents(m.marginCents) },
      { label: "Jobs won", value: `${m.wonCount} of ${m.outcomeCount}` },
      { label: "Pipeline", value: `${formatUsdCents(m.estimatedPipelineCents)} (${m.jobCount} job${m.jobCount === 1 ? "" : "s"})` },
    ],
  };
}

/**
 * Pure view-model for the campaign Results section. Buckets dispatches by lifecycle
 * status, lists failures, and maps performance money/traffic into display tiers with
 * honest empty/untracked/unavailable states. No I/O.
 */
export function buildCampaignResults(input: BuildCampaignResultsInput): CampaignResults {
  const delivery = buildDelivery(input.dispatches);
  const engagement = buildEngagement(input.performance);
  const outcomes = buildOutcomes(input.performance);
  const isEmpty = !delivery.hasAnyDispatch && engagement.state !== "data" && outcomes.state !== "data";
  return { delivery, engagement, outcomes, isEmpty };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/campaigns/_components/__tests__/campaign-results-model.test.ts`
Expected: PASS (10 tests). If `formatUsdCents` output differs (locale), the test asserts `en-US` with `maximumFractionDigits: 0` → `"$1,250"`, `"$0"`; the implementation pins those options so it matches.

- [ ] **Step 5: Typecheck**

Run: `pnpm build`
Expected: no type errors. (Confirm `CampaignPerformance`/`CampaignMoney`/`CampaignTraffic` field names match by reading `src/lib/performance/campaign-performance.ts` + `src/domain/campaign-performance.ts` if the build complains.)

- [ ] **Step 6: Commit**

```bash
git add src/app/campaigns/_components/campaign-results-model.ts src/app/campaigns/_components/__tests__/campaign-results-model.test.ts
git commit -m "feat(campaigns): pure campaign-results view-model"
```

---

## Task 2: Results section component

**Files:**
- Create: `src/app/campaigns/_components/campaign-results.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/campaigns/_components/campaign-results.tsx`:

```tsx
import type { ReactNode } from "react";

import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import { STATUS_TONE } from "@/lib/dispatch/status";

import type { CampaignResults as CampaignResultsModel, DeliveryTier, EngagementTier, MetricStat, OutcomesTier } from "./campaign-results-model";

export function CampaignResults({ results }: { results: CampaignResultsModel }) {
  return (
    <section
      id="results"
      className="scroll-mt-5 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]"
    >
      <header className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Results</h2>
        <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">
          What happened after this campaign went out — delivery, engagement, and booked outcomes.
        </p>
      </header>

      {results.isEmpty ? (
        <p className="px-4 py-6 text-sm leading-6 text-[var(--text-muted)]">
          Results appear after the campaign goes out. Deploy a piece to start tracking delivery, engagement, and outcomes.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border-hairline)]">
          <DeliveryTierView delivery={results.delivery} />
          <EngagementTierView engagement={results.engagement} />
          <OutcomesTierView outcomes={results.outcomes} />
        </div>
      )}
    </section>
  );
}

function TierShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function DeliveryTierView({ delivery }: { delivery: DeliveryTier }) {
  return (
    <TierShell title="Delivery">
      {delivery.hasAnyDispatch ? (
        <>
          <div className="flex flex-wrap gap-2">
            {delivery.buckets.map((b) => (
              <span key={b.status} className="inline-flex items-center gap-1.5">
                <StatusPill tone={STATUS_TONE[b.status]}>{b.label}</StatusPill>
                <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{b.count}</span>
              </span>
            ))}
          </div>
          {delivery.failures.length > 0 ? (
            <div className="mt-3 rounded-lg border border-[var(--warn-border-soft)] bg-[var(--warn-soft)] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-[var(--warn-text)]">
                  {delivery.failures.length} delivery failure{delivery.failures.length === 1 ? "" : "s"}
                </span>
                <Link href="/outbox" className="text-xs font-semibold text-[var(--accent)] hover:underline">
                  Manage in Outbox
                </Link>
              </div>
              <ul className="mt-2 space-y-1">
                {delivery.failures.map((f) => (
                  <li key={f.id} className="text-xs leading-5 text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{f.deliverable}</span> &middot; {f.channel}
                    {f.note ? <span className="text-[var(--text-muted)]"> — {f.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm leading-6 text-[var(--text-muted)]">Nothing has been sent yet.</p>
      )}
    </TierShell>
  );
}

function EngagementTierView({ engagement }: { engagement: EngagementTier }) {
  return (
    <TierShell title="Engagement">
      {engagement.state === "untracked" ? (
        <p className="text-sm leading-6 text-[var(--text-muted)]">Engagement isn&apos;t tracked for this campaign yet.</p>
      ) : engagement.state === "empty" ? (
        <p className="text-sm leading-6 text-[var(--text-muted)]">No engagement recorded yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="font-mono text-sm font-bold text-[var(--text-primary)]">{engagement.totalEvents} total events</div>
          <MetricRow label="By type" stats={engagement.byType} />
          <MetricRow label="By channel" stats={engagement.byChannel} />
        </div>
      )}
    </TierShell>
  );
}

function OutcomesTierView({ outcomes }: { outcomes: OutcomesTier }) {
  return (
    <TierShell title="Business outcomes">
      {outcomes.state === "unavailable" ? (
        <p className="text-sm leading-6 text-[var(--text-muted)]">Outcomes appear once the campaign produces booked work.</p>
      ) : outcomes.state === "empty" ? (
        <p className="text-sm leading-6 text-[var(--text-muted)]">No booked outcomes attributed yet.</p>
      ) : (
        <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {outcomes.stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{s.label}</dt>
              <dd className="mt-1 font-mono text-lg font-bold leading-none tabular-nums text-[var(--text-primary)]">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </TierShell>
  );
}

function MetricRow({ label, stats }: { label: string; stats: MetricStat[] }) {
  if (stats.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {stats.map((s) => (
          <span key={s.label} className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2 py-1 text-xs text-[var(--text-secondary)]">
            {s.label}: <span className="font-mono font-bold text-[var(--text-primary)]">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build`
Expected: no type errors. (Confirm `STATUS_TONE` is exported from `@/lib/dispatch/status` and its tone values are accepted by `StatusPill`'s `tone` prop — `dispatch-panel.tsx` already uses exactly this pairing, so it's known-good. Confirm `--warn-border-soft`/`--warn-soft`/`--warn-text` exist — used in `campaign-package-workspace.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/campaign-results.tsx
git commit -m "feat(campaigns): results section component"
```

---

## Task 3: Wire results into the page

**Files:**
- Modify: `src/app/campaigns/[campaignId]/page.tsx`
- Modify: `src/app/campaigns/_components/campaign-simple-detail.tsx`

- [ ] **Step 1: Fetch performance in the page**

In `src/app/campaigns/[campaignId]/page.tsx`, add the import alongside the existing read-model imports:

```tsx
import { getCampaignPerformance } from "@/lib/performance/campaign-performance";
```

Extend the existing `Promise.all` (which currently destructures `[detail, connections, dispatches]`) to also fetch performance:

```tsx
  const [detail, connections, dispatches, performance] = await Promise.all([
    getCampaignWorkspaceDetail(campaignId, undefined, agentName),
    getConnections(),
    getCampaignDispatches(campaignId),
    getCampaignPerformance(campaignId),
  ]);
```

Update the live-case return to pass `performance`:

```tsx
  return (
    <CampaignSimpleDetail
      detail={detail}
      agentName={agentName}
      connections={connections}
      dispatches={dispatches}
      performance={performance}
    />
  );
```

(The not-found/non-live early-return block is unchanged — it only uses `detail`.)

- [ ] **Step 2: Build + render results in the detail component**

In `src/app/campaigns/_components/campaign-simple-detail.tsx`:

Add imports with the others:

```tsx
import type { CampaignPerformance } from "@/lib/performance/campaign-performance";

import { CampaignResults } from "./campaign-results";
import { buildCampaignResults } from "./campaign-results-model";
```

Add `performance` to the props type and destructuring of `CampaignSimpleDetail`:

```tsx
export function CampaignSimpleDetail({
  detail,
  agentName,
  connections,
  dispatches,
  performance,
}: {
  detail: LiveCampaignWorkspace;
  agentName: string;
  connections: ConnectionView[];
  dispatches: DispatchView[];
  performance: CampaignPerformance;
}) {
```

Build the model with the others (right after the existing `const launchpad = buildDeployLaunchpad({ ... });` line):

```tsx
  const results = buildCampaignResults({ dispatches, performance });
```

Render the section after the two-column grid. Find the closing `</div>` of the grid that begins with `<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">` (it contains `<CampaignPackageWorkspace>` and `<CampaignContextRail>`). Immediately after that grid's closing `</div>`, and before the outer wrapper's closing `</div>`, add:

```tsx
      <CampaignResults results={results} />
```

- [ ] **Step 3: Typecheck + model tests**

Run: `pnpm build`
Expected: no type errors (confirms page → detail → results → model chain).
Run: `pnpm test src/app/campaigns/_components/__tests__/campaign-results-model.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/[campaignId]/page.tsx src/app/campaigns/_components/campaign-simple-detail.tsx
git commit -m "feat(campaigns): mount results section on campaign page"
```

---

## Task 4: Full verification

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS, including the new `campaign-results-model.test.ts`.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: completes with no type errors.

- [ ] **Step 3: Scoped lint**

Run: `pnpm lint src/app/campaigns/_components/campaign-results-model.ts src/app/campaigns/_components/campaign-results.tsx src/app/campaigns/_components/campaign-simple-detail.tsx "src/app/campaigns/[campaignId]/page.tsx"`
Expected: no errors in these files.

- [ ] **Step 4: Manual smoke (requires Supabase + a seeded campaign)**

`pnpm dev`, open `/campaigns/<id>`:
- The "Results" section renders below the package workspace.
- With no dispatches and no perf data: single "Results appear after the campaign goes out" empty state.
- After deploying a piece: it appears under Delivery with the right status pill + count.
- A `failed` dispatch shows in the Failures callout with an "Manage in Outbox" link.
- Engagement shows "isn't tracked" when `trafficTracked` is false; Business outcomes shows "No booked outcomes attributed yet" until outcomes exist.
- Without Supabase: page still renders; Results shows the whole-section empty state.

---

## Self-review notes (for the implementer)

- **Spec coverage:** Task 1 = three-tier model + honest states + `formatUsdCents`; Task 2 = section UI incl. failures→Outbox link and empty states; Task 3 = page fetch + mount giving the `#results` anchor a real target. No retry action added (per spec non-goal).
- **Reused, not rebuilt:** `getCampaignPerformance`, `getCampaignDispatches`, dispatch status helpers, `StatusPill`. No backend/domain changes.
- **Type consistency:** `buildCampaignResults({ dispatches, performance })` object arg matches Task 3's call. Tier discriminants (`untracked`/`empty`/`data` for engagement; `unavailable`/`empty`/`data` for outcomes) are identical in model (Task 1) and component (Task 2). `CampaignResults` model type is imported in the component aliased as `CampaignResultsModel` to avoid colliding with the `CampaignResults` component name.
- **RSC boundary:** `CampaignResults` is a server component (no interactivity); the page passes only serializable data.
```
