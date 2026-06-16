# Campaign Manager v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/campaigns` and `/campaigns/[campaignId]` into the approved Campaign Manager v4 experience: a plain-language campaign table with expandable previews, and a checklist-style individual campaign workspace.

**Architecture:** Keep the existing Supabase/read-model/actions layer and reshape the UI through focused presentation helpers and components. Add pure helper functions for status labels, destinations, next actions, saved-view filtering, and detail checklist rows, then consume those helpers from small campaign components.

**Tech Stack:** Next.js App Router server components, React client components, TypeScript, existing campaign read-model/actions, Vitest for pure helper coverage, existing CSS token system from `globals.css`/`DESIGN.md`.

---

## Scope Check

This plan covers one product surface: Campaigns. It includes the main campaign manager page and the individual campaign page because they share the same concepts and existing read-model. It does not build new external sending integrations, custom saved views, bulk sending, or a replacement Arc chat.

Before writing code in this repo, follow `AGENTS.md`: read the relevant guide in `node_modules/next/dist/docs/` for the Next.js APIs touched by the task. This implementation touches App Router pages, server components, client components, server actions, and `searchParams`, so read the App Router/server-components/server-actions docs that exist in this installed Next version before editing.

## File Structure

### Existing Files To Modify

- `src/app/campaigns/page.tsx`
  Keep the server page. Update header copy/actions and pass query/search state to the new manager component.

- `src/app/campaigns/_components/campaign-library.tsx`
  Replace the current grouped row UI with the Campaign Manager table, saved views, search, and expandable previews.

- `src/app/campaigns/_components/library-model.ts`
  Add pure helpers for campaign manager rows: saved-view filtering, plain status labels, content summaries, destinations, next steps, and preview readiness.

- `src/app/campaigns/_components/__tests__/library-model.test.ts`
  Extend existing tests for new helper behavior.

- `src/app/campaigns/[campaignId]/page.tsx`
  Keep data fetching. Pass existing detail data into the rewritten workspace.

- `src/app/campaigns/_components/campaign-workspace.tsx`
  Replace the 7-tab workspace with the checklist/content-table/detail-preview experience. Keep URL-derived selection where useful.

- `src/app/campaigns/_components/campaign-header.tsx`
  Simplify copy and actions to match the detail-page checklist flow.

- `src/app/campaigns/_components/sticky-decision-bar.tsx`
  Either remove from the new workspace or keep only if it still supports simple review/send behavior without duplicating controls.

### New Files To Create

- `src/app/campaigns/_components/campaign-manager-row.tsx`
  Focused client component for one table row plus expandable preview.

- `src/app/campaigns/_components/campaign-manager-preview.tsx`
  Pure presentational component for the expandable preview sections.

- `src/app/campaigns/_components/campaign-detail-model.ts`
  Pure helpers for detail checklist steps, content rows, simple destinations, readiness labels, and next actions.

- `src/app/campaigns/_components/__tests__/campaign-detail-model.test.ts`
  Tests for the detail helper functions.

- `src/app/campaigns/_components/campaign-content-table.tsx`
  Client component for selecting an asset/content row and showing the preview.

- `src/app/campaigns/_components/campaign-checklist.tsx`
  Presentational checklist component for review, approve, send/export, results.

- `src/app/campaigns/_components/campaign-right-rail.tsx`
  Presentational right rail for campaign summary, send/export readiness, Arc actions, and results.

### Existing Files To Leave Alone Unless Needed

- `src/lib/campaigns/read-model.ts`
  First pass should reuse existing fields. Modify only if a field is truly missing from the UI and cannot be derived safely.

- `src/app/campaigns/actions.ts`
  Existing approval, launch, deploy, and Arc actions should be reused. Avoid adding send/export actions in this phase.

- Existing tab components (`creative-tab.tsx`, `media-board.tsx`, `approvals-tab.tsx`, etc.)
  Do not delete in the first pass. They can remain unused until the new design proves out.

---

### Task 1: Add Campaign Manager Helper Model

**Files:**
- Modify: `src/app/campaigns/_components/library-model.ts`
- Modify: `src/app/campaigns/_components/__tests__/library-model.test.ts`

- [ ] **Step 1: Read installed Next docs before editing**

Run:

```powershell
Get-ChildItem -Path node_modules/next/dist/docs -Recurse -File |
  Select-String -Pattern "searchParams|Server Components|Client Components" -CaseSensitive:$false |
  Select-Object -First 20 Path,LineNumber,Line
```

Expected: Relevant installed docs paths are identified before code edits.

- [ ] **Step 2: Write failing tests for campaign manager helpers**

Add these tests to `src/app/campaigns/_components/__tests__/library-model.test.ts`:

```ts
import {
  campaignManagerSummary,
  campaignManagerStatus,
  campaignManagerWhere,
  campaignNextStep,
  filterCampaignManagerItems,
  managerViewCounts,
  type CampaignManagerView,
} from "../library-model";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

function campaign(overrides: Partial<CampaignWorkspaceListItem> = {}): CampaignWorkspaceListItem {
  return {
    id: overrides.id ?? "campaign-1",
    name: overrides.name ?? "Plumber referral campaign",
    persona: overrides.persona ?? "Persona Plumbing Partner",
    status: overrides.status ?? "Pending approval",
    lifecycle: overrides.lifecycle ?? "In review",
    pendingCount: overrides.pendingCount ?? 2,
    pendingDeliverables: overrides.pendingDeliverables ?? [],
    objective: overrides.objective ?? "Build partner-facing email and one-pager",
    audienceSummary: overrides.audienceSummary ?? "Plumbing partners who find water damage.",
    offerSummary: overrides.offerSummary ?? "Fast documentation and mitigation handoff.",
    whyBuilt: overrides.whyBuilt ?? "Arc found strong referral-fit partners.",
    assetCount: overrides.assetCount ?? 3,
    approvalCount: overrides.approvalCount ?? 2,
    mediaCount: overrides.mediaCount ?? 0,
    sourceCount: overrides.sourceCount ?? 1,
    thumbnailUrl: overrides.thumbnailUrl ?? null,
    assetTypes: overrides.assetTypes ?? ["email", "one_pager", "call_script"],
    driver: overrides.driver ?? "agent",
    channels: overrides.channels ?? ["Email", "Export"],
    previewText: overrides.previewText ?? "Subject: Fast help when plumbing jobs uncover water damage",
    previewLabel: overrides.previewLabel ?? "Email",
    updatedAt: overrides.updatedAt ?? "Jun 11, 2026, 3:00 PM",
    updatedAtIso: overrides.updatedAtIso ?? "2026-06-11T19:00:00.000Z",
    href: overrides.href ?? "/campaigns/campaign-1",
  };
}

describe("campaign manager helpers", () => {
  it.each<[
    CampaignWorkspaceListItem["lifecycle"],
    number,
    ReturnType<typeof campaignManagerStatus>,
  ]>([
    ["In review", 2, { label: "Review needed", tone: "amber" }],
    ["In review", 0, { label: "Ready", tone: "blue" }],
    ["Ready", 0, { label: "Ready", tone: "blue" }],
    ["Live", 0, { label: "Live", tone: "green" }],
    ["Drafting", 0, { label: "Arc drafting", tone: "gray" }],
  ])("maps lifecycle %s and pending %s to plain status", (lifecycle, pendingCount, expected) => {
    expect(campaignManagerStatus(campaign({ lifecycle, pendingCount }))).toEqual(expected);
  });

  it("summarizes content with review count", () => {
    expect(campaignManagerSummary(campaign({ assetCount: 3, pendingCount: 2 }))).toEqual({
      primary: "3 pieces",
      secondary: "2 need review",
    });
  });

  it("uses all-approved copy when no pieces need review", () => {
    expect(campaignManagerSummary(campaign({ assetCount: 3, pendingCount: 0 }))).toEqual({
      primary: "3 pieces",
      secondary: "all approved",
    });
  });

  it("maps asset types to plain where labels", () => {
    expect(campaignManagerWhere(campaign({ assetTypes: ["email", "social_ad", "landing_page", "one_pager"] }))).toEqual([
      "Email",
      "Social",
      "Website",
      "Export",
    ]);
  });

  it("derives the next step in plain language", () => {
    expect(campaignNextStep(campaign({ lifecycle: "In review", pendingCount: 2 }))).toBe("Review 2 pieces");
    expect(campaignNextStep(campaign({ lifecycle: "Ready", pendingCount: 0 }))).toBe("Send or export");
    expect(campaignNextStep(campaign({ lifecycle: "Live", pendingCount: 0 }))).toBe("Check results");
    expect(campaignNextStep(campaign({ lifecycle: "Drafting", pendingCount: 0 }))).toBe("Wait for Arc");
  });

  it("filters saved views", () => {
    const items = [
      campaign({ id: "review", lifecycle: "In review", pendingCount: 1 }),
      campaign({ id: "ready", lifecycle: "Ready", pendingCount: 0 }),
      campaign({ id: "live", lifecycle: "Live", pendingCount: 0 }),
      campaign({ id: "draft", lifecycle: "Drafting", pendingCount: 0 }),
    ];

    expect(filterCampaignManagerItems(items, "needs-attention").map((item) => item.id)).toEqual(["review"]);
    expect(filterCampaignManagerItems(items, "ready-to-send").map((item) => item.id)).toEqual(["ready"]);
    expect(filterCampaignManagerItems(items, "arc-working").map((item) => item.id)).toEqual(["draft"]);
    expect(filterCampaignManagerItems(items, "live").map((item) => item.id)).toEqual(["live"]);
    expect(filterCampaignManagerItems(items, "all").map((item) => item.id)).toEqual(["review", "ready", "live", "draft"]);
  });

  it("searches campaign text, audience, channels, and destinations", () => {
    const items = [
      campaign({ id: "plumber", name: "Plumber referral campaign", audienceSummary: "Plumbing partners", assetTypes: ["email"] }),
      campaign({ id: "storm", name: "Storm response ads", audienceSummary: "Homeowners", assetTypes: ["social_ad"] }),
    ];

    expect(filterCampaignManagerItems(items, "all", "plumbing").map((item) => item.id)).toEqual(["plumber"]);
    expect(filterCampaignManagerItems(items, "all", "social").map((item) => item.id)).toEqual(["storm"]);
  });

  it("counts manager views", () => {
    const counts = managerViewCounts([
      campaign({ id: "review", lifecycle: "In review", pendingCount: 1 }),
      campaign({ id: "ready", lifecycle: "Ready", pendingCount: 0 }),
      campaign({ id: "live", lifecycle: "Live", pendingCount: 0 }),
      campaign({ id: "draft", lifecycle: "Drafting", pendingCount: 0 }),
    ]);

    expect(counts satisfies Record<CampaignManagerView, number>).toEqual({
      "needs-attention": 1,
      all: 4,
      "ready-to-send": 1,
      "arc-working": 1,
      live: 1,
      archived: 0,
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
pnpm exec vitest run src/app/campaigns/_components/__tests__/library-model.test.ts
```

Expected: FAIL because `campaignManagerSummary`, `campaignManagerStatus`, `campaignManagerWhere`, `campaignNextStep`, `filterCampaignManagerItems`, and `managerViewCounts` are not exported yet.

- [ ] **Step 4: Implement the helper functions**

Add the following to `src/app/campaigns/_components/library-model.ts` after the existing exports:

```ts
export type CampaignManagerView = "needs-attention" | "all" | "ready-to-send" | "arc-working" | "live" | "archived";

export type CampaignManagerTone = "amber" | "blue" | "green" | "gray" | "red";

export type CampaignManagerStatus = {
  label: string;
  tone: CampaignManagerTone;
};

export type CampaignManagerSummary = {
  primary: string;
  secondary: string;
};

const WHERE_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  social_ad: "Social",
  meta_ad: "Social",
  paid_social: "Social",
  landing_page: "Website",
  website: "Website",
  one_pager: "Export",
  pdf: "Export",
  call_script: "CRM",
  script: "CRM",
  lead_list: "CRM",
};

export function campaignManagerStatus(campaign: CampaignWorkspaceListItem): CampaignManagerStatus {
  if (campaign.lifecycle === "Live") return { label: "Live", tone: "green" };
  if (campaign.lifecycle === "Drafting") return { label: "Arc drafting", tone: "gray" };
  if (campaign.lifecycle === "Ready") return { label: "Ready", tone: "blue" };
  if (campaign.pendingCount > 0) return { label: "Review needed", tone: "amber" };
  return { label: "Ready", tone: "blue" };
}

export function campaignManagerSummary(campaign: CampaignWorkspaceListItem): CampaignManagerSummary {
  const primary = `${campaign.assetCount} piece${campaign.assetCount === 1 ? "" : "s"}`;
  if (campaign.assetCount === 0) return { primary: "No content yet", secondary: "Arc is building" };
  if (campaign.pendingCount > 0) {
    return {
      primary,
      secondary: `${campaign.pendingCount} need${campaign.pendingCount === 1 ? "s" : ""} review`,
    };
  }
  return { primary, secondary: "all approved" };
}

export function campaignManagerWhere(campaign: CampaignWorkspaceListItem): string[] {
  const labels = campaign.assetTypes
    .map((type) => WHERE_LABELS[type] ?? campaign.channels.find((channel) => channel.toLowerCase() === type.toLowerCase()) ?? "")
    .filter(Boolean);
  const distinct = Array.from(new Set(labels));
  return distinct.length > 0 ? distinct.slice(0, 4) : ["Not chosen"];
}

export function campaignNextStep(campaign: CampaignWorkspaceListItem): string {
  if (campaign.pendingCount > 0) {
    return `Review ${campaign.pendingCount} piece${campaign.pendingCount === 1 ? "" : "s"}`;
  }
  if (campaign.lifecycle === "Ready") return "Send or export";
  if (campaign.lifecycle === "Live") return "Check results";
  if (campaign.lifecycle === "Drafting") return "Wait for Arc";
  if (campaign.assetCount === 0) return "Add content";
  return "Open campaign";
}

export function filterCampaignManagerItems(
  campaigns: CampaignWorkspaceListItem[],
  view: CampaignManagerView,
  query = "",
): CampaignWorkspaceListItem[] {
  const normalized = query.trim().toLowerCase();
  return campaigns.filter((campaign) => {
    if (!matchesManagerView(campaign, view)) return false;
    if (!normalized) return true;
    return campaignSearchText(campaign).includes(normalized);
  });
}

export function managerViewCounts(campaigns: CampaignWorkspaceListItem[]): Record<CampaignManagerView, number> {
  return {
    "needs-attention": campaigns.filter((campaign) => matchesManagerView(campaign, "needs-attention")).length,
    all: campaigns.length,
    "ready-to-send": campaigns.filter((campaign) => matchesManagerView(campaign, "ready-to-send")).length,
    "arc-working": campaigns.filter((campaign) => matchesManagerView(campaign, "arc-working")).length,
    live: campaigns.filter((campaign) => matchesManagerView(campaign, "live")).length,
    archived: campaigns.filter((campaign) => matchesManagerView(campaign, "archived")).length,
  };
}

function matchesManagerView(campaign: CampaignWorkspaceListItem, view: CampaignManagerView): boolean {
  if (view === "all") return true;
  if (view === "needs-attention") return campaign.pendingCount > 0 || campaign.lifecycle === "In review";
  if (view === "ready-to-send") return campaign.lifecycle === "Ready";
  if (view === "arc-working") return campaign.lifecycle === "Drafting";
  if (view === "live") return campaign.lifecycle === "Live";
  return /archived/i.test(campaign.status);
}

function campaignSearchText(campaign: CampaignWorkspaceListItem): string {
  return [
    campaign.name,
    campaign.persona,
    campaign.objective,
    campaign.audienceSummary,
    campaign.offerSummary,
    campaign.whyBuilt,
    campaign.status,
    campaign.lifecycle,
    ...campaign.assetTypes,
    ...campaign.channels,
    ...campaignManagerWhere(campaign),
  ]
    .join(" ")
    .toLowerCase();
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```powershell
pnpm exec vitest run src/app/campaigns/_components/__tests__/library-model.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```powershell
git add -- src/app/campaigns/_components/library-model.ts src/app/campaigns/_components/__tests__/library-model.test.ts
git diff --cached --name-only
git commit -m "feat(campaigns): add campaign manager model helpers"
```

Expected staged files:

```text
src/app/campaigns/_components/__tests__/library-model.test.ts
src/app/campaigns/_components/library-model.ts
```

---

### Task 2: Build Campaign Manager Table And Expandable Preview

**Files:**
- Modify: `src/app/campaigns/page.tsx`
- Modify: `src/app/campaigns/_components/campaign-library.tsx`
- Create: `src/app/campaigns/_components/campaign-manager-row.tsx`
- Create: `src/app/campaigns/_components/campaign-manager-preview.tsx`

- [ ] **Step 1: Update the server page header and query parsing**

Modify `src/app/campaigns/page.tsx` so it passes `view` and `q` into `CampaignLibrary` and uses plain product copy:

```tsx
import Link from "next/link";

import { connection } from "next/server";

import { buttonClasses, EmptyState, PageHeader, StatusPill } from "../_components/page-header";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import type { CampaignManagerView } from "./_components/library-model";

import { CampaignLibrary } from "./_components/campaign-library";

type CampaignsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  await connection();

  const params = await searchParams;
  const list = await getCampaignWorkspaceList();

  if (list.status === "unavailable") {
    return (
      <>
        <CampaignsHeader pendingCount={0} />
        <EmptyState title="Campaign workspace unavailable" detail={list.message} />
      </>
    );
  }

  const { campaigns } = list;
  const pendingCount = campaigns.filter((campaign) => campaign.pendingCount > 0 || campaign.lifecycle === "In review").length;

  return (
    <>
      <CampaignsHeader pendingCount={pendingCount} />

      {campaigns.length > 0 ? (
        <CampaignLibrary campaigns={campaigns} activeView={getViewParam(params.view)} query={getParam(params.q)} />
      ) : (
        <EmptyState
          title="No campaigns yet"
          detail="Create one yourself or ask Arc to build a campaign package. Campaigns will show their content, review status, and send/export options here."
        />
      )}
    </>
  );
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getViewParam(value: string | string[] | undefined): CampaignManagerView {
  const raw = getParam(value);
  if (raw === "all" || raw === "ready-to-send" || raw === "arc-working" || raw === "live" || raw === "archived") return raw;
  return "needs-attention";
}

function CampaignsHeader({ pendingCount }: { pendingCount: number }) {
  return (
    <PageHeader
      eyebrow="Campaign manager"
      title="Campaigns"
      description="Manage all campaigns, content, approvals, and send/export steps from one place."
      aside={
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {pendingCount > 0 ? <StatusPill tone="amber">{pendingCount} need attention</StatusPill> : <StatusPill tone="green">Nothing waiting</StatusPill>}
          <Link href="/campaigns/new" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Create campaign
          </Link>
          <Link href="/campaigns/new?mode=arc" className={buttonClasses({ size: "sm" })}>
            Ask Arc
          </Link>
        </div>
      }
    />
  );
}
```

- [ ] **Step 2: Create the expandable preview component**

Create `src/app/campaigns/_components/campaign-manager-preview.tsx`:

```tsx
import Link from "next/link";

import { buttonClasses } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { campaignManagerWhere, campaignNextStep } from "./library-model";

export function CampaignManagerPreview({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  const where = campaignManagerWhere(campaign);
  const nextStep = campaignNextStep(campaign);

  return (
    <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-4 sm:px-5">
      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.9fr_0.8fr]">
        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Campaign preview</h3>
          <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{campaign.whyBuilt || campaign.objective}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={campaign.href} className={buttonClasses({ size: "sm" })}>
              Open full page
            </Link>
            <Link href={`${campaign.href}?focus=arc`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Ask Arc
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">What is inside</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {campaign.assetTypes.length > 0 ? (
              campaign.assetTypes.slice(0, 4).map((type) => (
                <div key={type} className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2.5 py-2 text-xs">
                  <strong className="block text-[var(--text-primary)]">{humanize(type)}</strong>
                  <span className="text-[var(--text-muted)]">Content piece</span>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2.5 py-2 text-xs text-[var(--text-muted)]">
                Arc is still building the content.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Can it go out?</h3>
          <dl className="mt-2 space-y-2 text-sm">
            <PreviewFact label="Destinations" value={where.join(", ")} />
            <PreviewFact label="Ready pieces" value={campaign.pendingCount > 0 ? "Not yet" : "Ready"} />
            <PreviewFact label="Best next step" value={nextStep} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-[var(--border-hairline)] pt-2 first:border-t-0 first:pt-0">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
```

- [ ] **Step 3: Create the campaign manager row component**

Create `src/app/campaigns/_components/campaign-manager-row.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import {
  campaignManagerStatus,
  campaignManagerSummary,
  campaignManagerWhere,
  campaignNextStep,
  type CampaignManagerTone,
} from "./library-model";
import { CampaignManagerPreview } from "./campaign-manager-preview";

const TONE: Record<CampaignManagerTone, "amber" | "blue" | "green" | "gray" | "red"> = {
  amber: "amber",
  blue: "blue",
  green: "green",
  gray: "gray",
  red: "red",
};

export function CampaignManagerRow({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  const [expanded, setExpanded] = useState(false);
  const status = campaignManagerStatus(campaign);
  const summary = campaignManagerSummary(campaign);
  const where = campaignManagerWhere(campaign);
  const nextStep = campaignNextStep(campaign);

  return (
    <article className="overflow-hidden border-b border-[var(--border-hairline)] last:border-b-0">
      <div className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[34px_minmax(220px,1.5fr)_120px_130px_120px_minmax(150px,1fr)_88px] md:items-center">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${campaign.name}`}
          onClick={() => setExpanded((value) => !value)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] font-mono text-sm font-bold text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          {expanded ? "⌄" : "›"}
        </button>

        <div className="min-w-0">
          <Link href={campaign.href} className="font-bold text-[var(--text-primary)] transition hover:text-[var(--accent)]">
            {campaign.name}
          </Link>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
            {campaign.audienceSummary || campaign.objective}
          </p>
        </div>

        <StatusPill tone={TONE[status.tone]}>{status.label}</StatusPill>

        <div className="text-xs leading-5 text-[var(--text-secondary)]">
          <div className="font-semibold text-[var(--text-primary)]">{summary.primary}</div>
          <div>{summary.secondary}</div>
        </div>

        <div className="text-xs leading-5 text-[var(--text-secondary)]">{where.slice(0, 2).join(", ")}</div>

        <div className="text-xs font-bold leading-5 text-[var(--text-primary)]">{nextStep}</div>

        <Link href={campaign.href} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          Open
        </Link>
      </div>

      {expanded ? <CampaignManagerPreview campaign={campaign} /> : null}
    </article>
  );
}
```

- [ ] **Step 4: Replace `CampaignLibrary` with manager layout**

Replace `src/app/campaigns/_components/campaign-library.tsx` with:

```tsx
import Link from "next/link";

import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { CampaignManagerRow } from "./campaign-manager-row";
import {
  filterCampaignManagerItems,
  managerViewCounts,
  type CampaignManagerView,
} from "./library-model";

const VIEWS: Array<{ key: CampaignManagerView; label: string }> = [
  { key: "needs-attention", label: "Needs attention" },
  { key: "all", label: "All campaigns" },
  { key: "ready-to-send", label: "Ready to send" },
  { key: "arc-working", label: "Arc is working" },
  { key: "live", label: "Live" },
  { key: "archived", label: "Archived" },
];

export function CampaignLibrary({
  campaigns,
  activeView,
  query,
}: {
  campaigns: CampaignWorkspaceListItem[];
  activeView: CampaignManagerView;
  query: string;
}) {
  const counts = managerViewCounts(campaigns);
  const visible = filterCampaignManagerItems(campaigns, activeView, query);

  return (
    <div className="space-y-4">
      <form action="/campaigns" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <input type="hidden" name="view" value={activeView} />
        <label className="sr-only" htmlFor="campaign-search">
          Search campaigns
        </label>
        <input
          id="campaign-search"
          name="q"
          defaultValue={query}
          placeholder="Search campaigns, content, audience, company, platform, or status..."
          className="min-h-11 rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
        />
        <button
          type="submit"
          className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]"
        >
          Search
        </button>
      </form>

      <nav aria-label="Campaign views" className="flex flex-wrap gap-2">
        {VIEWS.map((view) => {
          const active = view.key === activeView;
          const href = buildHref(view.key, query);
          return (
            <Link
              key={view.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "border-[var(--border-panel)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)]"
              }`}
            >
              {view.label}
              <span className={`font-mono text-xs tabular-nums ${active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                {counts[view.key]}
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="hidden border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] md:grid md:grid-cols-[34px_minmax(220px,1.5fr)_120px_130px_120px_minmax(150px,1fr)_88px] md:gap-3">
          <span />
          <span>Campaign</span>
          <span>Status</span>
          <span>Content</span>
          <span>Where</span>
          <span>Next step</span>
          <span />
        </div>

        {visible.length > 0 ? (
          visible.map((campaign) => <CampaignManagerRow key={campaign.id} campaign={campaign} />)
        ) : (
          <div className="px-5 py-10 text-center">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">No campaigns in this view</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Try another view or clear the search.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function buildHref(view: CampaignManagerView, query: string) {
  const params = new URLSearchParams();
  if (view !== "needs-attention") params.set("view", view);
  if (query.trim()) params.set("q", query.trim());
  const qs = params.toString();
  return qs ? `/campaigns?${qs}` : "/campaigns";
}
```

- [ ] **Step 5: Run targeted tests and typecheck**

Run:

```powershell
pnpm exec vitest run src/app/campaigns/_components/__tests__/library-model.test.ts
pnpm exec tsc --noEmit --pretty false
```

Expected: Vitest PASS and TypeScript PASS. If `tsc` reports unrelated existing errors, record the exact file and run a narrower validation:

```powershell
pnpm exec vitest run src/app/campaigns/_components/__tests__/library-model.test.ts
pnpm build
```

- [ ] **Step 6: Commit Task 2**

Run:

```powershell
git add -- src/app/campaigns/page.tsx src/app/campaigns/_components/campaign-library.tsx src/app/campaigns/_components/campaign-manager-row.tsx src/app/campaigns/_components/campaign-manager-preview.tsx
git diff --cached --name-only
git commit -m "feat(campaigns): add campaign manager table"
```

Expected staged files:

```text
src/app/campaigns/_components/campaign-library.tsx
src/app/campaigns/_components/campaign-manager-preview.tsx
src/app/campaigns/_components/campaign-manager-row.tsx
src/app/campaigns/page.tsx
```

---

### Task 3: Add Campaign Detail Helper Model

**Files:**
- Create: `src/app/campaigns/_components/campaign-detail-model.ts`
- Create: `src/app/campaigns/_components/__tests__/campaign-detail-model.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/campaigns/_components/__tests__/campaign-detail-model.test.ts`:

```ts
import {
  buildCampaignChecklist,
  buildCampaignContentRows,
  buildSendExportFacts,
  contentStatus,
  contentWhere,
} from "../campaign-detail-model";
import type { CampaignWorkspaceAsset, LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

function asset(overrides: Partial<CampaignWorkspaceAsset> = {}): CampaignWorkspaceAsset {
  return {
    id: overrides.id ?? "asset-1",
    title: overrides.title ?? "Email draft",
    assetType: overrides.assetType ?? "email",
    category: overrides.category ?? "virtual",
    channel: overrides.channel ?? "email",
    status: overrides.status ?? "pending_approval",
    body: overrides.body ?? "Email body",
    preview: overrides.preview ?? "Subject: Hello",
    complianceNotes: overrides.complianceNotes ?? "No issues",
    dispatchLocked: overrides.dispatchLocked ?? true,
    toolSource: overrides.toolSource ?? "arc",
    updatedAt: overrides.updatedAt ?? "Jun 11, 2026",
    media: overrides.media ?? [],
    revision: overrides.revision ?? null,
    approval: overrides.approval ?? { id: "approval-1", status: "pending_owner_approval" },
  };
}

function detail(overrides: Partial<LiveCampaignWorkspace> = {}): LiveCampaignWorkspace {
  const assets = overrides.assets ?? [asset(), asset({ id: "asset-2", title: "One-pager", assetType: "one_pager", status: "approved", dispatchLocked: false })];
  return {
    status: "live",
    campaign: {
      id: "campaign-1",
      name: "Plumber referral campaign",
      persona: "Plumbing Partner",
      restorationFocus: "Flood",
      status: "Pending approval",
      objective: "Create partner referral content.",
      audienceSummary: "Plumbing partners.",
      offerSummary: "Fast handoff.",
      complianceNotes: "Coverage neutral.",
      owner: "Evan",
      launchLocked: true,
      createdAt: "Jun 10, 2026",
      updatedAt: "Jun 11, 2026",
    },
    assets,
    groupedAssets: {},
    approvals: [],
    media: [],
    sources: [],
    activity: [],
    events: [],
    reasoning: { whyBuilt: "Referral fit.", recommendedAction: "Review.", guardrailFlags: [], toolsUsed: [], promptInputs: [] },
    executiveOverview: { what: "Campaign brief.", why: "Referral fit.", timeframe: "This week.", where: "Email.", successTracking: "Replies." },
    metrics: { assets: assets.length, approvals: 1, media: 0, sources: 0 },
    launchState: { requiredCount: assets.length, approvedCount: 1, pendingCount: 1, deployedCount: 0, ready: false, live: false, lifecycle: "In review" },
    markConversation: [],
    approvalHistory: [],
    auditLog: [],
    ...overrides,
  };
}

describe("campaign detail model", () => {
  it("maps asset status to plain labels", () => {
    expect(contentStatus(asset({ status: "pending_approval", dispatchLocked: true }))).toEqual({ label: "Review", tone: "amber" });
    expect(contentStatus(asset({ status: "approved", dispatchLocked: false }))).toEqual({ label: "Ready", tone: "blue" });
    expect(contentStatus(asset({ status: "deployed", dispatchLocked: false }))).toEqual({ label: "Live", tone: "green" });
    expect(contentStatus(asset({ status: "revision_requested", dispatchLocked: true }))).toEqual({ label: "Blocked", tone: "red" });
  });

  it("maps content to plain destinations", () => {
    expect(contentWhere(asset({ assetType: "email", channel: "email" }))).toBe("Email");
    expect(contentWhere(asset({ assetType: "social_ad", channel: "meta" }))).toBe("Social");
    expect(contentWhere(asset({ assetType: "landing_page", channel: "web" }))).toBe("Website");
    expect(contentWhere(asset({ assetType: "one_pager", channel: "pdf" }))).toBe("Export");
    expect(contentWhere(asset({ assetType: "call_script", channel: "crm" }))).toBe("CRM");
  });

  it("builds content rows with next actions", () => {
    expect(buildCampaignContentRows(detail()).map((row) => ({ title: row.title, status: row.status.label, where: row.where, nextAction: row.nextAction }))).toEqual([
      { title: "Email draft", status: "Review", where: "Email", nextAction: "Approve or ask Arc to revise" },
      { title: "One-pager", status: "Ready", where: "Export", nextAction: "Can be sent or exported" },
    ]);
  });

  it("builds checklist steps from launch state", () => {
    expect(buildCampaignChecklist(detail()).map((step) => ({ label: step.label, state: step.state }))).toEqual([
      { label: "Review content", state: "active" },
      { label: "Approve pieces", state: "active" },
      { label: "Send or export", state: "locked" },
      { label: "Watch results", state: "locked" },
    ]);
  });

  it("builds send/export facts", () => {
    expect(buildSendExportFacts(detail())).toEqual([
      { label: "Email", value: "Blocked" },
      { label: "Export", value: "Ready" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm exec vitest run src/app/campaigns/_components/__tests__/campaign-detail-model.test.ts
```

Expected: FAIL because `campaign-detail-model.ts` does not exist.

- [ ] **Step 3: Implement detail helpers**

Create `src/app/campaigns/_components/campaign-detail-model.ts`:

```ts
import type { CampaignWorkspaceAsset, LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

export type PlainTone = "amber" | "blue" | "green" | "gray" | "red";

export type PlainStatus = {
  label: "Review" | "Ready" | "Live" | "Draft" | "Blocked";
  tone: PlainTone;
};

export type ChecklistStep = {
  label: "Review content" | "Approve pieces" | "Send or export" | "Watch results";
  detail: string;
  state: "done" | "active" | "locked";
};

export type CampaignContentRow = {
  id: string;
  title: string;
  description: string;
  status: PlainStatus;
  where: string;
  nextAction: string;
  preview: string;
};

export type SendExportFact = {
  label: string;
  value: "Ready" | "Blocked" | "Not connected" | "Sent" | "Live";
};

export function contentStatus(asset: CampaignWorkspaceAsset): PlainStatus {
  const status = asset.status.toLowerCase();
  if (status.includes("deployed") || status.includes("sent") || status.includes("live")) return { label: "Live", tone: "green" };
  if (status.includes("revision") || status.includes("declined") || status.includes("blocked")) return { label: "Blocked", tone: "red" };
  if (!asset.dispatchLocked || status.includes("approved")) return { label: "Ready", tone: "blue" };
  if (status.includes("draft")) return { label: "Draft", tone: "gray" };
  return { label: "Review", tone: "amber" };
}

export function contentWhere(asset: CampaignWorkspaceAsset): string {
  const value = `${asset.assetType} ${asset.channel}`.toLowerCase();
  if (/email/.test(value)) return "Email";
  if (/sms|text/.test(value)) return "SMS";
  if (/social|meta|facebook|instagram|ad/.test(value)) return "Social";
  if (/landing|website|web/.test(value)) return "Website";
  if (/one.pager|pdf|print|packet|file/.test(value)) return "Export";
  if (/call|script|crm|lead/.test(value)) return "CRM";
  return "Export";
}

export function buildCampaignContentRows(detail: LiveCampaignWorkspace): CampaignContentRow[] {
  return detail.assets.map((asset) => {
    const status = contentStatus(asset);
    return {
      id: asset.id,
      title: asset.title,
      description: describeAsset(asset),
      status,
      where: contentWhere(asset),
      nextAction: nextActionForStatus(status),
      preview: asset.preview || asset.body || "No preview available yet.",
    };
  });
}

export function buildCampaignChecklist(detail: LiveCampaignWorkspace): ChecklistStep[] {
  const { pendingCount, approvedCount, ready, live } = detail.launchState;
  return [
    {
      label: "Review content",
      detail: pendingCount > 0 ? `${pendingCount} piece${pendingCount === 1 ? "" : "s"} need review.` : "All content has been reviewed.",
      state: pendingCount > 0 ? "active" : "done",
    },
    {
      label: "Approve pieces",
      detail: `${approvedCount} approved.`,
      state: pendingCount > 0 ? "active" : "done",
    },
    {
      label: "Send or export",
      detail: ready || live ? "Ready content can be sent or exported." : "Approve content first.",
      state: live ? "done" : ready ? "active" : "locked",
    },
    {
      label: "Watch results",
      detail: live ? "Results are available as they come in." : "Results appear after sending.",
      state: live ? "active" : "locked",
    },
  ];
}

export function buildSendExportFacts(detail: LiveCampaignWorkspace): SendExportFact[] {
  const byWhere = new Map<string, SendExportFact["value"]>();
  for (const asset of detail.assets) {
    const where = contentWhere(asset);
    const status = contentStatus(asset);
    const value: SendExportFact["value"] = status.label === "Live" ? "Live" : status.label === "Ready" ? "Ready" : "Blocked";
    const existing = byWhere.get(where);
    if (!existing || existing === "Ready" || value === "Blocked") byWhere.set(where, value);
  }
  return Array.from(byWhere, ([label, value]) => ({ label, value }));
}

function describeAsset(asset: CampaignWorkspaceAsset): string {
  const where = contentWhere(asset).toLowerCase();
  if (where === "email") return "Email content for this campaign.";
  if (where === "social") return "Social content for this campaign.";
  if (where === "website") return "Website copy for this campaign.";
  if (where === "crm") return "Follow-up content for this campaign.";
  return "Exportable content for this campaign.";
}

function nextActionForStatus(status: PlainStatus): string {
  if (status.label === "Review") return "Approve or ask Arc to revise";
  if (status.label === "Ready") return "Can be sent or exported";
  if (status.label === "Live") return "Check results";
  if (status.label === "Blocked") return "Ask Arc to revise";
  return "Wait for Arc";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
pnpm exec vitest run src/app/campaigns/_components/__tests__/campaign-detail-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add -- src/app/campaigns/_components/campaign-detail-model.ts src/app/campaigns/_components/__tests__/campaign-detail-model.test.ts
git diff --cached --name-only
git commit -m "feat(campaigns): add campaign detail model helpers"
```

Expected staged files:

```text
src/app/campaigns/_components/__tests__/campaign-detail-model.test.ts
src/app/campaigns/_components/campaign-detail-model.ts
```

---

### Task 4: Rewrite Individual Campaign Page As Checklist Workspace

**Files:**
- Modify: `src/app/campaigns/_components/campaign-workspace.tsx`
- Modify: `src/app/campaigns/_components/campaign-header.tsx`
- Create: `src/app/campaigns/_components/campaign-checklist.tsx`
- Create: `src/app/campaigns/_components/campaign-content-table.tsx`
- Create: `src/app/campaigns/_components/campaign-right-rail.tsx`
- Optional modify: `src/app/campaigns/[campaignId]/page.tsx`

- [ ] **Step 1: Create checklist component**

Create `src/app/campaigns/_components/campaign-checklist.tsx`:

```tsx
import type { ChecklistStep } from "./campaign-detail-model";

const STATE_CLASS: Record<ChecklistStep["state"], string> = {
  done: "border-[var(--ok-border-soft)] bg-[var(--ok-soft)]",
  active: "border-[var(--accent-border-strong)] bg-[var(--accent-soft)]",
  locked: "border-[var(--border-hairline)] bg-[var(--surface-inset)]",
};

export function CampaignChecklist({ steps }: { steps: ChecklistStep[] }) {
  return (
    <section aria-label="Campaign progress" className="grid gap-2 md:grid-cols-4">
      {steps.map((step, index) => (
        <article key={step.label} className={`rounded-lg border p-3 ${STATE_CLASS[step.state]}`}>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Step {index + 1}</div>
          <h2 className="mt-1 text-sm font-bold text-[var(--text-primary)]">{step.label}</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{step.detail}</p>
        </article>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Create content table component**

Create `src/app/campaigns/_components/campaign-content-table.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";

import { Button, StatusPill } from "@/app/_components/page-header";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

import { buildCampaignContentRows, type CampaignContentRow, type PlainTone } from "./campaign-detail-model";

const TONE: Record<PlainTone, "amber" | "blue" | "green" | "gray" | "red"> = {
  amber: "amber",
  blue: "blue",
  green: "green",
  gray: "gray",
  red: "red",
};

export function CampaignContentTable({ detail }: { detail: LiveCampaignWorkspace }) {
  const rows = useMemo(() => buildCampaignContentRows(detail), [detail]);
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? "");
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;

  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-6 text-center">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">No content yet</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Arc is still building this campaign. Content will appear here for review.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="hidden border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] md:grid md:grid-cols-[minmax(180px,1.2fr)_110px_110px_minmax(180px,1fr)_78px] md:gap-3">
          <span>Content</span>
          <span>Status</span>
          <span>Where</span>
          <span>What to do</span>
          <span />
        </div>
        {rows.map((row) => (
          <ContentRow key={row.id} row={row} selected={row.id === selected?.id} onSelect={() => setSelectedId(row.id)} />
        ))}
      </div>

      {selected ? <ContentPreview row={selected} /> : null}
    </section>
  );
}

function ContentRow({ row, selected, onSelect }: { row: CampaignContentRow; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full gap-3 border-b border-[var(--border-hairline)] px-4 py-3 text-left text-sm transition last:border-b-0 md:grid-cols-[minmax(180px,1.2fr)_110px_110px_minmax(180px,1fr)_78px] md:items-center ${
        selected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-inset)]"
      }`}
    >
      <span>
        <strong className="block text-[var(--text-primary)]">{row.title}</strong>
        <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{row.description}</span>
      </span>
      <StatusPill tone={TONE[row.status.tone]}>{row.status.label}</StatusPill>
      <span className="text-xs font-semibold text-[var(--text-secondary)]">{row.where}</span>
      <span className="text-xs font-semibold text-[var(--text-primary)]">{row.nextAction}</span>
      <span className="text-xs font-bold text-[var(--accent)]">{selected ? "Viewing" : "View"}</span>
    </button>
  );
}

function ContentPreview({ row }: { row: CampaignContentRow }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">{row.title} preview</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{row.where}</p>
        </div>
        <StatusPill tone={TONE[row.status.tone]}>{row.status.label}</StatusPill>
      </div>
      <div className="px-4 py-4">
        <p className="whitespace-pre-wrap rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-sm leading-6 text-[var(--text-secondary)]">
          {row.preview}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={row.status.label !== "Review"}>
            Approve
          </Button>
          <Button type="button" variant="ghost" size="sm">
            Ask Arc to revise
          </Button>
        </div>
      </div>
    </article>
  );
}
```

Note: The buttons are intentionally non-wired in this task if existing approve/revision forms require asset-specific form state. If implementation wires them, use existing `decideAssetAction` and `requestRevisionAction`; do not add new backend actions.

- [ ] **Step 3: Create right rail component**

Create `src/app/campaigns/_components/campaign-right-rail.tsx`:

```tsx
import Link from "next/link";

import { buttonClasses } from "@/app/_components/page-header";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

import { buildSendExportFacts } from "./campaign-detail-model";

export function CampaignRightRail({ detail }: { detail: LiveCampaignWorkspace }) {
  const facts = buildSendExportFacts(detail);
  const { campaign, launchState } = detail;

  return (
    <aside className="space-y-3">
      <Panel title="Campaign summary">
        <Fact label="Audience" value={campaign.audienceSummary} />
        <Fact label="Purpose" value={campaign.objective} />
        <Fact label="Owner" value={campaign.owner} />
        <Fact label="Status" value={launchState.lifecycle === "In review" ? "Needs review" : launchState.lifecycle} />
      </Panel>

      <Panel title="Send / export">
        {facts.length > 0 ? facts.map((fact) => <Fact key={fact.label} label={fact.label} value={fact.value} />) : <p className="text-sm text-[var(--text-secondary)]">No send or export options yet.</p>}
      </Panel>

      <Panel title="Arc">
        <p className="text-sm leading-5 text-[var(--text-secondary)]">Ask Arc to revise selected content, add missing pieces, summarize this campaign, or create a new version.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/campaigns/${campaign.id}?focus=arc`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Ask Arc
          </Link>
        </div>
      </Panel>

      <Panel title="Results">
        <p className="text-sm leading-5 text-[var(--text-secondary)]">
          {launchState.live ? "Results will appear here as replies, sends, tasks, leads, or outcomes are recorded." : "Results appear after the campaign goes live."}
        </p>
      </Panel>
    </aside>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
      <h2 className="text-sm font-bold text-[var(--text-primary)]">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-[var(--border-hairline)] pt-2 first:border-t-0 first:pt-0">
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd className="max-w-[60%] text-right text-sm font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Simplify campaign header**

Modify `src/app/campaigns/_components/campaign-header.tsx`:

```tsx
import { PageHeader, StatusPill, buttonClasses } from "@/app/_components/page-header";
import type { CampaignLaunchState, CampaignWorkspaceMeta } from "@/lib/campaigns/read-model";
import Link from "next/link";

const LIFECYCLE_TONE: Record<CampaignLaunchState["lifecycle"], "blue" | "green" | "amber" | "gray"> = {
  Drafting: "gray",
  "In review": "amber",
  Ready: "blue",
  Live: "green",
};

export function CampaignHeader({ campaign, launchState }: { campaign: CampaignWorkspaceMeta; launchState: CampaignLaunchState }) {
  const statusLabel = launchState.lifecycle === "In review" ? "Needs review" : launchState.lifecycle;
  const primaryLabel = launchState.ready || launchState.live ? "Send / Export" : "Review content";

  return (
    <PageHeader
      eyebrow="Campaign"
      title={campaign.name}
      description={campaign.objective}
      backHref="/campaigns"
      backLabel="campaigns"
      aside={
        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={LIFECYCLE_TONE[launchState.lifecycle]}>{statusLabel}</StatusPill>
            <StatusPill tone={launchState.live ? "green" : "amber"}>{launchState.live ? "Live" : "Approval required"}</StatusPill>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="#content" className={buttonClasses({ size: "sm" })}>
              {primaryLabel}
            </a>
            <Link href={`/campaigns/${campaign.id}?focus=arc`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Ask Arc to revise
            </Link>
          </div>
        </div>
      }
    />
  );
}
```

- [ ] **Step 5: Replace campaign workspace composition**

Replace `src/app/campaigns/_components/campaign-workspace.tsx` with:

```tsx
"use client";

import { useRef } from "react";

import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import { type DispatchView } from "@/lib/dispatch/status";

import { CampaignChecklist } from "./campaign-checklist";
import { CampaignContentTable } from "./campaign-content-table";
import { CampaignHeader } from "./campaign-header";
import { CampaignRightRail } from "./campaign-right-rail";
import { buildCampaignChecklist } from "./campaign-detail-model";

export function CampaignWorkspace({ detail, dispatches = [] }: { detail: LiveCampaignWorkspace; dispatches?: DispatchView[] }) {
  const { campaign } = detail;
  const checklist = buildCampaignChecklist(detail);
  const markRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="space-y-5">
      <CampaignHeader campaign={campaign} launchState={detail.launchState} />

      <CampaignChecklist steps={checklist} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main id="content" className="min-w-0 space-y-4">
          <CampaignContentTable detail={detail} />
          <details className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[var(--text-primary)]">History</summary>
            <div className="border-t border-[var(--border-hairline)] px-4 py-3">
              {detail.auditLog.length > 0 ? (
                <ol className="space-y-2">
                  {detail.auditLog.slice(0, 8).map((entry) => (
                    <li key={entry.id} className="text-sm leading-5 text-[var(--text-secondary)]">
                      <strong className="text-[var(--text-primary)]">{entry.action}</strong> · {entry.detail}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">No history yet.</p>
              )}
            </div>
          </details>
        </main>

        <div ref={markRef}>
          <CampaignRightRail detail={detail} />
        </div>
      </div>
    </div>
  );
}
```

Note: `dispatches` stays in the prop type so `src/app/campaigns/[campaignId]/page.tsx` does not need a broad data-fetch rewrite in the first pass. If TypeScript complains about unused `dispatches`, remove it from destructuring but keep the prop in the type.

- [ ] **Step 6: Run tests and typecheck**

Run:

```powershell
pnpm exec vitest run src/app/campaigns/_components/__tests__/campaign-detail-model.test.ts src/app/campaigns/_components/__tests__/library-model.test.ts
pnpm exec tsc --noEmit --pretty false
```

Expected: Vitest PASS and TypeScript PASS. If TypeScript fails because of unused imports from removed tab components, delete those imports from `campaign-workspace.tsx`.

- [ ] **Step 7: Commit Task 4**

Run:

```powershell
git add -- src/app/campaigns/_components/campaign-workspace.tsx src/app/campaigns/_components/campaign-header.tsx src/app/campaigns/_components/campaign-checklist.tsx src/app/campaigns/_components/campaign-content-table.tsx src/app/campaigns/_components/campaign-right-rail.tsx
git diff --cached --name-only
git commit -m "feat(campaigns): add checklist campaign workspace"
```

Expected staged files:

```text
src/app/campaigns/_components/campaign-checklist.tsx
src/app/campaigns/_components/campaign-content-table.tsx
src/app/campaigns/_components/campaign-header.tsx
src/app/campaigns/_components/campaign-right-rail.tsx
src/app/campaigns/_components/campaign-workspace.tsx
```

---

### Task 5: Browser Polish And Final Verification

**Files:**
- Modify only files from Tasks 1-4 if visual verification reveals concrete issues.

- [ ] **Step 1: Start or reuse the dev server**

Run:

```powershell
pnpm dev
```

Expected: Dev server starts, usually at `http://localhost:3000`. If port 3000 is occupied, use the URL printed by Next.

- [ ] **Step 2: Verify main Campaigns page visually**

Open `/campaigns` in the browser and verify:

- Header copy is plain and functional.
- `Ask Arc` and `Create campaign` are visible.
- Search input is visible.
- Saved views are visible.
- Campaign table columns are readable on desktop.
- A row can expand and collapse.
- Expanded preview has `Campaign preview`, `What is inside`, and `Can it go out?`.
- The UI uses plain words: review, ready, send, export, live, draft, content, audience.

If the table is cramped, adjust grid widths in `CampaignManagerRow` and `CampaignLibrary` consistently. Use this class shape as the starting point:

```tsx
md:grid-cols-[34px_minmax(260px,1.7fr)_128px_140px_128px_minmax(180px,1fr)_88px]
```

- [ ] **Step 3: Verify individual campaign page visually**

Open any `/campaigns/[campaignId]` and verify:

- Header has campaign name, simple status, and simple action labels.
- Four checklist steps appear above the workspace.
- Content table lists every asset/content piece.
- Selecting a row updates the preview.
- Right rail shows Campaign summary, Send / export, Arc, and Results.
- History is collapsed and not dominant.

If the content preview pushes the right rail too far down, keep the layout at:

```tsx
xl:grid-cols-[minmax(0,1fr)_340px]
```

and avoid wider fixed widths.

- [ ] **Step 4: Run focused automated checks**

Run:

```powershell
pnpm exec vitest run src/app/campaigns/_components/__tests__/library-model.test.ts src/app/campaigns/_components/__tests__/campaign-detail-model.test.ts
pnpm exec tsc --noEmit --pretty false
pnpm build
```

Expected: All pass. If `pnpm build` fails due to unrelated in-flight files, capture the exact error and run the narrower campaign tests plus TypeScript again after confirming the failure is unrelated.

- [ ] **Step 5: Check staged scope before final commit**

Run:

```powershell
git status --short
git diff -- src/app/campaigns src/lib/campaigns
```

Expected: Only campaign UI/helper/test files from this plan are changed for this feature slice. Do not stage unrelated Arc API, settings, or auth changes that are already in the worktree.

- [ ] **Step 6: Commit final polish**

Run:

```powershell
git add -- src/app/campaigns/page.tsx src/app/campaigns/_components src/app/campaigns/[campaignId]/page.tsx
git diff --cached --name-only
git commit -m "feat(campaigns): ship campaign manager v4"
```

Expected staged files are only the final campaign UI files. If `[campaignId]/page.tsx` was not modified, omit it from `git add`.

---

## Plan Self-Review

### Spec Coverage

- Main manager table: Task 2.
- Saved views and search: Task 1 helpers, Task 2 UI.
- Expandable row previews: Task 2.
- Plain-language statuses and destinations: Task 1 and Task 3.
- Detail checklist: Task 3 helpers, Task 4 UI.
- Content table and preview: Task 3 helpers, Task 4 UI.
- Right rail with summary, send/export, Arc, results: Task 4.
- Approval-safe behavior: Tasks reuse existing actions; Task 5 verifies no new send path.
- New integrations and bulk send: explicitly out of scope.

### Placeholder Scan

This plan intentionally avoids placeholder instructions. Where implementation may choose to wire existing approve/revision actions, the plan gives the safe default: keep preview buttons non-destructive unless wired to existing actions.

### Type Consistency

- `CampaignManagerView`, `CampaignManagerTone`, and helper names are defined in Task 1 and reused in Task 2.
- `PlainTone`, `PlainStatus`, `CampaignContentRow`, and helper names are defined in Task 3 and reused in Task 4.
- All components import from local `_components` helpers and existing `CampaignWorkspaceListItem`/`LiveCampaignWorkspace` types.
