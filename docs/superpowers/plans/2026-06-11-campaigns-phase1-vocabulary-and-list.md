# Campaigns Phase 1 — Shared Vocabulary + Expandable List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 of the Campaigns × Mark redesign — a single plain-English "who's driving" status vocabulary (used here and reused by the board/detail later), an expandable quick-peek on every campaign row, and a gentle "New campaign" choice screen — without any backend churn beyond one read-model field.

**Architecture:** The vocabulary lives as a pure, unit-tested domain helper (`campaignDrivingState`) so the list, the board, and the campaign detail all render the same words from one source. The read model gains a small `previewThumbnails` field (pass-through, build-verified). The list row becomes a thin `"use client"` component with a chevron-driven inline peek; `campaign-library.tsx` is updated to derive all section/tag/action labels from the domain vocabulary. The "New campaign" page becomes a two-option chooser; the existing manual form moves to a sub-route. This matches the existing codebase convention: pure logic is unit-tested; presentational/client components are verified by lint + typecheck/build (the only existing campaigns component test covers a pure helper, not a render).

**Tech Stack:** Next.js 16 (server components + client components), React 19, TypeScript, Tailwind (CSS-var tokens from `DESIGN.md`), Vitest.

**Builds on:** `docs/superpowers/specs/2026-06-11-campaigns-mark-workspace-design.md` (full design) and the already-merged `2026-06-10-campaigns-view-redesign` (the grouped triage list this enhances).

> **Coordination note:** Active git worktrees (`.claude/worktrees/mark-kanban`, `reusable-product-shell`, `task-labels`) may touch `campaign-library.tsx`, `read-model.ts`, and `src/domain/index.ts`. Before starting, rebase/merge so you're on the latest `main`; if any of these files differ from the snippets here, reconcile by hand rather than blind-pasting the full-file rewrites.

---

## File map

- **Create** `src/domain/campaign-status.ts` — `CampaignLifecycle`, `CampaignDrivingState`, `campaignDrivingState()` shared vocabulary.
- **Create** `src/domain/__tests__/campaign-status.test.ts` — vocabulary unit tests.
- **Modify** `src/domain/index.ts` — re-export `./campaign-status`.
- **Modify** `src/lib/campaigns/read-model.ts` — source `CampaignLaunchState["lifecycle"]` from the domain `CampaignLifecycle`; add `previewThumbnails: string[]` to `CampaignWorkspaceListItem` (type + assignment).
- **Create** `src/app/campaigns/_components/campaign-row.tsx` — `"use client"` row with chevron-driven inline quick peek.
- **Modify** `src/app/campaigns/_components/campaign-library.tsx` — derive group/tag/action labels from `campaignDrivingState`; render rows via `CampaignRow`; drop the always-on side preview panel in favor of the peek.
- **Modify** `src/app/campaigns/new/page.tsx` — becomes the two-option "New campaign" chooser.
- **Create** `src/app/campaigns/new/manual/page.tsx` — hosts the existing `CampaignCreateForm` (the "Set it up myself" path).

---

## Task 1: `campaignDrivingState` — the shared vocabulary (TDD)

**Files:**
- Create: `src/domain/campaign-status.ts`
- Modify: `src/domain/index.ts`
- Test: `src/domain/__tests__/campaign-status.test.ts`

This is the foundation: one function maps a campaign's lifecycle to the plain-English label, tone, group heading, and primary action used everywhere (list rows, board columns, detail progress). Phases 2–4 import this same helper.

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/campaign-status.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { campaignDrivingState, type CampaignLifecycle } from "@/domain";

describe("campaignDrivingState", () => {
  it("maps Drafting → Mark building (blue, Open)", () => {
    const state = campaignDrivingState("Drafting");
    expect(state.key).toBe("building");
    expect(state.label).toBe("Mark building");
    expect(state.tone).toBe("blue");
    expect(state.action).toBe("Open");
    expect(state.groupLabel).toBe("Mark is working on these");
  });

  it("maps In review → Needs you (amber, Review)", () => {
    const state = campaignDrivingState("In review");
    expect(state.key).toBe("needs-you");
    expect(state.label).toBe("Needs you");
    expect(state.tone).toBe("amber");
    expect(state.action).toBe("Review");
    expect(state.groupLabel).toBe("Waiting for your approval");
  });

  it("maps Ready → Ready to launch (green, Launch)", () => {
    const state = campaignDrivingState("Ready");
    expect(state.key).toBe("ready");
    expect(state.label).toBe("Ready to launch");
    expect(state.tone).toBe("green");
    expect(state.action).toBe("Launch");
    expect(state.groupLabel).toBe("Ready to launch");
  });

  it("maps Live → Live (green, Open)", () => {
    const state = campaignDrivingState("Live");
    expect(state.key).toBe("live");
    expect(state.label).toBe("Live");
    expect(state.tone).toBe("green");
    expect(state.action).toBe("Open");
    expect(state.groupLabel).toBe("Live right now");
  });

  it("returns a result for every lifecycle value (exhaustive)", () => {
    const all: CampaignLifecycle[] = ["Drafting", "In review", "Ready", "Live"];
    for (const lifecycle of all) {
      expect(campaignDrivingState(lifecycle).label.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/campaign-status.test.ts`
Expected: FAIL — `campaignDrivingState` is not exported from `@/domain`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/campaign-status.ts`:

```typescript
/**
 * The single plain-English status vocabulary for campaigns. The list rows, the
 * shared task board, and the campaign detail all render from this one source so
 * a non-technical operator learns the words once and they mean the same thing
 * everywhere. Keep this the only place these strings are defined.
 */

/** Derived lifecycle of a campaign (produced by the campaigns read model). */
export type CampaignLifecycle = "Drafting" | "In review" | "Ready" | "Live";

export type CampaignDrivingKey = "building" | "needs-you" | "ready" | "live";
export type CampaignDrivingTone = "blue" | "amber" | "green" | "gray";

export type CampaignDrivingState = {
  /** Stable key for styling / analytics. */
  key: CampaignDrivingKey;
  /** The "who's driving" tag shown on a row, e.g. "Needs you". */
  label: string;
  /** Color intent for the tag/dot. */
  tone: CampaignDrivingTone;
  /** The primary action button label for this state, e.g. "Review". */
  action: string;
  /** The list section heading for this state, e.g. "Waiting for your approval". */
  groupLabel: string;
};

const STATES: Record<CampaignLifecycle, CampaignDrivingState> = {
  Drafting: { key: "building", label: "Mark building", tone: "blue", action: "Open", groupLabel: "Mark is working on these" },
  "In review": { key: "needs-you", label: "Needs you", tone: "amber", action: "Review", groupLabel: "Waiting for your approval" },
  Ready: { key: "ready", label: "Ready to launch", tone: "green", action: "Launch", groupLabel: "Ready to launch" },
  Live: { key: "live", label: "Live", tone: "green", action: "Open", groupLabel: "Live right now" },
};

/** Map a campaign lifecycle to its plain-English driving state. */
export function campaignDrivingState(lifecycle: CampaignLifecycle): CampaignDrivingState {
  return STATES[lifecycle];
}
```

Add to `src/domain/index.ts` (append after the existing exports):

```typescript
export * from "./campaign-status";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/campaign-status.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/campaign-status.ts src/domain/index.ts src/domain/__tests__/campaign-status.test.ts
git commit -m "feat(campaigns): campaignDrivingState — shared plain-English status vocabulary"
```

---

## Task 2: Source the lifecycle type from the domain + add `previewThumbnails`

**Files:**
- Modify: `src/lib/campaigns/read-model.ts`

No unit test: the lifecycle change is a type-only re-source, and `previewThumbnails` is a pass-through derivation with no branching logic and no fake-Supabase harness. Both are exercised by the typecheck/build in Task 6 (the new UI consumes `previewThumbnails`, and `CampaignLaunchState`/`CampaignWorkspaceListItem` flow into `campaignDrivingState`).

- [ ] **Step 1: Import the domain lifecycle type**

At the top of `src/lib/campaigns/read-model.ts`, add to the imports (after the existing Supabase import on line ~3):

```typescript
import { type CampaignLifecycle } from "@/domain";
```

- [ ] **Step 2: Re-source `CampaignLaunchState.lifecycle`**

In `src/lib/campaigns/read-model.ts`, in the `CampaignLaunchState` type (~line 223), replace the inline union:

```typescript
  lifecycle: "Drafting" | "In review" | "Ready" | "Live";
```

with the domain type:

```typescript
  lifecycle: CampaignLifecycle;
```

(`CampaignWorkspaceListItem.lifecycle` already references `CampaignLaunchState["lifecycle"]`, so it now flows from the domain automatically.)

- [ ] **Step 3: Add `previewThumbnails` to the list item type**

In the `CampaignWorkspaceListItem` type (~line 45), add the field immediately after `thumbnailUrl: string | null;`:

```typescript
  thumbnailUrl: string | null;
  previewThumbnails: string[];
  assetTypes: string[];
```

- [ ] **Step 4: Populate it in the list mapper**

In the object returned inside `getCampaignWorkspaceList` (the `items = campaigns.map(...)` block, ~line 451), add the assignment right after the existing `thumbnailUrl: pickThumbnail(...)` line:

```typescript
        thumbnailUrl: pickThumbnail(mediaByCampaign.get(campaign.id) ?? []),
        previewThumbnails: (mediaByCampaign.get(campaign.id) ?? [])
          .filter((media) => media.type === "image")
          .map((media) => media.thumbnailUrl ?? media.url)
          .slice(0, 3),
        assetTypes: uniqueStrings(campaignAssets.map((asset) => asset.assetType)).slice(0, 4),
```

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm lint`
Expected: no new errors from `read-model.ts`. (Full consumption is exercised in Task 6's build.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/campaigns/read-model.ts
git commit -m "feat(campaigns): source lifecycle from domain + expose previewThumbnails on list item"
```

---

## Task 3: `CampaignRow` — the expandable quick-peek row (client component)

**Files:**
- Create: `src/app/campaigns/_components/campaign-row.tsx`

The row is the only interactive (expand/collapse) piece, so it's a client component. A chevron `<button>` toggles an inline peek; the name/meta is a `<Link>` to the campaign; the action is a separate `<Link>`. No nested-interactive nesting. The "who's driving" tag and action label come from `campaignDrivingState`. `nowMs` is passed from the server render so wait labels are stable.

- [ ] **Step 1: Write the component**

Create `src/app/campaigns/_components/campaign-row.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { campaignDrivingState } from "@/domain";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { formatWaitTime } from "./format-wait-time";

const TONE_TAG: Record<string, string> = {
  blue: "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  amber: "border-[var(--warn-border-soft)] bg-[var(--warn-soft)] text-[var(--warn-text)]",
  green: "border-[var(--ok-border-soft)] bg-[var(--ok-soft)] text-[var(--ok-text)]",
  gray: "border-[var(--border-strong)] bg-[var(--surface-inset)] text-[var(--text-secondary)]",
};

/**
 * One campaign in the portfolio list. Collapsed by default (calm); a chevron
 * opens an inline "quick peek" — thumbnails plus a plain-English what / who /
 * why — so the operator can size up a campaign without opening it. The tag and
 * action come from the shared driving-state vocabulary.
 */
export function CampaignRow({
  campaign,
  flag,
  nowMs,
}: {
  campaign: CampaignWorkspaceListItem;
  /** Highlight treatment for the awaiting group. */
  flag: boolean;
  nowMs: number;
}) {
  const [open, setOpen] = useState(false);
  const peekId = useId();
  const state = campaignDrivingState(campaign.lifecycle);
  const why = whyLine(campaign);
  const wait = formatWaitTime(campaign.updatedAtIso, nowMs);
  const channel = channelSummary(campaign.assetTypes);
  const canPeek = Boolean(
    campaign.previewThumbnails.length > 0 || why || campaign.audienceSummary || campaign.assetCount > 0,
  );

  return (
    <div
      className={`rounded-xl border transition ${
        flag
          ? "border-[var(--accent-border-strong)] bg-[linear-gradient(90deg,var(--accent-soft),var(--surface-panel)_62%)]"
          : "border-[var(--border-panel)] bg-[var(--surface-panel)]"
      } ${open ? "" : "hover:border-[var(--border-strong)]"}`}
    >
      <div className="flex items-stretch gap-3 px-4 py-3.5">
        {canPeek ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={peekId}
            aria-label={open ? `Hide quick peek for ${campaign.name}` : `Quick peek for ${campaign.name}`}
            onClick={() => setOpen((value) => !value)}
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-md border border-[var(--border-strong)] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <svg viewBox="0 0 16 16" aria-hidden className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 self-start rounded-full bg-[var(--border-strong)]" />
        )}

        <Link href={campaign.href} className="group min-w-0 flex-1">
          <span className="block truncate text-base font-medium tracking-[-0.005em] text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">
            {campaign.name}
          </span>
          {why ? <span className="mt-1 line-clamp-1 block text-xs text-[var(--text-secondary)]">{why}</span> : null}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-muted)]">
            <span className="truncate">{targetLabel(campaign.persona)}</span>
            {channel ? (
              <>
                <Dot />
                <span className="truncate">{channel}</span>
              </>
            ) : null}
            <Dot />
            <span>
              {campaign.assetCount} asset{campaign.assetCount === 1 ? "" : "s"}
            </span>
            {wait ? (
              <>
                <Dot />
                <span className={flag ? "font-medium text-[var(--accent)]" : ""}>waiting {wait}</span>
              </>
            ) : null}
          </span>
        </Link>

        <span
          className={`hidden shrink-0 items-center gap-1.5 self-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] sm:inline-flex ${TONE_TAG[state.tone] ?? TONE_TAG.gray}`}
        >
          {state.label}
        </span>

        <Link
          href={campaign.href}
          className={`shrink-0 self-center rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
            flag
              ? "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-strong)]"
              : "border border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          }`}
        >
          {state.action}
        </Link>
      </div>

      {open ? (
        <div id={peekId} className="border-t border-[var(--border-hairline)] px-4 py-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            {campaign.previewThumbnails.length > 0 ? (
              <div className="flex shrink-0 gap-2">
                {campaign.previewThumbnails.map((src, index) => (
                  // eslint-disable-next-line @next/next/no-img-element -- Mark emits arbitrary remote creative URLs; no Next image-optimizer domain config
                  <img
                    key={`${index}-${src}`}
                    src={src}
                    alt=""
                    className="h-16 w-16 rounded-lg border border-[var(--border-hairline)] object-cover"
                  />
                ))}
              </div>
            ) : null}

            <dl className="min-w-0 flex-1 space-y-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              <PeekFact label="Pieces">
                {campaign.assetCount} {campaign.assetCount === 1 ? "piece" : "pieces"}
                {channel ? ` · ${channel}` : ""}
              </PeekFact>
              <PeekFact label="Who it reaches">
                {campaign.audienceSummary && campaign.audienceSummary !== "Audience has not been summarized yet."
                  ? campaign.audienceSummary
                  : targetLabel(campaign.persona)}
              </PeekFact>
              {why ? <PeekFact label="Why Mark built it">{why}</PeekFact> : null}
            </dl>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={campaign.href}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-strong)]"
            >
              Open campaign
            </Link>
            <Link
              href={`${campaign.href}?tab=preview`}
              className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            >
              See full preview
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PeekFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-semibold text-[var(--text-muted)]">{label}:</dt>
      <dd className="min-w-0">{children}</dd>
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

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm lint`
Expected: no errors in `campaign-row.tsx`. (`React.ReactNode` is globally available via the React types; no import needed. It's wired into the library in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/campaign-row.tsx
git commit -m "feat(campaigns): CampaignRow with expandable quick peek + shared status tag"
```

---

## Task 4: Update `campaign-library.tsx` to use the vocabulary + new rows

**Files:**
- Modify (full rewrite): `src/app/campaigns/_components/campaign-library.tsx`

Derives every section heading, tag, and action from `campaignDrivingState` (single vocabulary), renders all rows through `CampaignRow` (drops the old always-on side `CampaignPreview` panel in favor of the peek), and keeps the existing awaiting outbound/internal split + `CollapsedBatchGroup` fold and the `MomentumStrip`.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/app/campaigns/_components/campaign-library.tsx` with:

```tsx
import { campaignDrivingState, type CampaignLifecycle } from "@/domain";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { CampaignRow } from "./campaign-row";
import { CollapsedBatchGroup } from "./collapsed-batch-group";
import { momentumCounts, partitionAwaiting } from "./library-model";
import { MomentumStrip } from "./momentum-strip";

type Lifecycle = CampaignLifecycle;

/**
 * The Campaigns portfolio: an editorial list grouped by what the operator needs
 * to do, in plain language sourced from the shared driving-state vocabulary.
 * Awaiting-approval work floats to the top and glows; every row carries an
 * expandable quick peek. Internal CRM batches collapse into one fold.
 */

// Lifecycle render order + the list-specific styling (text comes from the
// shared vocabulary via campaignDrivingState).
const LIFECYCLE_ORDER: Lifecycle[] = ["In review", "Ready", "Live", "Drafting"];

const GROUP_STYLE: Record<Lifecycle, { flag: boolean; emptyNote: string }> = {
  "In review": { flag: true, emptyNote: "Nothing awaiting you — Mark's drafts will land here." },
  Ready: { flag: false, emptyNote: "Nothing ready yet — approved campaigns land here." },
  Live: { flag: false, emptyNote: "Nothing live yet — launched campaigns land here." },
  Drafting: { flag: false, emptyNote: "No drafts in progress." },
};

const FILTERS: Array<{ key: "All" | Lifecycle; label: string }> = [
  { key: "All", label: "All" },
  { key: "In review", label: "Needs you" },
  { key: "Ready", label: "Ready" },
  { key: "Live", label: "Live" },
  { key: "Drafting", label: "Mark building" },
];

export function CampaignLibrary({
  campaigns,
  activeStatus,
  nowMs,
}: {
  campaigns: CampaignWorkspaceListItem[];
  activeStatus: string;
  nowMs: number;
}) {
  const status: "All" | Lifecycle = (LIFECYCLE_ORDER as string[]).includes(activeStatus)
    ? (activeStatus as Lifecycle)
    : "All";

  const counts = campaigns.reduce<Record<string, number>>((acc, campaign) => {
    acc[campaign.lifecycle] = (acc[campaign.lifecycle] ?? 0) + 1;
    return acc;
  }, {});

  const showAll = status === "All";
  const visibleGroups = LIFECYCLE_ORDER.filter((key) => showAll || key === status).map((key) => ({
    key,
    items: campaigns.filter((campaign) => campaign.lifecycle === key),
  }));
  // In a specific-status view we hide empty groups; in "All" we keep them so the
  // pipeline shape (Needs you → Ready → Live → Mark building) stays legible.
  const rendered = showAll ? visibleGroups : visibleGroups.filter((entry) => entry.items.length > 0);

  return (
    <div className="space-y-6">
      <MomentumStrip counts={momentumCounts(campaigns)} />

      <nav aria-label="Filter campaigns by status" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const count = filter.key === "All" ? campaigns.length : counts[filter.key] ?? 0;
          const active = status === filter.key;
          return (
            <Link
              key={filter.key}
              href={filter.key === "All" ? "/campaigns" : `/campaigns?status=${encodeURIComponent(filter.key)}`}
              aria-current={active ? "page" : undefined}
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
        rendered.map(({ key, items }) => {
          const state = campaignDrivingState(key);
          const style = GROUP_STYLE[key];
          return (
            <section key={key} aria-label={state.groupLabel}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{state.groupLabel}</h2>
                <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{items.length}</span>
              </div>

              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--surface-soft)] px-4 py-3 text-xs text-[var(--text-muted)]">
                  {style.emptyNote}
                </p>
              ) : key === "In review" ? (
                <AwaitingSection items={items} flag={style.flag} nowMs={nowMs} />
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {items.map((campaign) => (
                    <li key={campaign.id}>
                      <CampaignRow campaign={campaign} flag={style.flag} nowMs={nowMs} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

/** The In-review group: outbound rows above the internal CRM fold. */
function AwaitingSection({ items, flag, nowMs }: { items: CampaignWorkspaceListItem[]; flag: boolean; nowMs: number }) {
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
                <CampaignRow campaign={campaign} flag={flag} nowMs={nowMs} />
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
                <CampaignRow campaign={internal[0]} flag={flag} nowMs={nowMs} />
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
```

- [ ] **Step 2: Add the missing `Link` import**

The rewrite above uses `next/link` in the filter nav. Add this as the first import line of the file:

```tsx
import Link from "next/link";
```

(Place it above the `@/domain` import so the final import order is `next/link`, then `@/domain`, then `@/lib/...`, then the local `./` imports.)

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm lint`
Expected: PASS — no errors. Confirm there is no remaining reference to the removed `CampaignPreview`/`whyLine`/`GROUPS`/`channelSummary` helpers in this file (they now live in `campaign-row.tsx`).

- [ ] **Step 4: Build to verify the route compiles**

Run: `pnpm build`
Expected: build succeeds; `/campaigns` compiles with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/campaigns/_components/campaign-library.tsx
git commit -m "feat(campaigns): portfolio list uses shared vocabulary + expandable peek rows"
```

---

## Task 5: "New campaign" becomes a two-option chooser

**Files:**
- Modify: `src/app/campaigns/new/page.tsx`
- Create: `src/app/campaigns/new/manual/page.tsx`

Instead of dropping a form on the operator, `/campaigns/new` offers two plain choices: **Tell Mark what you need** (→ opens the Mark chat) or **Set it up myself** (→ the existing manual form, now at `/campaigns/new/manual`). Full "Tell Mark creates a shell campaign + thread" wiring is Phase 2; for now "Tell Mark" routes to `/mark` so the path exists end-to-end.

- [ ] **Step 1: Create the manual-form sub-route**

Create `src/app/campaigns/new/manual/page.tsx`:

```tsx
import { requireOperator } from "@/lib/auth/operator";

import { PageHeader } from "../../../_components/page-header";
import { CampaignCreateForm } from "../../_components/campaign-create-form";

export default async function NewCampaignManualPage() {
  await requireOperator();

  return (
    <>
      <PageHeader
        eyebrow="New campaign"
        title="Set it up yourself"
        description="Give it a title, who it's for, the audience and offer, and any reference photos. Save it as a draft, then hand it to Mark whenever you're ready."
        backHref="/campaigns/new"
        backLabel="campaign options"
      />
      <CampaignCreateForm />
    </>
  );
}
```

- [ ] **Step 2: Replace `/campaigns/new` with the chooser**

Replace the entire contents of `src/app/campaigns/new/page.tsx` with:

```tsx
import Link from "next/link";

import { requireOperator } from "@/lib/auth/operator";

import { PageHeader } from "../../_components/page-header";

export default async function NewCampaignPage() {
  await requireOperator();

  return (
    <>
      <PageHeader
        eyebrow="New campaign"
        title="How do you want to start?"
        description="Tell Mark what you need and he'll draft the first pieces, or set it up yourself. You can hand it to Mark — or take it back — at any time."
        backHref="/campaigns"
        backLabel="campaigns"
      />

      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <ChoiceCard
          href="/mark"
          title="Tell Mark what you need"
          body="Describe the campaign in plain words. Mark drafts the first pieces for you to review — nothing goes out without your approval."
          cta="Talk to Mark"
          primary
        />
        <ChoiceCard
          href="/campaigns/new/manual"
          title="Set it up myself"
          body="Fill in a few details — title, who it's for, the offer. Save it as a draft and hand it to Mark whenever you like."
          cta="Open the form"
        />
      </div>
    </>
  );
}

function ChoiceCard({
  href,
  title,
  body,
  cta,
  primary = false,
}: {
  href: string;
  title: string;
  body: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border p-5 transition ${
        primary
          ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] hover:border-[var(--accent)]"
          : "border-[var(--border-panel)] bg-[var(--surface-panel)] hover:border-[var(--border-strong)]"
      }`}
    >
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
      <span
        className={`mt-4 inline-flex w-fit items-center rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
          primary
            ? "bg-[var(--accent)] text-[var(--on-accent)] group-hover:bg-[var(--accent-strong)]"
            : "border border-[var(--border-strong)] text-[var(--text-secondary)] group-hover:border-[var(--accent)] group-hover:text-[var(--text-primary)]"
        }`}
      >
        {cta} →
      </span>
    </Link>
  );
}
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `pnpm lint`
Expected: PASS — no errors in either page.

Run: `pnpm build`
Expected: build succeeds; `/campaigns/new` and `/campaigns/new/manual` both compile.

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/new/page.tsx src/app/campaigns/new/manual/page.tsx
git commit -m "feat(campaigns): New campaign chooser (Tell Mark / Set it up myself)"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all tests green, including the new `campaign-status` tests and the existing `campaign-kind` / `format-wait-time` / `library-model` suites.

- [ ] **Step 2: Lint the whole project**

Run: `pnpm lint`
Expected: no new errors. (Per `pnpm lint scans vendor`, ignore pre-existing vendored/generated findings; confirm none originate from the files this plan touches.)

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4: Manual smoke (recommended)**

Run: `pnpm dev`, open `/campaigns`. Confirm:
- Section headings read in plain words: **Waiting for your approval · Ready to launch · Live right now · Mark is working on these**.
- Each row shows a **"who's driving" tag** (Needs you / Ready to launch / Live / Mark building) and a matching action button (Review / Launch / Open / Open).
- A **chevron** on each row opens an inline peek with thumbnails (when present) and a plain **Pieces / Who it reaches / Why Mark built it**, plus **Open campaign** and **See full preview** buttons. Tapping the chevron again closes it.
- The filter pills read **All / Needs you / Ready / Live / Mark building** and filter correctly.
- `/campaigns/new` shows the two-option chooser; **Set it up myself** opens the manual form at `/campaigns/new/manual`; **Tell Mark** opens `/mark`.

---

## Self-Review

- **Spec coverage (Phase 1 scope):**
  - Shared "who's driving" vocabulary → Task 1 (`campaignDrivingState`), consumed in Tasks 3–4. Reused by board/detail in later phases (exported from `@/domain`).
  - Portfolio relabel & grouping in plain language → Task 4 (`LIFECYCLE_ORDER`, `groupLabel`, filter labels).
  - Expandable quick peek (chevron, inline, thumbnails + what/who/why, Open / See preview) → Tasks 2 (`previewThumbnails`) + 3 (`CampaignRow`).
  - New-campaign choice (Tell Mark / Set it up myself) → Task 5.
  - "Ready to launch" as its own group under "Needs you" (resolved decision #1) → Task 4 (`LIFECYCLE_ORDER` puts `Ready` second).
  - "See full preview" deep-links `?tab=preview` (the Preview section ships in Phase 3; the link is harmless until then) → Task 3.
- **Deferred (other phases, intentionally not here):** detail-page restructure + Mark side pane + thread consolidation (Phase 2); true-to-life Preview section, go-live confirm, "Mark suggests", portfolio analytics strip (Phase 3); board↔campaign links + handoff control + "Done/Finished" group, which needs archive-state read-model work (Phase 4). Noted so reviewers don't read these absences as gaps.
- **Placeholder scan:** none — every code step has complete content; every command lists expected output.
- **Type consistency:** `CampaignLifecycle` (Task 1) is the single lifecycle type, re-sourced into `read-model.ts` (Task 2) and imported by `campaign-library.tsx` (Task 4); `campaignDrivingState(lifecycle)` returns `{ key, label, tone, action, groupLabel }` and is destructured identically in Tasks 3 (`state.label`/`state.tone`/`state.action`) and 4 (`state.groupLabel`/`state.action`). `previewThumbnails: string[]` (Task 2) is read by `CampaignRow` (Task 3). `CampaignRow` props `{ campaign, flag, nowMs }` (Task 3) are passed identically in Task 4. `MomentumCounts`/`partitionAwaiting`/`CollapsedBatchGroup`/`MomentumStrip` keep their existing signatures.
- **Convention adherence:** pure logic (vocabulary) is unit-tested in `domain/__tests__`; components are verified by lint + build (matching the existing campaigns convention); commits are per-task with `feat(campaigns): …` messages.
```
