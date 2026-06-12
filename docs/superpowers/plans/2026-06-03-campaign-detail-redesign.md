# Campaign Detail Workspace Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the visual layout of `/campaigns/[campaignId]` — line-divided section headers, an inline-expanding email reader, a fused command-panel top half, and a slimmer sticky approve-bar — without touching data, actions, or auth.

**Architecture:** Presentation-only changes inside `src/app/campaigns/_components/`. Two new client components (`campaign-command-header.tsx`, `campaign-brief-strip.tsx`) absorb and replace `campaign-header.tsx` and `campaign-package-panel.tsx`; three existing components get restyled in place. All driven from the existing `LiveCampaignWorkspace` read-model and Signal design tokens in `globals.css`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind (arbitrary-value + CSS custom properties), Vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-03-campaign-detail-redesign-design.md`

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `_components/section-header.tsx` | Tone-coded **line** divider for asset groups (Deliverables + Media tabs) | Modify |
| `_components/asset-preview.tsx` | Deliverable body preview with inline expand/collapse | Modify |
| `_components/sticky-decision-bar.tsx` | Single-line scroll-triggered approve bar | Modify |
| `_components/campaign-command-header.tsx` | Fused identity + decision hero | **Create** |
| `_components/campaign-brief-strip.tsx` | Line-divided facts list + inline metric stats + full brief | **Create** |
| `_components/campaign-header.tsx` | (folded into command header) | **Delete** |
| `_components/campaign-package-panel.tsx` | (folded into command header + brief strip) | **Delete** |
| `_components/campaign-workspace.tsx` | Renders the two new components; keeps sentinel + tabs | Modify |

Tasks are ordered so the app compiles after every commit: the three isolated restyles first, then the two new components, then the swap-and-delete.

---

## Task 1: Line-divider section headers

**Files:**
- Modify: `src/app/campaigns/_components/section-header.tsx`

- [ ] **Step 1: Replace the component body**

Replace the entire contents of `src/app/campaigns/_components/section-header.tsx` with:

```tsx
type Tone = "blue" | "red" | "amber" | "green" | "gray";

function toneText(tone: Tone) {
  if (tone === "red") return "text-[oklch(0.86_0.1_26)]";
  if (tone === "amber") return "text-[oklch(0.89_0.12_76)]";
  if (tone === "green") return "text-[oklch(0.84_0.13_155)]";
  if (tone === "gray") return "text-[var(--text-muted)]";
  return "text-[var(--accent)]";
}

/** Tone-coded rule color for the section's top border. */
function toneRule(tone: Tone) {
  if (tone === "red") return "border-[oklch(0.68_0.2_26/0.6)]";
  if (tone === "amber") return "border-[oklch(0.82_0.13_85/0.6)]";
  if (tone === "green") return "border-[oklch(0.78_0.14_158/0.55)]";
  if (tone === "gray") return "border-[var(--border-strong)]";
  return "border-[oklch(0.74_0.115_232/0.6)]";
}

/** Tone-coded dot tick color + soft ring. */
function toneDot(tone: Tone) {
  if (tone === "red") return "bg-[oklch(0.68_0.2_26)] shadow-[0_0_0_3px_oklch(0.68_0.2_26/0.18)]";
  if (tone === "amber") return "bg-[oklch(0.82_0.13_85)] shadow-[0_0_0_3px_oklch(0.82_0.13_85/0.18)]";
  if (tone === "green") return "bg-[oklch(0.78_0.14_158)] shadow-[0_0_0_3px_oklch(0.78_0.14_158/0.18)]";
  if (tone === "gray") return "bg-[var(--text-muted)] shadow-[0_0_0_3px_var(--border-hairline)]";
  return "bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]";
}

/** Tone-coded section header rendered as a LINE divider: a colored top rule,
 *  a dot tick, the title, optional detail, and a right-aligned count. Shared by
 *  the Deliverables and Media tabs. */
export function SectionHeader({
  tone,
  eyebrow,
  detail,
  count,
}: {
  tone: Tone;
  eyebrow: string;
  detail?: string;
  count?: number;
}) {
  return (
    <div className={`mb-3 border-t-2 pt-3 ${toneRule(tone)}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2.5">
          <span aria-hidden className={`relative top-1 h-2 w-2 shrink-0 rounded-full ${toneDot(tone)}`} />
          <div>
            <div className={`text-base font-black uppercase tracking-[0.1em] ${toneText(tone)}`}>{eyebrow}</div>
            {detail ? <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{detail}</p> : null}
          </div>
        </div>
        {typeof count === "number" ? (
          <span className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {count} item{count === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors for `section-header.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/section-header.tsx
git commit -m "feat(campaigns): line-divider section headers"
```

---

## Task 2: Inline-expanding email/body preview

**Files:**
- Modify: `src/app/campaigns/_components/asset-preview.tsx`

- [ ] **Step 1: Add the client directive and import**

At the very top of `src/app/campaigns/_components/asset-preview.tsx`, above the existing `import type ...` line, add:

```tsx
"use client";

import { useState } from "react";
```

- [ ] **Step 2: Replace the `ReadableCopy` function**

Replace the entire existing `ReadableCopy` function with:

```tsx
function ReadableCopy({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = body
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Long bodies (e.g. full emails) collapse to a clamped preview with a fade and
  // a "Read full email" toggle; short bodies render whole with no toggle.
  const isLong = body.length > 280;
  const collapsed = isLong && !expanded;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
      <div className={`relative px-4 py-4 ${collapsed ? "max-h-44 overflow-hidden" : ""}`}>
        {paragraphs.length > 0 ? (
          <div className="space-y-3">
            {paragraphs.map((paragraph, index) => (
              <p
                key={`${index}-${paragraph.slice(0, 18)}`}
                className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]"
              >
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
        )}
        {collapsed ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--surface-soft)] to-transparent"
          />
        ) : null}
      </div>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--border-hairline)] px-4 py-2 text-xs font-bold text-[var(--accent)] transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {expanded ? "Collapse" : "Read full email"}
        </button>
      ) : null}
    </div>
  );
}
```

Leave `AssetPreview` and `MediaTile` unchanged.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors for `asset-preview.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/_components/asset-preview.tsx
git commit -m "feat(campaigns): inline expand/collapse for deliverable bodies"
```

---

## Task 3: Slim single-line sticky approve-bar

**Files:**
- Modify: `src/app/campaigns/_components/sticky-decision-bar.tsx`

- [ ] **Step 1: Replace the inner bar markup**

In `src/app/campaigns/_components/sticky-decision-bar.tsx`, replace the inner `<div className="pointer-events-auto ...">…</div>` block (the element containing the breathe dot, the title button, and `DecisionControls`) with this single-line version:

```tsx
      <div className="pointer-events-auto mx-auto mt-3 flex max-w-[1600px] items-center gap-3 rounded-xl border border-[oklch(0.82_0.13_85/0.5)] bg-[oklch(0.2_0.03_247/0.96)] px-4 py-2 shadow-[0_18px_44px_oklch(0.04_0.02_250/0.5)] backdrop-blur">
        <span aria-hidden className="status-breathe h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--warn)]" />
        <span className="hidden shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--warn)] sm:inline">
          Decision required{total > 1 ? ` · ${total}` : ""}
        </span>
        <StatusPill tone={riskTone(current.riskLevel)}>{current.riskLevel} risk</StatusPill>
        <button
          type="button"
          onClick={() => onReview(current.id)}
          className="min-w-0 flex-1 truncate text-left text-sm font-bold text-[var(--text-primary)] underline-offset-2 transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
          title="Open this item in Approvals"
        >
          {current.title}
        </button>
        <div className="shrink-0">
          <DecisionControls approvalItemId={current.id} campaignId={campaignId} />
        </div>
      </div>
```

Leave the surrounding `useEffect`, the outer positioning `<div>`, `findScrollParent`, and all props unchanged.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors. (`StatusPill`, `riskTone`, `DecisionControls` are already imported in this file.)

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/sticky-decision-bar.tsx
git commit -m "feat(campaigns): slim single-line sticky approve-bar"
```

---

## Task 4: Fused command header (new component)

**Files:**
- Create: `src/app/campaigns/_components/campaign-command-header.tsx`

- [ ] **Step 1: Create the file**

Create `src/app/campaigns/_components/campaign-command-header.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceApproval, CampaignWorkspaceMeta } from "@/lib/campaigns/read-model";

import { ApprovalContext } from "./approval-context";
import { DecisionControls } from "./decision-controls";
import { riskTone, statusTone } from "./status-tone";

/**
 * Fused command hero for a single campaign: campaign identity (eyebrow, status,
 * title, objective, meta) on top, the live approval decision divided in below by
 * a tone-colored rule. Replaces the old separate CampaignHeader + DecisionStepper.
 */
export function CampaignCommandHeader({
  campaign,
  campaignId,
  pendingApprovals,
  onReviewApproval,
  onOpenApprovals,
}: {
  campaign: CampaignWorkspaceMeta;
  campaignId: string;
  pendingApprovals: CampaignWorkspaceApproval[];
  onReviewApproval: (approvalId: string) => void;
  onOpenApprovals: () => void;
}) {
  const meta: Array<[string, string]> = [
    ["Persona", campaign.persona],
    ["Focus", campaign.restorationFocus],
    ["Owner", campaign.owner],
    ["Updated", campaign.updatedAt],
  ];

  return (
    <header className="module-rise mb-5">
      <Link
        href="/campaigns"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)]"
      >
        Back to campaigns
      </Link>

      <div className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="relative px-6 py-5">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,oklch(0.74_0.115_232/0.16),transparent_46%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <span className="signal-eyebrow">Campaign package</span>
              <StatusPill tone={statusTone(campaign.status)}>{campaign.status}</StatusPill>
              <StatusPill tone="amber">Outbound locked</StatusPill>
              {!campaign.launchLocked ? <StatusPill tone="blue">Approved draft</StatusPill> : null}
            </div>

            <h1 className="mt-3 max-w-[24ch] text-[clamp(1.6rem,3vw,2.4rem)] font-black leading-[1.03] tracking-[-0.04em] text-[var(--text-primary)]">
              {campaign.name}
            </h1>

            {campaign.objective ? (
              <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">{campaign.objective}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {meta.map(([label, value]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1 text-xs"
                >
                  <span className="font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
                  <span className="font-semibold text-[var(--text-primary)]">{value}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <DecisionZone
          campaignId={campaignId}
          pendingApprovals={pendingApprovals}
          onReviewApproval={onReviewApproval}
          onOpenApprovals={onOpenApprovals}
        />
      </div>
    </header>
  );
}

function DecisionZone({
  campaignId,
  pendingApprovals,
  onReviewApproval,
  onOpenApprovals,
}: {
  campaignId: string;
  pendingApprovals: CampaignWorkspaceApproval[];
  onReviewApproval: (approvalId: string) => void;
  onOpenApprovals: () => void;
}) {
  const total = pendingApprovals.length;
  const [index, setIndex] = useState(0);
  const [showContext, setShowContext] = useState(false);

  if (total === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[oklch(0.78_0.14_158/0.45)] bg-[oklch(0.78_0.14_158/0.06)] px-6 py-4">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--ok)]" />
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--ok)]">No decision pending</div>
            <p className="mt-0.5 text-sm font-semibold text-[var(--text-secondary)]">
              Every approval on this package has been decided. Outbound stays locked.
            </p>
          </div>
        </div>
        <button type="button" onClick={onOpenApprovals} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          View approval history
        </button>
      </div>
    );
  }

  // Decisions revalidate server-side and shrink the list; clamp the cursor.
  const safeIndex = Math.min(index, total - 1);
  const current = pendingApprovals[safeIndex];

  return (
    <div className="border-t-2 border-[oklch(0.82_0.13_85/0.5)] bg-[oklch(0.82_0.13_85/0.08)]">
      <div className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden className="status-breathe h-2.5 w-2.5 rounded-full bg-[var(--warn)]" />
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--warn)]">
              Decision required{total > 1 ? ` · ${total} pending` : ""}
            </span>
            <StatusPill tone={riskTone(current.riskLevel)}>{current.riskLevel} risk</StatusPill>
          </div>
          <h2 className="mt-2 truncate text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{current.title}</h2>
          <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
            {current.type} · by {current.requestedBy} · {current.submittedAt}
            {current.promptInputs.length > 0 ? ` · ${current.promptInputs.length} inputs` : ""}
          </p>
          <p className="mt-2 line-clamp-2 max-w-[80ch] text-sm leading-6 text-[var(--text-secondary)]">{current.preview}</p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowContext((value) => !value)}
              aria-expanded={showContext}
              className="text-xs font-bold text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
            >
              {showContext ? "Hide full context" : "See full context"}
            </button>
            <button
              type="button"
              onClick={() => onReviewApproval(current.id)}
              className="text-xs font-bold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            >
              Open in Approvals ↗
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
          {total > 1 ? (
            <div className="flex items-center gap-2">
              <StepButton label="Previous decision" disabled={safeIndex === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>
                ‹
              </StepButton>
              <span className="min-w-16 text-center font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                {safeIndex + 1} / {total}
              </span>
              <StepButton label="Next decision" disabled={safeIndex >= total - 1} onClick={() => setIndex((value) => Math.min(total - 1, value + 1))}>
                ›
              </StepButton>
            </div>
          ) : null}
          <DecisionControls approvalItemId={current.id} campaignId={campaignId} size="md" />
        </div>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${showContext ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-[oklch(0.82_0.13_85/0.3)] bg-[var(--surface-panel)] p-4">
            <ApprovalContext approval={current} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] font-mono text-base text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors. (The component is not yet imported anywhere; that's fine.)

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/campaign-command-header.tsx
git commit -m "feat(campaigns): add fused command header component"
```

---

## Task 5: Brief strip (new component)

**Files:**
- Create: `src/app/campaigns/_components/campaign-brief-strip.tsx`

- [ ] **Step 1: Create the file**

Create `src/app/campaigns/_components/campaign-brief-strip.tsx` with:

```tsx
"use client";

import { useState } from "react";

import type { CampaignWorkspaceMeta, LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

type TabKey = "creative" | "media" | "audience" | "reasoning" | "approvals" | "performance";
type Tone = "blue" | "green" | "amber" | "red";

function toneText(tone: Tone) {
  if (tone === "green") return "text-[oklch(0.84_0.13_155)]";
  if (tone === "amber") return "text-[oklch(0.89_0.12_76)]";
  if (tone === "red") return "text-[oklch(0.86_0.1_26)]";
  return "text-[var(--accent)]";
}

/**
 * Below-hero brief: the four key facts as a line-divided definition list (no
 * boxes), a compact inline row of clickable metric stats that jump to tabs, and
 * a collapsible full brief that emphasizes compliance. Replaces the old metric
 * grid + BriefCards + FullBrief from campaign-package-panel.
 */
export function CampaignBriefStrip({
  detail,
  onOpenTab,
}: {
  detail: LiveCampaignWorkspace;
  onOpenTab: (tab: TabKey) => void;
}) {
  const { campaign, sources, reasoning, metrics, media } = detail;
  const guardrailCount = reasoning.guardrailFlags.length;
  const [briefOpen, setBriefOpen] = useState(false);

  const facts: Array<{ tone: Tone; label: string; value: string }> = [
    { tone: "blue", label: "Audience", value: campaign.audienceSummary },
    { tone: "green", label: "Offer", value: campaign.offerSummary },
    { tone: "amber", label: "Persona", value: campaign.persona },
    {
      tone: guardrailCount > 0 ? "red" : "green",
      label: "Guardrails",
      value:
        guardrailCount > 0
          ? reasoning.guardrailFlags.slice(0, 3).join(" · ")
          : "No risky claims recorded. Dispatch stays locked until approval.",
    },
  ];

  const stats: Array<{ label: string; value: number; tab: TabKey }> = [
    { label: "Deliverables", value: metrics.assets, tab: "creative" },
    { label: "Media", value: media.length, tab: "media" },
    { label: "Sources", value: metrics.sources, tab: "audience" },
    { label: "Approvals", value: metrics.approvals, tab: "approvals" },
  ];

  return (
    <section className="module-rise mb-5 space-y-3">
      {/* Facts: gap-px over a hairline background paints the dividing lines. */}
      <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--border-hairline)] shadow-[var(--elev-panel)] sm:grid-cols-2 xl:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="bg-[var(--surface-panel)] px-5 py-4">
            <div className={`text-[10px] font-black uppercase tracking-[0.16em] ${toneText(fact.tone)}`}>{fact.label}</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-primary)]">{fact.value}</p>
          </div>
        ))}
      </div>

      {/* Inline metric stats (jump to tab) + full-brief toggle. */}
      <div className="flex flex-wrap items-center gap-2">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => onOpenTab(stat.tab)}
            className="inline-flex items-baseline gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-1.5 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <span className="font-display text-base font-black tabular-nums text-[var(--text-primary)]">{stat.value}</span>
            <span className="text-xs font-semibold text-[var(--text-muted)]">{stat.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setBriefOpen((value) => !value)}
          aria-expanded={briefOpen}
          className="ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-1.5 transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <span className="signal-eyebrow">Full brief &amp; compliance</span>
          <span className="font-mono text-xs font-bold text-[var(--text-muted)]">{briefOpen ? "Collapse" : "Expand"}</span>
        </button>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${briefOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <FullBriefBody campaign={campaign} sourceCount={sources.length} />
        </div>
      </div>
    </section>
  );
}

function FullBriefBody({ campaign, sourceCount }: { campaign: CampaignWorkspaceMeta; sourceCount: number }) {
  const rows: Array<[string, string]> = [
    ["Objective", campaign.objective],
    ["Audience", campaign.audienceSummary],
    ["Offer", campaign.offerSummary],
    ["Persona", campaign.persona],
    ["Restoration focus", campaign.restorationFocus],
    ["Owner", campaign.owner],
    ["Linked sources", `${sourceCount} record${sourceCount === 1 ? "" : "s"}`],
    ["Updated", campaign.updatedAt],
  ];

  return (
    <div className="mt-1 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      {/* Compliance gets its own emphasized block — it's the load-bearing field. */}
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[oklch(0.89_0.12_76)]">Compliance</div>
        <p className="mt-1.5 max-w-[80ch] text-sm leading-6 text-[var(--text-primary)]">{campaign.complianceNotes}</p>
      </div>
      <dl className="divide-y divide-[var(--border-hairline)]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-3 px-5 py-3 sm:grid-cols-[170px_minmax(0,1fr)]">
            <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
            <dd className="min-w-0 text-sm leading-6 text-[var(--text-secondary)]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors. (Not yet imported anywhere.)

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/campaign-brief-strip.tsx
git commit -m "feat(campaigns): add brief strip component"
```

---

## Task 6: Wire the workspace and retire the old components

**Files:**
- Modify: `src/app/campaigns/_components/campaign-workspace.tsx`
- Delete: `src/app/campaigns/_components/campaign-header.tsx`
- Delete: `src/app/campaigns/_components/campaign-package-panel.tsx`

- [ ] **Step 1: Swap the imports**

In `src/app/campaigns/_components/campaign-workspace.tsx`, remove these two import lines:

```tsx
import { CampaignHeader } from "./campaign-header";
import { CampaignOverview } from "./campaign-package-panel";
```

and add (keeping imports alphabetically grouped with the other `./` imports):

```tsx
import { CampaignBriefStrip } from "./campaign-brief-strip";
import { CampaignCommandHeader } from "./campaign-command-header";
```

- [ ] **Step 2: Replace the header + overview render block**

In the returned JSX, replace this block:

```tsx
      <CampaignHeader campaign={campaign} />

      <CampaignOverview
        detail={detail}
        pendingApprovals={pendingApprovals}
        onOpenTab={goToTab}
        onReviewApproval={reviewApproval}
      />

      <div ref={sentinelRef} aria-hidden className="h-px" />
```

with (the sentinel moves directly under the hero so the sticky bar appears once the decision scrolls away, while the brief strip stays below it):

```tsx
      <CampaignCommandHeader
        campaign={campaign}
        campaignId={campaign.id}
        pendingApprovals={pendingApprovals}
        onReviewApproval={reviewApproval}
        onOpenApprovals={() => goToTab("approvals")}
      />

      <div ref={sentinelRef} aria-hidden className="h-px" />

      <CampaignBriefStrip detail={detail} onOpenTab={goToTab} />
```

Leave everything else (`StickyDecisionBar`, the tablist, the tabpanel, all hooks and helpers) unchanged.

- [ ] **Step 3: Delete the retired components**

```bash
git rm src/app/campaigns/_components/campaign-header.tsx src/app/campaigns/_components/campaign-package-panel.tsx
```

- [ ] **Step 4: Verify nothing else references the deleted files**

Run: `git grep -nE "campaign-header|campaign-package-panel|CampaignHeader|CampaignOverview" -- src/`
Expected: **no output** (all references removed).

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 6: Keep the existing unit test green**

Run: `pnpm test src/app/campaigns/_components/__tests__/status-tone.test.ts`
Expected: PASS (no logic changed; this confirms the tone helpers still resolve).

- [ ] **Step 7: Production build**

Run: `pnpm build`
Expected: build completes with no type errors and `/campaigns/[campaignId]` compiles.

- [ ] **Step 8: Manual smoke test**

Run: `pnpm dev`, then (with a seeded campaign — `pnpm seed:test-campaign` if needed) open `/campaigns/<id>` and confirm:
- Channel sections (Digital outreach, Paid ads…) are split by tone-colored rules with dot ticks.
- A long email shows a clamped preview + "Read full email" that expands and collapses.
- The hero shows campaign identity with the pending decision fused below it; Approve/Decline and prev/next work; "See full context" expands.
- The four facts render as a line-divided row; the metric stats jump to their tabs; "Full brief & compliance" expands with Compliance emphasized at top.
- Scrolling past the hero reveals the slim single-line sticky bar; approving from it works.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(campaigns): fuse command header + brief strip into workspace, retire old panels"
```

---

## Self-Review

**Spec coverage:**
- Section dividers (A·Line) → Task 1 ✓
- Email inline expand (A) → Task 2 ✓
- Slim sticky bar → Task 3 ✓
- Fused command panel (identity + decision) → Task 4 ✓
- Facts list + inline metrics + emphasized-compliance full brief → Task 5 ✓
- Workspace wiring + retire `campaign-header.tsx`/`campaign-package-panel.tsx` → Task 6 ✓
- "Preserve all behavior" (deep-link tabs, per-asset controls, prev/next, scroll sticky, reduced-motion) → unchanged code paths in Tasks 3/4/6 ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content. ✓

**Type consistency:** `CampaignCommandHeader` props (`campaign`, `campaignId`, `pendingApprovals`, `onReviewApproval`, `onOpenApprovals`) and `CampaignBriefStrip` props (`detail`, `onOpenTab`) match exactly how Task 6 calls them. `TabKey` union matches `campaign-workspace.tsx`. `DecisionControls` (`approvalItemId`, `campaignId`, `size?`), `ApprovalContext` (`approval`, `compact`), `riskTone`/`statusTone` signatures match existing usage. ✓

**Note:** No new automated tests are added — the changes are presentational, and the only existing campaign test (`status-tone.test.ts`) is preserved and re-run in Task 6. Verification leans on `pnpm lint`, `pnpm build`, and the manual smoke test.
