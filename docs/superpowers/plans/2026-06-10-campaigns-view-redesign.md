# Campaigns View Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `/campaigns` approval list from a row of identical "NEEDS YOU" stubs into a self-sufficient triage surface — each row shows *why* Arc built the campaign, a content preview, and how long it's waited; internal CRM batches collapse into one fold; a slim momentum strip gives the queue a destination.

**Architecture:** All real logic lives in pure, unit-tested functions — a `classifyCampaignKind` domain helper (outbound vs internal), a `formatWaitTime` formatter, and a `library-model` module that partitions/sorts the awaiting items and tallies lifecycle counts. The React components (`campaign-library.tsx` and three new presentational/client pieces) stay thin and are verified by lint + typecheck/build, matching the existing codebase convention (the only current campaigns component test covers a pure helper, not a render). The read model gains one raw-ISO field so wait-time can be computed client-side.

**Tech Stack:** Next.js 16 (server components + one client component), React 19, TypeScript, Tailwind (CSS-var tokens from `DESIGN.md`), Vitest.

---

## File map

- **Create** `src/domain/campaign-kind.ts` — `classifyCampaignKind` pure helper + `CampaignKind` type.
- **Modify** `src/domain/index.ts` — re-export `./campaign-kind`.
- **Create** `src/domain/__tests__/campaign-kind.test.ts` — classifier unit tests.
- **Create** `src/app/campaigns/_components/format-wait-time.ts` — `formatWaitTime` duration formatter.
- **Create** `src/app/campaigns/_components/__tests__/format-wait-time.test.ts` — formatter unit tests.
- **Create** `src/app/campaigns/_components/library-model.ts` — `partitionAwaiting`, `byWaitDesc`, `momentumCounts`, types.
- **Create** `src/app/campaigns/_components/__tests__/library-model.test.ts` — partition/sort/counts tests.
- **Modify** `src/lib/campaigns/read-model.ts` — add `updatedAtIso` to `CampaignWorkspaceListItem` (type + assignment).
- **Create** `src/app/campaigns/_components/momentum-strip.tsx` — presentational lifecycle-count strip.
- **Create** `src/app/campaigns/_components/collapsed-batch-group.tsx` — `"use client"` expandable internal-batch fold.
- **Modify** `src/app/campaigns/_components/campaign-library.tsx` — enriched rows, preview, partitioned awaiting section, momentum strip, empty-group affordances; remove redundant "Drafted by Arc" chip.

---

## Task 1: `classifyCampaignKind` domain helper (TDD)

**Files:**
- Create: `src/domain/campaign-kind.ts`
- Modify: `src/domain/index.ts`
- Test: `src/domain/__tests__/campaign-kind.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/campaign-kind.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { classifyCampaignKind } from "@/domain";

describe("classifyCampaignKind", () => {
  it("treats any email/social/landing asset as outbound", () => {
    expect(classifyCampaignKind({ assetTypes: ["Email", "Campaign Brief"], objective: "Intro Goode" })).toBe("outbound");
    expect(classifyCampaignKind({ assetTypes: ["Social Ad"], objective: "Storm safety" })).toBe("outbound");
    expect(classifyCampaignKind({ assetTypes: ["Email", "Crm Lead List Review"], objective: "Apex handoff" })).toBe("outbound");
  });

  it("treats pure CRM/list/enrichment work as internal", () => {
    expect(classifyCampaignKind({ assetTypes: ["Crm Population Batch"], objective: "Populate partner records" })).toBe("internal");
    expect(classifyCampaignKind({ assetTypes: ["Partner Lead List"], objective: "Discovery recommendations" })).toBe("internal");
  });

  it("does NOT misread 'lead' as the 'ad' channel", () => {
    expect(classifyCampaignKind({ assetTypes: ["Crm Lead List Review"], objective: "Review list" })).toBe("internal");
  });

  it("defaults unknown shapes to outbound so real campaigns are never hidden", () => {
    expect(classifyCampaignKind({ assetTypes: [], objective: "" })).toBe("outbound");
    expect(classifyCampaignKind({ assetTypes: ["Mystery Asset"], objective: "Something new" })).toBe("outbound");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/campaign-kind.test.ts`
Expected: FAIL — `classifyCampaignKind` is not exported from `@/domain`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/campaign-kind.ts`:

```typescript
export type CampaignKind = "outbound" | "internal";

/** Substrings that arc a real, partner/customer-facing outbound deliverable. */
const OUTBOUND_HINTS = ["email", "social", "landing", "sms", "letter", "newsletter"];

/** Substrings that arc internal CRM / list-building / enrichment work. */
const INTERNAL_HINTS = ["population", "crm lead list", "partner lead list", "lead list", "enrich", "discovery"];

/**
 * Classify a campaign as operator-facing OUTBOUND work or INTERNAL CRM/enrichment
 * batch work, from its (humanized) asset types and objective text. Any outbound
 * delivery channel wins. Unknown shapes default to "outbound" so a real campaign
 * is never hidden inside the collapsed internal fold.
 */
export function classifyCampaignKind(input: { assetTypes: string[]; objective: string }): CampaignKind {
  const haystacks = [...input.assetTypes, input.objective].map((value) => value.toLowerCase());
  const hasOutbound = haystacks.some((hay) => OUTBOUND_HINTS.some((hint) => hay.includes(hint)));
  if (hasOutbound) return "outbound";
  const hasInternal = haystacks.some((hay) => INTERNAL_HINTS.some((hint) => hay.includes(hint)));
  return hasInternal ? "internal" : "outbound";
}
```

Add to `src/domain/index.ts` (after the other exports):

```typescript
export * from "./campaign-kind";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/campaign-kind.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/campaign-kind.ts src/domain/index.ts src/domain/__tests__/campaign-kind.test.ts
git commit -m "feat(campaigns): classifyCampaignKind — internal vs outbound helper"
```

---

## Task 2: `formatWaitTime` formatter (TDD)

**Files:**
- Create: `src/app/campaigns/_components/format-wait-time.ts`
- Test: `src/app/campaigns/_components/__tests__/format-wait-time.test.ts`

A dedicated formatter (not the existing `relative-time.ts`, which switches to weekday/calendar labels past 2 days). For the queue we always want a *duration* so "9d" reads as waiting-urgency.

- [ ] **Step 1: Write the failing test**

Create `src/app/campaigns/_components/__tests__/format-wait-time.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { formatWaitTime } from "../format-wait-time";

const NOW = Date.parse("2026-06-10T12:00:00Z");

describe("formatWaitTime", () => {
  it("returns 'just now' under a minute", () => {
    expect(formatWaitTime("2026-06-10T11:59:30Z", NOW)).toBe("just now");
  });
  it("returns minutes under an hour", () => {
    expect(formatWaitTime("2026-06-10T11:30:00Z", NOW)).toBe("30m");
  });
  it("returns hours under a day", () => {
    expect(formatWaitTime("2026-06-10T08:00:00Z", NOW)).toBe("4h");
  });
  it("stays a day-count past a week (not a calendar date)", () => {
    expect(formatWaitTime("2026-06-01T12:00:00Z", NOW)).toBe("9d");
  });
  it("clamps future timestamps to 'just now'", () => {
    expect(formatWaitTime("2026-06-10T12:05:00Z", NOW)).toBe("just now");
  });
  it("returns empty string for unparseable input", () => {
    expect(formatWaitTime("not-a-date", NOW)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/campaigns/_components/__tests__/format-wait-time.test.ts`
Expected: FAIL — cannot find module `../format-wait-time`.

- [ ] **Step 3: Write the implementation**

Create `src/app/campaigns/_components/format-wait-time.ts`:

```typescript
/**
 * Compact elapsed-wait label for the approval queue: just now / 30m / 4h / 9d.
 * Unlike relative-time.ts it stays a duration past a week so the queue reads as
 * urgency, not a calendar date. `nowMs` is injectable for deterministic tests.
 */
export function formatWaitTime(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffMs = Math.max(0, nowMs - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/campaigns/_components/__tests__/format-wait-time.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/campaigns/_components/format-wait-time.ts src/app/campaigns/_components/__tests__/format-wait-time.test.ts
git commit -m "feat(campaigns): formatWaitTime duration formatter for the approval queue"
```

---

## Task 3: Expose raw ISO timestamp on the list item

**Files:**
- Modify: `src/lib/campaigns/read-model.ts` (type at ~line 49, assignment at ~line 454)

No unit test: this is a one-field pass-through of `campaign.updated_at` with no logic, and the read model has no fake-Supabase test harness. It's covered by the typecheck/build in Task 7 (the new code consumes `updatedAtIso`) and by the `library-model` tests in Task 4, which depend on the field existing.

- [ ] **Step 1: Add the field to the type**

In `src/lib/campaigns/read-model.ts`, in the `CampaignWorkspaceListItem` type, add `updatedAtIso` immediately after the existing `updatedAt: string;` line:

```typescript
  updatedAt: string;
  updatedAtIso: string;
  href: string;
```

- [ ] **Step 2: Populate it in the list mapper**

In the object returned inside `getCampaignWorkspaceList` (the `items = campaigns.map(...)` block), add the assignment right after the existing `updatedAt: formatDate(campaign.updated_at),` line:

```typescript
        updatedAt: formatDate(campaign.updated_at),
        updatedAtIso: campaign.updated_at,
        href: `/campaigns/${campaign.id}`,
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm lint`
Expected: no new errors from `read-model.ts`. (Full consumption is exercised in Task 7's build.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/campaigns/read-model.ts
git commit -m "feat(campaigns): expose raw updatedAtIso on workspace list item"
```

---

## Task 4: `library-model` — partition, sort, momentum counts (TDD)

**Files:**
- Create: `src/app/campaigns/_components/library-model.ts`
- Test: `src/app/campaigns/_components/__tests__/library-model.test.ts`

This module holds the composite list logic so it's testable without React.

- [ ] **Step 1: Write the failing test**

Create `src/app/campaigns/_components/__tests__/library-model.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { momentumCounts, partitionAwaiting } from "../library-model";

function item(overrides: Partial<CampaignWorkspaceListItem>): CampaignWorkspaceListItem {
  return {
    id: "c1",
    name: "Campaign",
    persona: "Plumbing Partner",
    status: "In review",
    lifecycle: "In review",
    pendingCount: 1,
    pendingDeliverables: [],
    objective: "",
    audienceSummary: "",
    offerSummary: "",
    whyBuilt: "",
    assetCount: 1,
    approvalCount: 1,
    mediaCount: 0,
    sourceCount: 0,
    thumbnailUrl: null,
    assetTypes: ["Email"],
    previewText: null,
    previewLabel: null,
    updatedAt: "Jun 10",
    updatedAtIso: "2026-06-10T12:00:00Z",
    href: "/campaigns/c1",
    ...overrides,
  };
}

describe("partitionAwaiting", () => {
  it("splits outbound from internal and sorts each longest-waiting first", () => {
    const items = [
      item({ id: "out-new", assetTypes: ["Email"], updatedAtIso: "2026-06-10T11:00:00Z" }),
      item({ id: "out-old", assetTypes: ["Social Ad"], updatedAtIso: "2026-06-01T11:00:00Z" }),
      item({ id: "int", assetTypes: ["Crm Population Batch"], objective: "populate", updatedAtIso: "2026-06-05T11:00:00Z" }),
    ];
    const { outbound, internal } = partitionAwaiting(items);
    expect(outbound.map((c) => c.id)).toEqual(["out-old", "out-new"]);
    expect(internal.map((c) => c.id)).toEqual(["int"]);
  });

  it("sorts items with unparseable timestamps last", () => {
    const items = [
      item({ id: "bad", assetTypes: ["Email"], updatedAtIso: "nope" }),
      item({ id: "good", assetTypes: ["Email"], updatedAtIso: "2026-06-01T11:00:00Z" }),
    ];
    expect(partitionAwaiting(items).outbound.map((c) => c.id)).toEqual(["good", "bad"]);
  });
});

describe("momentumCounts", () => {
  it("tallies each lifecycle", () => {
    const items = [
      item({ lifecycle: "Live" }),
      item({ lifecycle: "Live" }),
      item({ lifecycle: "In review" }),
      item({ lifecycle: "Drafting" }),
      item({ lifecycle: "Ready" }),
    ];
    expect(momentumCounts(items)).toEqual({ live: 2, awaiting: 1, drafts: 1, ready: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/campaigns/_components/__tests__/library-model.test.ts`
Expected: FAIL — cannot find module `../library-model`.

- [ ] **Step 3: Write the implementation**

Create `src/app/campaigns/_components/library-model.ts`:

```typescript
import { classifyCampaignKind } from "@/domain";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

export type AwaitingPartition = {
  outbound: CampaignWorkspaceListItem[];
  internal: CampaignWorkspaceListItem[];
};

export type MomentumCounts = { live: number; awaiting: number; drafts: number; ready: number };

/** Longest-waiting first; items with unparseable timestamps sort last. */
export function byWaitDesc(a: CampaignWorkspaceListItem, b: CampaignWorkspaceListItem): number {
  const ta = Date.parse(a.updatedAtIso);
  const tb = Date.parse(b.updatedAtIso);
  const va = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta;
  const vb = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb;
  return va - vb;
}

/** Split awaiting-approval items into outbound (full rows) and internal (CRM
 *  batch fold) buckets, each ordered longest-waiting first. */
export function partitionAwaiting(items: CampaignWorkspaceListItem[]): AwaitingPartition {
  const outbound: CampaignWorkspaceListItem[] = [];
  const internal: CampaignWorkspaceListItem[] = [];
  for (const item of items) {
    const kind = classifyCampaignKind({ assetTypes: item.assetTypes, objective: item.objective });
    (kind === "internal" ? internal : outbound).push(item);
  }
  return { outbound: outbound.sort(byWaitDesc), internal: internal.sort(byWaitDesc) };
}

/** Lifecycle tallies for the momentum strip. */
export function momentumCounts(items: CampaignWorkspaceListItem[]): MomentumCounts {
  const tally = (lifecycle: CampaignWorkspaceListItem["lifecycle"]) =>
    items.filter((item) => item.lifecycle === lifecycle).length;
  return { live: tally("Live"), awaiting: tally("In review"), drafts: tally("Drafting"), ready: tally("Ready") };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/campaigns/_components/__tests__/library-model.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/campaigns/_components/library-model.ts src/app/campaigns/_components/__tests__/library-model.test.ts
git commit -m "feat(campaigns): library-model — partition, wait-sort, momentum counts"
```

---

## Task 5: `MomentumStrip` presentational component

**Files:**
- Create: `src/app/campaigns/_components/momentum-strip.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/campaigns/_components/momentum-strip.tsx`:

```tsx
import type { MomentumCounts } from "./library-model";

/**
 * Slim lifecycle-momentum band above the queue. Built only from counts this read
 * model already has — engagement metrics (sent/opens) are a future addition and
 * are intentionally absent rather than faked.
 */
export function MomentumStrip({ counts }: { counts: MomentumCounts }) {
  const stats = [
    { label: "Live", value: counts.live },
    { label: "Ready", value: counts.ready },
    { label: "Drafts", value: counts.drafts },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-9 gap-y-3 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-soft)] px-5 py-3">
      {stats.map((stat) => (
        <div key={stat.label}>
          <div className="font-mono text-lg font-semibold tabular-nums text-[var(--text-primary)]">{stat.value}</div>
          <div className="text-[10px] uppercase tracking-[0.09em] text-[var(--text-muted)]">{stat.label}</div>
        </div>
      ))}
      <div className="ml-auto text-right">
        <div className="font-mono text-lg font-semibold tabular-nums text-[var(--accent)]">{counts.awaiting}</div>
        <div className="text-[10px] uppercase tracking-[0.09em] text-[var(--text-muted)]">Awaiting you</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm lint`
Expected: no errors in `momentum-strip.tsx`. (It's wired into the page in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/momentum-strip.tsx
git commit -m "feat(campaigns): MomentumStrip lifecycle band"
```

---

## Task 6: `CollapsedBatchGroup` client component

**Files:**
- Create: `src/app/campaigns/_components/collapsed-batch-group.tsx`

The internal CRM batches collapse here. It's the only interactive (expand/collapse) piece, so it's a client component. It imports the pure `formatWaitTime` and is given `nowMs` from the server render so the labels are stable.

- [ ] **Step 1: Write the component**

Create `src/app/campaigns/_components/collapsed-batch-group.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { formatWaitTime } from "./format-wait-time";

/** The collapsed fold for internal CRM-population batches. `items` are already
 *  sorted longest-waiting first by the caller. */
export function CollapsedBatchGroup({ items, nowMs }: { items: CampaignWorkspaceListItem[]; nowMs: number }) {
  const [open, setOpen] = useState(false);
  const oldest = items[0]; // caller sorts longest-waiting first
  const oldestWait = oldest ? formatWaitTime(oldest.updatedAtIso, nowMs) : "";

  return (
    <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-panel)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
        <span className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">CRM Population — {items.length} batches</span>
          <span className="text-[var(--text-muted)]"> · enrich {items.length} records from Arc&apos;s discovery crawl</span>
          {oldestWait ? <span className="text-[var(--accent)]"> · oldest waiting {oldestWait}</span> : null}
        </span>
        <span className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">{open ? "Collapse ▴" : "Expand ▾"}</span>
      </button>

      {open ? (
        <ul className="flex flex-col gap-1.5 border-t border-[var(--border-hairline)] px-3 py-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] px-3 py-2.5 transition hover:border-[var(--accent)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                    {item.persona} · {item.assetCount} asset{item.assetCount === 1 ? "" : "s"} · waiting {formatWaitTime(item.updatedAtIso, nowMs)}
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] group-hover:border-[var(--accent)] group-hover:text-[var(--text-primary)]">
                  Review
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm lint`
Expected: no errors in `collapsed-batch-group.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/collapsed-batch-group.tsx
git commit -m "feat(campaigns): CollapsedBatchGroup fold for internal CRM batches"
```

---

## Task 7: Assemble the enriched library

**Files:**
- Modify (full rewrite): `src/app/campaigns/_components/campaign-library.tsx`

Replaces the row body with the enriched layout (why line + wait-time, no "Drafted by Arc" chip), adds the content preview for outbound rows, partitions the *In review* group into outbound rows + internal fold, renders the momentum strip, and gives empty lifecycle groups a one-line affordance in the "All" view.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/app/campaigns/_components/campaign-library.tsx` with:

```tsx
import Link from "next/link";

import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { CollapsedBatchGroup } from "./collapsed-batch-group";
import { formatWaitTime } from "./format-wait-time";
import { momentumCounts, partitionAwaiting } from "./library-model";
import { MomentumStrip } from "./momentum-strip";

type Lifecycle = CampaignWorkspaceListItem["lifecycle"];

/**
 * The Campaigns library: an editorial list grouped by approval lifecycle. Work
 * awaiting the operator floats to the top, glows gold, and shows Arc's reasoning
 * plus a content preview so each row is decidable without opening it. Outbound
 * campaigns get the full treatment; internal CRM batches collapse into one fold.
 */

type GroupDef = {
  key: Lifecycle;
  label: string;
  dot: string;
  flag: boolean;
  pillLabel: string;
  pillClass: string;
  cta: string;
};

const GROUPS: GroupDef[] = [
  {
    key: "In review",
    label: "Awaiting your approval",
    dot: "var(--accent)",
    flag: true,
    pillLabel: "Needs you",
    pillClass: "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
    cta: "Review",
  },
  {
    key: "Ready",
    label: "Ready to launch",
    dot: "var(--ok)",
    flag: false,
    pillLabel: "Ready",
    pillClass: "border-[var(--ok-border-soft)] bg-[var(--ok-soft)] text-[var(--ok-text)]",
    cta: "Launch",
  },
  {
    key: "Live",
    label: "Live",
    dot: "var(--ok)",
    flag: false,
    pillLabel: "Live",
    pillClass: "border-[var(--ok-border-soft)] text-[var(--ok-text)]",
    cta: "Open",
  },
  {
    key: "Drafting",
    label: "Drafts in progress",
    dot: "var(--text-muted)",
    flag: false,
    pillLabel: "Draft",
    pillClass: "border-[var(--border-strong)] bg-[var(--surface-inset)] text-[var(--text-secondary)]",
    cta: "Open",
  },
];

const FILTERS: Array<{ key: "All" | Lifecycle; label: string }> = [
  { key: "All", label: "All" },
  { key: "In review", label: "Awaiting approval" },
  { key: "Ready", label: "Ready" },
  { key: "Live", label: "Live" },
  { key: "Drafting", label: "Drafts" },
];

const EMPTY_NOTE: Record<Lifecycle, string> = {
  "In review": "Nothing awaiting you — Arc's drafts will land here.",
  Ready: "Nothing ready yet — approved campaigns land here.",
  Live: "Nothing live yet — launched campaigns land here.",
  Drafting: "No drafts in progress.",
};

export function CampaignLibrary({
  campaigns,
  activeStatus,
}: {
  campaigns: CampaignWorkspaceListItem[];
  activeStatus: string;
}) {
  const nowMs = Date.now();
  const status: "All" | Lifecycle = (GROUPS.map((group) => group.key) as string[]).includes(activeStatus)
    ? (activeStatus as Lifecycle)
    : "All";

  const counts = campaigns.reduce<Record<string, number>>((acc, campaign) => {
    acc[campaign.lifecycle] = (acc[campaign.lifecycle] ?? 0) + 1;
    return acc;
  }, {});

  const showAll = status === "All";
  const visibleGroups = GROUPS.filter((group) => showAll || group.key === status).map((group) => ({
    group,
    items: campaigns.filter((campaign) => campaign.lifecycle === group.key),
  }));
  // In a specific-status view we hide empty groups; in "All" we keep them so the
  // pipeline shape (Awaiting → Ready → Live → Drafts) stays legible.
  const rendered = showAll ? visibleGroups : visibleGroups.filter((entry) => entry.items.length > 0);

  return (
    <div className="space-y-6">
      <MomentumStrip counts={momentumCounts(campaigns)} />

      <nav aria-label="Filter campaigns by lifecycle" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const count = filter.key === "All" ? campaigns.length : counts[filter.key] ?? 0;
          const active = status === filter.key;
          return (
            <Link
              key={filter.key}
              href={filter.key === "All" ? "/campaigns" : `/campaigns?status=${encodeURIComponent(filter.key)}`}
              aria-current={active ? "true" : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${
                active
                  ? "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "border-[var(--border-panel)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)]"
              }`}
            >
              {filter.label}
              <span className={`font-mono text-xs tabular-nums ${active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {rendered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
          No campaigns in this view.
        </p>
      ) : (
        rendered.map(({ group, items }) => (
          <section key={group.key} aria-label={group.label}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{group.label}</h2>
              <span className="h-px flex-1 bg-[var(--border-hairline)]" />
              <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{items.length}</span>
            </div>

            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--surface-soft)] px-4 py-3 text-xs text-[var(--text-muted)]">
                {EMPTY_NOTE[group.key]}
              </p>
            ) : group.key === "In review" ? (
              <AwaitingSection items={items} group={group} nowMs={nowMs} />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {items.map((campaign) => (
                  <li key={campaign.id}>
                    <CampaignRow campaign={campaign} group={group} nowMs={nowMs} showPreview={false} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}

/** The In-review group: outbound rows (with preview) above the internal CRM fold. */
function AwaitingSection({ items, group, nowMs }: { items: CampaignWorkspaceListItem[]; group: GroupDef; nowMs: number }) {
  const { outbound, internal } = partitionAwaiting(items);
  const split = outbound.length > 0 && internal.length > 0;

  return (
    <div className="space-y-4">
      {outbound.length > 0 ? (
        <div>
          {split ? <SubLabel>Outbound</SubLabel> : null}
          <ul className="flex flex-col gap-2.5">
            {outbound.map((campaign) => (
              <li key={campaign.id}>
                <CampaignRow campaign={campaign} group={group} nowMs={nowMs} showPreview />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {internal.length > 0 ? (
        <div>
          {split ? <SubLabel>Internal CRM work</SubLabel> : null}
          {internal.length === 1 ? (
            <ul className="flex flex-col gap-2.5">
              <li>
                <CampaignRow campaign={internal[0]} group={group} nowMs={nowMs} showPreview={false} />
              </li>
            </ul>
          ) : (
            <CollapsedBatchGroup items={internal} nowMs={nowMs} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{children}</div>;
}

function CampaignRow({
  campaign,
  group,
  nowMs,
  showPreview,
}: {
  campaign: CampaignWorkspaceListItem;
  group: GroupDef;
  nowMs: number;
  showPreview: boolean;
}) {
  const why = whyLine(campaign);
  const wait = formatWaitTime(campaign.updatedAtIso, nowMs);
  const hasPreview = showPreview && Boolean(campaign.previewText || campaign.thumbnailUrl);

  return (
    <Link
      href={campaign.href}
      className={`group flex items-stretch gap-4 rounded-xl border px-4 py-3.5 transition hover:translate-x-0.5 ${
        group.flag
          ? "border-[var(--accent-border-strong)] bg-[linear-gradient(90deg,var(--accent-soft),var(--surface-panel)_62%)] hover:border-[var(--accent)]"
          : "border-[var(--border-panel)] bg-[var(--surface-panel)] hover:border-[var(--border-strong)]"
      }`}
    >
      <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: group.dot }} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="truncate text-base font-medium tracking-[-0.005em] text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">
            {campaign.name}
          </span>
        </div>
        {why ? <p className="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">{why}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-muted)]">
          <span className="truncate">{targetLabel(campaign.persona)}</span>
          {channelSummary(campaign.assetTypes) ? (
            <>
              <Dot />
              <span className="truncate">{channelSummary(campaign.assetTypes)}</span>
            </>
          ) : null}
          <Dot />
          <span>
            {campaign.assetCount} asset{campaign.assetCount === 1 ? "" : "s"}
          </span>
          {wait ? (
            <>
              <Dot />
              <span className={group.flag ? "font-medium text-[var(--accent)]" : ""}>waiting {wait}</span>
            </>
          ) : null}
        </div>
      </div>

      {hasPreview ? <CampaignPreview campaign={campaign} /> : null}

      <span
        className={`hidden shrink-0 items-center gap-1.5 self-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] sm:inline-flex ${group.pillClass}`}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: group.dot }} />
        {group.pillLabel}
      </span>

      <span
        className={`shrink-0 self-center rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
          group.flag
            ? "bg-[var(--accent)] text-[var(--on-accent)] group-hover:bg-[var(--accent-strong)]"
            : "border border-[var(--border-strong)] text-[var(--text-secondary)] group-hover:border-[var(--accent)] group-hover:text-[var(--text-primary)]"
        }`}
      >
        {group.cta}
      </span>
    </Link>
  );
}

/** Outbound content peek — thumbnail if present, else label + preview text. */
function CampaignPreview({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  return (
    <div className="hidden w-[240px] shrink-0 self-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2.5 lg:block">
      {campaign.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={campaign.thumbnailUrl} alt="" className="h-16 w-full rounded object-cover" />
      ) : (
        <>
          {campaign.previewLabel ? (
            <div className="mb-1 text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{campaign.previewLabel}</div>
          ) : null}
          <p className="line-clamp-3 text-[11px] leading-snug text-[var(--text-secondary)]">{campaign.previewText}</p>
        </>
      )}
    </div>
  );
}

function whyLine(campaign: CampaignWorkspaceListItem): string {
  const why = campaign.whyBuilt?.trim();
  if (why) return why;
  const objective = campaign.objective?.trim();
  if (objective && objective !== "No objective captured yet.") return objective;
  return "";
}

function Dot() {
  return <span aria-hidden className="h-0.5 w-0.5 rounded-full bg-[var(--border-strong)]" />;
}

/** Distinct delivery channels for the row meta, e.g. "Email + Landing". */
function channelSummary(assetTypes: string[]) {
  const distinct = Array.from(new Set(assetTypes.map((type) => type.trim()).filter(Boolean)));
  if (distinct.length === 0) return "";
  if (distinct.length <= 2) return distinct.join(" + ");
  return `${distinct.slice(0, 2).join(" + ")} +${distinct.length - 2}`;
}

/** Strip the "Persona " prefix the read model sometimes carries. */
function targetLabel(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm lint`
Expected: PASS — no errors. (`React.ReactNode` is available globally via the Next/React types; no import needed.)

- [ ] **Step 3: Build to verify the route compiles**

Run: `pnpm build`
Expected: build succeeds; `/campaigns` route compiles with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/_components/campaign-library.tsx
git commit -m "feat(campaigns): enriched triage rows, outbound preview, CRM fold, momentum strip"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all tests green, including the three new files (`campaign-kind`, `format-wait-time`, `library-model`).

- [ ] **Step 2: Lint the whole project**

Run: `pnpm lint`
Expected: PASS — no errors.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `pnpm dev`, open `/campaigns`. Confirm: each awaiting row shows a "why" line and "waiting Xh/Xd"; outbound rows show a preview panel (≥ lg width); the four CRM-Population batches sit in one "Expand ▾" fold that opens; the momentum strip shows Live/Ready/Drafts/Awaiting counts; clicking a row opens its workspace.

---

## Self-Review

- **Spec coverage:**
  - §1 Enriched row (why + meta + wait-time, drop Arc chip) → Task 7 (`CampaignRow`, `whyLine`, `formatWaitTime`).
  - §2 Content preview, outbound-only → Task 7 (`CampaignPreview`, `showPreview` gating).
  - §3 Internal/outbound split + fold (+ single-batch-as-row) → Tasks 1, 4, 6, 7 (`classifyCampaignKind`, `partitionAwaiting`, `CollapsedBatchGroup`, `AwaitingSection`).
  - §4 Momentum header (lifecycle counts only; engagement deferred) → Tasks 4, 5, 7 (`momentumCounts`, `MomentumStrip`).
  - §5 Kept-as-is + empty-group affordances → Task 7 (`GROUPS`, `FILTERS`, `EMPTY_NOTE`, "All"-view rendering).
  - §6 Sort longest-waiting first → Task 4 (`byWaitDesc`).
  - Data wiring: `updatedAtIso` → Task 3; `classifyCampaignKind` primitives signature → Task 1.
- **Placeholder scan:** none — every step has full code/commands.
- **Type consistency:** `classifyCampaignKind({ assetTypes, objective })` (Task 1) is called identically in Task 4. `MomentumCounts` (Task 4) is consumed by `MomentumStrip` (Task 5) and produced by `momentumCounts` (Task 4), wired in Task 7. `formatWaitTime(iso, nowMs)` (Task 2) is called in Tasks 6 and 7. `updatedAtIso` (Task 3) is read by `byWaitDesc`/`CollapsedBatchGroup`/`CampaignRow`. `partitionAwaiting`/`AwaitingSection` shapes match.
- **Out-of-scope honored:** no inline/bulk approve, no engagement metrics, no workspace or backend changes.
```
