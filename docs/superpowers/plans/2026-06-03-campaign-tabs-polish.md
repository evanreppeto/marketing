# Campaign Tabs Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the non-Media campaign detail tabs to the Media tab's design recipe (content-fit layouts, tone-coded section headers, adaptive grids, glanceable counts) and make Deliverable statuses decision-aware.

**Architecture:** Extract the Media recipe's section-header into one shared `SectionHeader` component and add a pure `assetDecisionStatus` helper; then apply both across the Deliverables, Audience, Mark-notes, Approvals, and Performance tabs. Reuse existing primitives (`StatusPill`, tones, `DecisionControls`, the Media link-card visual). No data-model or persistence changes — the read-model already exposes `asset.approval`, `source.kind`, `reasoning`, and `events`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind (CSS variables), Vitest. pnpm.

**Spec:** `docs/superpowers/specs/2026-06-03-campaign-tabs-polish-design.md`

**Note on verification:** these tabs are presentational React components. The only unit-testable logic is `assetDecisionStatus` (Task 1). Every other task is verified by `pnpm lint` + `pnpm build` and **live observation** in the running app (Task 7), not unit tests. Each tab file carries pre-existing user WIP — make ONLY the edits described; if an "old" snippet isn't found verbatim, stop and report rather than guessing.

---

## File Structure

**Create:**
- `src/app/campaigns/_components/section-header.tsx` — shared tone-coded section header.
- `src/app/campaigns/_components/__tests__/status-tone.test.ts` — unit test for `assetDecisionStatus`.

**Modify:**
- `src/app/campaigns/_components/status-tone.ts` — add `assetDecisionStatus`.
- `src/app/campaigns/_components/creative-tab.tsx` — decision-aware status, adaptive grid, `SectionHeader`.
- `src/app/campaigns/_components/audience-leads-tab.tsx` — group by kind (record cards + link cards).
- `src/app/campaigns/_components/reasoning-tab.tsx` — editorial layout + vertical timeline.
- `src/app/campaigns/_components/approvals-tab.tsx` — risk rails + `SectionHeader` groupings.
- `src/app/campaigns/_components/performance-tab.tsx` — light `SectionHeader` polish.

**Unchanged:** `campaign-media-board.tsx` (the bar).

---

## Task 1: Shared `SectionHeader` + `assetDecisionStatus` (TDD for the helper)

**Files:**
- Modify: `src/app/campaigns/_components/status-tone.ts`
- Test: `src/app/campaigns/_components/__tests__/status-tone.test.ts`
- Create: `src/app/campaigns/_components/section-header.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/campaigns/_components/__tests__/status-tone.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { assetDecisionStatus } from "../status-tone";

describe("assetDecisionStatus", () => {
  it("uses the gating approval's status when an approval exists", () => {
    expect(assetDecisionStatus({ approval: { id: "a1", status: "Approved" } })).toEqual({
      label: "Approved",
      tone: "green",
    });
    expect(assetDecisionStatus({ approval: { id: "a2", status: "Pending approval" } })).toEqual({
      label: "Pending approval",
      tone: "amber",
    });
  });

  it("falls back to Draft (no pending decision) when there is no approval", () => {
    expect(assetDecisionStatus({ approval: null })).toEqual({ label: "Draft", tone: "gray" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/campaigns/_components/__tests__/status-tone.test.ts`
Expected: FAIL — `assetDecisionStatus` is not exported.

- [ ] **Step 3: Add `assetDecisionStatus` to `status-tone.ts`**

Append to `src/app/campaigns/_components/status-tone.ts`:

```ts
/** Decision-aware display status for a deliverable: the gating approval's
 *  status when one exists, otherwise "Draft" (no approval item = no pending
 *  decision), consistent with the campaign roll-up's decision-centric model. */
export function assetDecisionStatus(asset: { approval: { id: string; status: string } | null }): {
  label: string;
  tone: PillTone;
} {
  if (asset.approval) {
    return { label: asset.approval.status, tone: statusTone(asset.approval.status) };
  }
  return { label: "Draft", tone: "gray" };
}
```

(`PillTone`, `statusTone` are already in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/campaigns/_components/__tests__/status-tone.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 5: Create the shared `SectionHeader` component**

Create `src/app/campaigns/_components/section-header.tsx`:

```tsx
type Tone = "blue" | "red" | "amber" | "green" | "gray";

function toneText(tone: Tone) {
  if (tone === "red") return "text-[oklch(0.86_0.1_26)]";
  if (tone === "amber") return "text-[oklch(0.89_0.12_76)]";
  if (tone === "green") return "text-[oklch(0.84_0.13_155)]";
  if (tone === "gray") return "text-[var(--text-muted)]";
  return "text-[var(--accent)]";
}

/** Tone-coded section header (eyebrow + optional detail + right-aligned count),
 *  the pattern the Media tab uses for each group. */
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
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <div className={`text-[11px] font-black uppercase tracking-[0.16em] ${toneText(tone)}`}>{eyebrow}</div>
        {detail ? <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{detail}</p> : null}
      </div>
      {typeof count === "number" ? (
        <span className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {count} item{count === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Verify lint + commit**

Run: `pnpm lint` → expected clean.

```bash
git add src/app/campaigns/_components/status-tone.ts src/app/campaigns/_components/__tests__/status-tone.test.ts src/app/campaigns/_components/section-header.tsx
git commit -m "Add SectionHeader and decision-aware asset status helper"
```

---

## Task 2: Deliverables — decision-aware status + adaptive grid

**Files:**
- Modify: `src/app/campaigns/_components/creative-tab.tsx`

- [ ] **Step 1: Import the new helpers**

Edit the imports in `creative-tab.tsx`:
- change the existing `import { isDecidedStatus, statusTone } from "./status-tone";` to
  `import { assetDecisionStatus, isDecidedStatus } from "./status-tone";` (drop `statusTone` — after
  this task it is no longer referenced in this file; keep `isDecidedStatus`, still used by
  `isAssetDecided`/`canDecide`).
- add `import { SectionHeader } from "./section-header";`

- [ ] **Step 2: Decision-aware card header status**

In `AssetCard`, replace the header status pill:

```tsx
        <StatusPill tone={statusTone(asset.status)}>{asset.status}</StatusPill>
```

with:

```tsx
        {(() => {
          const decision = assetDecisionStatus(asset);
          return <StatusPill tone={decision.tone}>{decision.label}</StatusPill>;
        })()}
```

- [ ] **Step 3: Update the footer "not submitted" copy and drop the duplicate decided pill**

In `AssetCard`'s footer, replace:

```tsx
          {decided ? <StatusPill tone={statusTone(approval.status)}>{approval.status}</StatusPill> : null}
```

with nothing (delete that line — the header now shows the decision status). Then delete the now-unused
declaration `const decided = approval !== null && isDecidedStatus(approval.status);` near the top of
`AssetCard` (it was only referenced by the line you just removed; `canDecide` stays). And replace:

```tsx
          ) : approval === null ? (
            <span className="text-xs text-[var(--text-muted)]">Not submitted for approval</span>
```

with:

```tsx
          ) : approval === null ? (
            <span className="text-xs text-[var(--text-muted)]">Draft — not submitted</span>
```

- [ ] **Step 4: Adaptive section grid + SectionHeader**

Replace the per-section header + grid block:

```tsx
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <h3 className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{section.title}</h3>
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{section.detail}</p>
              </div>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {groups[section.key].length} item{groups[section.key].length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
```

with (uses `SectionHeader` with a per-category tone, and an auto-fill grid):

```tsx
            <SectionHeader
              tone={SECTION_TONE[section.key]}
              eyebrow={section.title}
              detail={section.detail}
              count={groups[section.key].length}
            />

            <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
```

Then add this constant near the top of the file (after the `SECTIONS` array):

```tsx
const SECTION_TONE: Record<CampaignWorkspaceAssetCategory, "blue" | "red" | "amber" | "green" | "gray"> = {
  physical: "amber",
  virtual: "blue",
  ads: "red",
  media: "green",
  other: "gray",
};
```

- [ ] **Step 5: Verify lint + commit**

Run: `pnpm lint` → expected clean.

```bash
git add src/app/campaigns/_components/creative-tab.tsx
git commit -m "Make Deliverable statuses decision-aware; adaptive grid + section headers"
```

---

## Task 3: Audience & sources — group by kind

**Files:**
- Modify: `src/app/campaigns/_components/audience-leads-tab.tsx`

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `src/app/campaigns/_components/audience-leads-tab.tsx` with:

```tsx
import type { CampaignWorkspaceSource } from "@/lib/campaigns/read-model";

import { SectionHeader } from "./section-header";

type Tone = "blue" | "red" | "amber" | "green" | "gray";

const KIND_LABELS: Record<CampaignWorkspaceSource["kind"], string> = {
  company: "Company",
  contact: "Contact",
  lead: "Lead",
  web: "Evidence",
  evidence: "Evidence",
};

// Ordered groups: record kinds first (as cards), evidence/web last (as link cards).
const GROUPS: Array<{ key: "company" | "contact" | "lead" | "evidence"; eyebrow: string; detail: string; tone: Tone }> = [
  { key: "company", eyebrow: "Companies", detail: "Partner and prospect organizations Mark linked.", tone: "blue" },
  { key: "contact", eyebrow: "Contacts", detail: "People associated with this campaign.", tone: "green" },
  { key: "lead", eyebrow: "Leads", detail: "Qualified records driving the outreach.", tone: "amber" },
  { key: "evidence", eyebrow: "Evidence & sources", detail: "External references captured by Mark.", tone: "gray" },
];

function groupOf(source: CampaignWorkspaceSource): "company" | "contact" | "lead" | "evidence" {
  if (source.kind === "company") return "company";
  if (source.kind === "contact") return "contact";
  if (source.kind === "lead") return "lead";
  return "evidence"; // web + evidence
}

export function AudienceLeadsTab({ sources }: { sources: CampaignWorkspaceSource[] }) {
  if (sources.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        No leads, contacts, or source records are linked to this campaign yet.
      </p>
    );
  }

  const grouped = GROUPS.map((group) => ({
    ...group,
    items: sources.filter((source) => groupOf(source) === group.key),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-secondary)]">The records and evidence Mark used to build this campaign.</p>

      {grouped.map((group) => (
        <section key={group.key}>
          <SectionHeader tone={group.tone} eyebrow={group.eyebrow} detail={group.detail} count={group.items.length} />
          {group.key === "evidence" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {group.items.map((source) => (
                <EvidenceCard key={source.id} source={source} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {group.items.map((source) => (
                <RecordCard key={source.id} source={source} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function RecordCard({ source }: { source: CampaignWorkspaceSource }) {
  return (
    <article className="flex flex-col rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4">
      <span className="mb-2 inline-flex w-fit items-center rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {KIND_LABELS[source.kind]}
      </span>
      <h4 className="font-bold text-[var(--text-primary)]">{source.label}</h4>
      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{source.detail}</p>
      <span className="mt-3 text-xs font-semibold text-[var(--text-muted)]">Record hidden</span>
    </article>
  );
}

function EvidenceCard({ source }: { source: CampaignWorkspaceSource }) {
  const body = (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        <span className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
          {source.url ? hostOf(source.url) : "Evidence"}
        </span>
      </div>
      <h4 className="mt-2 line-clamp-2 font-bold text-[var(--text-primary)]">{source.label}</h4>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{source.detail}</p>
      {source.url ? <span className="mt-auto pt-3 font-mono text-xs font-bold text-[var(--accent)]">Open original</span> : null}
    </div>
  );

  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="flex rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {body}
      </a>
    );
  }
  return <article className="flex rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">{body}</article>;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}
```

- [ ] **Step 2: Verify lint + commit**

Run: `pnpm lint` → expected clean.

```bash
git add src/app/campaigns/_components/audience-leads-tab.tsx
git commit -m "Group Audience & sources by kind with record and evidence cards"
```

---

## Task 4: Mark notes — editorial layout + vertical timeline

**Files:**
- Modify: `src/app/campaigns/_components/reasoning-tab.tsx`

- [ ] **Step 1: Add the featured reasoning callout**

In `reasoning-tab.tsx`, replace the first two blocks:

```tsx
      <Block title="Why Mark built this">
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{reasoning.whyBuilt}</p>
      </Block>

      <Block title="Recommended action">
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{reasoning.recommendedAction}</p>
      </Block>
```

with a single prominent accent-bordered callout:

```tsx
      <section className="overflow-hidden rounded-2xl border border-[oklch(0.76_0.14_232/0.4)] bg-[oklch(0.48_0.14_232/0.08)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] px-5 py-4">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">Why Mark built this</div>
          <p className="mt-2 text-base leading-7 text-[var(--text-primary)]">{reasoning.whyBuilt}</p>
        </div>
        <div className="px-5 py-4">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[oklch(0.84_0.13_155)]">Recommended action</div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{reasoning.recommendedAction}</p>
        </div>
      </section>
```

- [ ] **Step 2: Make guardrails warning-toned chips**

Replace the Guardrails block body:

```tsx
          <ul className="space-y-1.5">
            {reasoning.guardrailFlags.map((flag) => (
              <li key={flag} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                {flag}
              </li>
            ))}
          </ul>
```

with amber chips:

```tsx
          <div className="flex flex-wrap gap-2">
            {reasoning.guardrailFlags.map((flag) => (
              <span
                key={flag}
                className="inline-flex items-center gap-1.5 rounded-md border border-[oklch(0.78_0.14_76/0.4)] bg-[oklch(0.52_0.13_76/0.14)] px-2.5 py-1 text-xs font-semibold text-[oklch(0.89_0.12_76)]"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[oklch(0.82_0.13_85)]" />
                {flag}
              </span>
            ))}
          </div>
```

- [ ] **Step 3: Render the timeline as a vertical rail**

Replace the Campaign timeline block:

```tsx
      {events.length > 0 ? (
        <Block title="Campaign timeline">
          <ol className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="grid gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{event.occurredAt}</div>
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">{event.type}</div>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    {event.detail} <span className="text-[var(--text-muted)]">by {event.actor}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Block>
      ) : null}
```

with a rail + dots layout:

```tsx
      {events.length > 0 ? (
        <Block title="Campaign timeline">
          <ol className="relative ml-1 space-y-5 border-l border-[var(--border-strong)] pl-5">
            {events.map((event) => (
              <li key={event.id} className="relative">
                <span aria-hidden className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-panel)] bg-[var(--accent)]" />
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{event.occurredAt}</div>
                <div className="mt-0.5 font-semibold text-[var(--text-primary)]">{event.type}</div>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  {event.detail} <span className="text-[var(--text-muted)]">by {event.actor}</span>
                </p>
              </li>
            ))}
          </ol>
        </Block>
      ) : null}
```

- [ ] **Step 4: Verify lint + commit**

Run: `pnpm lint` → expected clean.

```bash
git add src/app/campaigns/_components/reasoning-tab.tsx
git commit -m "Make Mark notes editorial: featured reasoning, guardrail chips, timeline rail"
```

---

## Task 5: Approvals — risk rails + section headers

**Files:**
- Modify: `src/app/campaigns/_components/approvals-tab.tsx`

- [ ] **Step 1: Import SectionHeader and a risk rail helper**

Add `import { SectionHeader } from "./section-header";` to `approvals-tab.tsx`.

Add this helper near the top of the file (after the imports):

```tsx
function riskRail(risk: string) {
  const r = risk.toLowerCase();
  if (r.includes("high") || r.includes("critical")) return "border-l-[oklch(0.7_0.18_26)]";
  if (r.includes("medium") || r.includes("moderate")) return "border-l-[oklch(0.82_0.13_85)]";
  if (r.includes("low")) return "border-l-[oklch(0.78_0.14_158)]";
  return "border-l-[var(--border-strong)]";
}
```

- [ ] **Step 2: Replace the pending/decided section headers**

Replace:

```tsx
      {pending.length > 0 ? (
        <div className="space-y-2.5">
          {pending.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} campaignId={campaignId} defaultOpen={pending.length <= 2} focus={focus} />
          ))}
        </div>
      ) : null}

      {decided.length > 0 ? (
        <div className="space-y-2.5">
          <div className="pt-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Decided</div>
          {decided.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} campaignId={campaignId} focus={focus} />
          ))}
        </div>
      ) : null}
```

with:

```tsx
      {pending.length > 0 ? (
        <section>
          <SectionHeader tone="amber" eyebrow="Decision required" detail="Awaiting your review — outbound stays locked." count={pending.length} />
          <div className="space-y-2.5">
            {pending.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} campaignId={campaignId} defaultOpen={pending.length <= 2} focus={focus} />
            ))}
          </div>
        </section>
      ) : null}

      {decided.length > 0 ? (
        <section className="opacity-90">
          <SectionHeader tone="gray" eyebrow="Decided" detail="Resolved decision records." count={decided.length} />
          <div className="space-y-2.5">
            {decided.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} campaignId={campaignId} focus={focus} />
            ))}
          </div>
        </section>
      ) : null}
```

- [ ] **Step 3: Add the risk rail to each card**

In `ApprovalCard`, the `<article>` className currently composes focus/decided borders. Add a left rail by appending `border-l-4 ${riskRail(approval.riskLevel)}` to the article's className string. Concretely, change the article's `className={...}` so the template literal includes `border-l-4 ${riskRail(approval.riskLevel)}` (place it right after `overflow-hidden rounded-xl border`):

```tsx
      className={`overflow-hidden rounded-xl border border-l-4 ${riskRail(approval.riskLevel)} bg-[var(--surface-panel)] transition-shadow ${
        isFocused
          ? "border-[var(--accent)] shadow-[0_0_0_2px_var(--accent)]"
          : decided
            ? "border-[var(--border-panel)]"
            : "border-[oklch(0.82_0.13_85/0.4)]"
      }`}
```

(The `riskRail` left-color sits alongside the existing border color; the rail stays visible because `border-l-4` widens only the left edge.)

- [ ] **Step 4: Verify lint + commit**

Run: `pnpm lint` → expected clean.

```bash
git add src/app/campaigns/_components/approvals-tab.tsx
git commit -m "Give Approvals a risk-railed decision-queue layout"
```

---

## Task 6: Performance — light SectionHeader polish

**Files:**
- Modify: `src/app/campaigns/_components/performance-tab.tsx`

- [ ] **Step 1: Use SectionHeader for the two right-column section intros**

Add `import { SectionHeader } from "./section-header";` to `performance-tab.tsx`.

Replace the "Performance fields" intro:

```tsx
          <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
            <div className="signal-eyebrow">Performance fields</div>
            <h3 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">Needed before ROI claims</h3>
          </div>
```

with:

```tsx
          <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
            <SectionHeader tone="blue" eyebrow="Performance fields" detail="Needed before ROI claims." count={PERFORMANCE_CONTRACTS.length} />
          </div>
```

And replace the "Approval status" intro:

```tsx
            <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
              <div className="signal-eyebrow">Approval status</div>
              <h3 className="mt-1 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">Decision records</h3>
            </div>
```

with:

```tsx
            <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
              <SectionHeader tone="gray" eyebrow="Approval status" detail="Decision records." count={approvals.length} />
            </div>
```

Leave the rest of the tab (measurement cards, contracts table, human-gate aside) unchanged.

- [ ] **Step 2: Verify lint + commit**

Run: `pnpm lint` → expected clean.

```bash
git add src/app/campaigns/_components/performance-tab.tsx
git commit -m "Align Performance section intros to the shared SectionHeader"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit + lint + build**

Run: `pnpm test src/app/campaigns/_components/__tests__/status-tone.test.ts` → PASS.
Run: `pnpm lint` → clean.
Run: `pnpm build` → completes with no type errors.

- [ ] **Step 2: Live observation**

With the seeded campaign on the running dev server (`/campaigns/<id>`), open each tab and confirm:
- **Deliverables:** card header chips are decision-aware (email → "Approved", the two with pending approvals → "Pending approval", the five with no approval → "Draft"); cards reflow in an auto-fill grid; section headers are tone-coded.
- **Audience & sources:** sources are grouped by kind (Companies/Contacts/Leads/Evidence) with record cards and evidence link cards.
- **Mark notes:** featured reasoning callout at top; guardrails as amber chips; events as a vertical timeline.
- **Approvals:** each card has a risk-colored left rail; "Decision required (N)" and "Decided (N)" section headers.
- **Performance:** the two right-column intros use the shared section header.

Capture an accessibility snapshot per tab as evidence (the chrome-browser skill).

- [ ] **Step 3: Report**

Report `pnpm test` / `pnpm lint` / `pnpm build` results and the per-tab observations. No commit needed (each task committed its own work).
