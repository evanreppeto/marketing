# Campaign Cockpit Implementation Plan (Sub-project 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Replace the 7-tab individual campaign page with a one-screen Decision Cockpit — creative + decision up front, everything else behind a single right-side drawer. Re-composition only; reuse all existing tab components; no read-model/action changes.

**Architecture:** A new client orchestrator `CampaignCockpit` renders the header, the launch tracker, a thin drawer-trigger row, a two-column (creative | why/who/risk rail) body, and one generic `WorkspaceDrawer` whose content is swapped by a key. Existing components (`CreativeTab`, `MarkConversation`, `ApprovalsTab`, `PerformanceTab`, `AuditLog`, `DispatchPanel`, `CampaignMediaBoard`, `CampaignEconomicsPanel`, `AudienceLeadsTab`, `FullBrief`) are reused verbatim inside drawers or the body. A pure mapper decides which drawer a URL/key opens (tested).

**Tech stack:** Next.js 16 client components, React 19, TS, Tailwind, Vitest. Reuse `theme.ts`, `page-header.tsx`. Drawer interaction mirrors the already-built `src/app/arc/_components/agent-settings-drawer.tsx`.

---

## Context the implementer needs

`LiveCampaignWorkspace` (`@/lib/campaigns/read-model`) provides: `campaign` (name, persona, updatedAt, objective, audienceSummary, offerSummary, restorationFocus, owner, complianceNotes), `executiveOverview` (what, why, timeframe, successTracking), `launchState` (lifecycle, requiredCount, approvedCount, pendingCount, deployedCount, ready, live), `reasoning` (guardrailFlags), `groupedAssets`, `media`, `sources`, `approvals`, `approvalHistory`, `metrics` (assets, sources), `markConversation`, `auditLog`.

Current `campaign-workspace.tsx` already imports and renders all the tab components and owns the URL `tab`/`item`/`filter` logic. The cockpit replaces its tab UI but keeps the same data wiring and the `?item=` deep-link (now → Decision-log drawer open).

`campaign-package-panel.tsx` exports `CampaignOverview`; inside it are `LaunchTracker`, `ExecutiveOverview`, `GuardrailNotice`, `FullBrief` (currently NOT exported individually).

---

## Task 1: Drawer-state mapper (pure, tested)

**Files:** Create `src/app/campaigns/_components/cockpit-drawers.ts` + `cockpit-drawers.test.ts`.

Defines the drawer registry and the URL↔drawer mapping so the cockpit and tests share one source of truth.

- [ ] **Step 1: Write the failing test** (`cockpit-drawers.test.ts`)

```ts
import { describe, expect, it } from "vitest";

import { DRAWER_KEYS, drawerForUrl, isDrawerKey } from "./cockpit-drawers";

describe("cockpit drawer mapping", () => {
  it("exposes the secondary panels as drawer keys", () => {
    expect(DRAWER_KEYS).toEqual([
      "reasoning",
      "approvals",
      "performance",
      "audit",
      "dispatch",
      "media",
      "economics",
      "brief",
    ]);
  });

  it("validates drawer keys", () => {
    expect(isDrawerKey("reasoning")).toBe(true);
    expect(isDrawerKey("nope")).toBe(false);
    expect(isDrawerKey(null)).toBe(false);
  });

  it("opens the Decision log drawer when a deep-linked item is present", () => {
    expect(drawerForUrl({ drawer: null, item: "appr_123" })).toBe("approvals");
  });

  it("prefers an explicit valid drawer param over item", () => {
    expect(drawerForUrl({ drawer: "performance", item: "appr_123" })).toBe("performance");
  });

  it("returns null when nothing selects a drawer", () => {
    expect(drawerForUrl({ drawer: null, item: null })).toBe(null);
    expect(drawerForUrl({ drawer: "bogus", item: null })).toBe(null);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`pnpm test src/app/campaigns/_components/cockpit-drawers.test.ts`).

- [ ] **Step 3: Implement** (`cockpit-drawers.ts`)

```ts
export const DRAWER_KEYS = [
  "reasoning",
  "approvals",
  "performance",
  "audit",
  "dispatch",
  "media",
  "economics",
  "brief",
] as const;

export type DrawerKey = (typeof DRAWER_KEYS)[number];

export function isDrawerKey(value: string | null | undefined): value is DrawerKey {
  return value != null && (DRAWER_KEYS as readonly string[]).includes(value);
}

/** A bare `?item=` (shared Decision-log link) opens the approvals drawer; an
 *  explicit valid `?drawer=` wins; otherwise no drawer. */
export function drawerForUrl({ drawer, item }: { drawer: string | null; item: string | null }): DrawerKey | null {
  if (isDrawerKey(drawer)) return drawer;
  if (item) return "approvals";
  return null;
}
```

- [ ] **Step 4: Run it — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(campaigns): cockpit drawer-state mapper"`

---

## Task 2: WorkspaceDrawer (generic right slide-over)

**Files:** Create `src/app/campaigns/_components/workspace-drawer.tsx`.

A generic drawer modeled on `src/app/arc/_components/agent-settings-drawer.tsx` (READ it first for the exact interaction pattern). No data fetching — pure container.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useEffect, useRef } from "react";

import { cx } from "@/app/_components/theme";

/** Generic right-anchored slide-over. role=dialog, Escape + backdrop close,
 *  focus moves to the panel on open. CSS-only; mirrors the Arc agent drawer. */
export function WorkspaceDrawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label={`Close ${title}`} className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          "relative flex h-full w-full max-w-[640px] flex-col overflow-hidden border-l border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] outline-none",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3.5">
          <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** `pnpm lint` clean. Confirm `--overlay`, `--surface-panel`, `--elev-panel`, `--border-panel`, `--border-hairline` exist (they do — used by the Arc drawer).
- [ ] **Step 3: Commit** — `git commit -m "feat(campaigns): generic WorkspaceDrawer slide-over"`

---

## Task 3: Export LaunchTracker + FullBrief for standalone use

**Files:** Modify `src/app/campaigns/_components/campaign-package-panel.tsx`.

The cockpit needs `LaunchTracker` (top decision strip) and `FullBrief` (a drawer) without the rest of `CampaignOverview`. READ the file. Add `export` to the existing `function LaunchTracker(...)` and `function FullBrief(...)` declarations (change `function LaunchTracker` → `export function LaunchTracker`, same for `FullBrief`). Leave `CampaignOverview` exported and intact (it may still be used elsewhere — grep first; it's used by the current `campaign-workspace.tsx`, which Task 5 replaces).

- [ ] **Step 1:** Add `export` to `LaunchTracker` and `FullBrief`. Do not change their bodies or props.
- [ ] **Step 2:** `pnpm lint` clean; `pnpm test` green.
- [ ] **Step 3: Commit** — `git commit -m "refactor(campaigns): export LaunchTracker + FullBrief"`

---

## Task 4: CockpitRail (why / who / risk)

**Files:** Create `src/app/campaigns/_components/cockpit-rail.tsx`.

A compact presentational rail fed from `detail`. READ `campaign-package-panel.tsx` for the data fields and the `signal-eyebrow`/token styling to match.

- [ ] **Step 1: Implement**

```tsx
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

/** The decision context beside the creative: why, who, risk, and two key facts.
 *  Condensed from the executive overview + brief — no new data. */
export function CockpitRail({ detail }: { detail: LiveCampaignWorkspace }) {
  const { campaign, executiveOverview, reasoning, sources } = detail;
  const flags = reasoning.guardrailFlags;

  const blocks: Array<{ label: string; value: string; tone?: "ok" | "warn" }> = [
    { label: "Why", value: executiveOverview.why },
    { label: "Who", value: `${cleanPersona(campaign.persona)} · ${sources.length} linked source${sources.length === 1 ? "" : "s"}` },
    flags.length > 0
      ? { label: "Risk", value: `${flags.length} guardrail flag${flags.length === 1 ? "" : "s"}: ${flags.slice(0, 2).join(" / ")}`, tone: "warn" }
      : { label: "Risk", value: "No flags", tone: "ok" },
    { label: "Timeframe", value: executiveOverview.timeframe },
    { label: "Success measured by", value: executiveOverview.successTracking },
  ];

  return (
    <aside className="signal-panel module-rise space-y-3 p-4" aria-label="Campaign context">
      {blocks.map((b) => (
        <div key={b.label}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{b.label}</div>
          <p
            className={
              b.tone === "warn"
                ? "mt-1 text-sm leading-5 text-[var(--priority-text)]"
                : b.tone === "ok"
                  ? "mt-1 text-sm leading-5 text-[var(--ok-text)]"
                  : "mt-1 text-sm leading-5 text-[var(--text-secondary)]"
            }
          >
            {b.value}
          </p>
        </div>
      ))}
    </aside>
  );
}

function cleanPersona(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}
```

- [ ] **Step 2:** `pnpm lint` clean. (Confirm `--priority-text`, `--ok-text`, `signal-panel` exist — they do.)
- [ ] **Step 3: Commit** — `git commit -m "feat(campaigns): CockpitRail why/who/risk context"`

---

## Task 5: CampaignCockpit orchestrator + page wiring

**Files:** Create `src/app/campaigns/_components/campaign-cockpit.tsx`; modify `src/app/campaigns/[campaignId]/page.tsx`; the old `campaign-workspace.tsx` is replaced (delete it OR leave unused — see step). This is the integration task.

READ first: `campaign-workspace.tsx` (current data wiring + URL helpers `buildHref`/`writeParams`/`replaceParams`, the imports of every tab component, and how `?item=`/`focus` is passed to `ApprovalsTab`), `decision-controls.tsx`, the tab components' prop signatures (`CreativeTab`, `MarkConversation`, `ApprovalsTab`, `PerformanceTab`, `AuditLog`, `DispatchPanel`, `CampaignMediaBoard`, `AudienceLeadsTab`, `CampaignEconomicsPanel`), `agent-config.ts` `getAgentDisplayName` (for the "Talk to {agent}" label — but the cockpit is a client component, so the agent name must be passed in as a prop from the server page).

- [ ] **Step 1: Build `campaign-cockpit.tsx`** — a `"use client"` component:

  Signature: `export function CampaignCockpit({ detail, dispatches, economics, agentName }: { detail: LiveCampaignWorkspace; dispatches: DispatchView[]; economics: CampaignEconomics; agentName: string })` (match the real `economics`/`DispatchView` types from the page's current imports — read `[campaignId]/page.tsx`).

  Structure of the returned JSX:
  1. `<CampaignHeader campaign={detail.campaign} launchState={detail.launchState} />`
  2. `<LaunchTracker campaignId={detail.campaign.id} launchState={detail.launchState} onReviewPieces={() => {}} />` (the review-pieces scroll can be a no-op or scroll to the creative column; keep simple).
  3. A drawer-trigger row: a `flex flex-wrap gap-2` of small buttons (use the muted pill/`buttonClasses({variant:"ghost",size:"sm"})` style), one per `DRAWER_KEYS` entry, each labeled (with a count where available) and `onClick` setting the open drawer. Labels/counts:
     - reasoning → `Talk to ${agentName}` (count `detail.markConversation.length`)
     - approvals → `Decision log` (count `detail.approvals.length`)
     - performance → `Measurement`
     - audit → `Audit` (count `detail.auditLog.length`)
     - dispatch → `Dispatch` (count `dispatches.length`)
     - media → `Media` (count `detail.media.length`)
     - economics → `Economics`
     - brief → `Full brief`
  4. Two-column body (`grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5`, stacks on mobile): left = `<CreativeTab groups={detail.groupedAssets} campaignId={detail.campaign.id} filter={filterParam} onFilterChange={…} />` (match the real CreativeTab props from `campaign-workspace.tsx`); right = `<CockpitRail detail={detail} />`.
  5. One `<WorkspaceDrawer open={drawer != null} title={titleFor(drawer)} onClose={closeDrawer}>` rendering the panel for the open `drawer` key via a switch:
     - reasoning → `<MarkConversation campaignId={detail.campaign.id} conversation={detail.markConversation} reasoning={detail.reasoning} />`
     - approvals → `<ApprovalsTab approvals={detail.approvals} history={detail.approvalHistory} focus={focus} />`
     - performance → `<PerformanceTab detail={detail} />`
     - audit → `<AuditLog entries={detail.auditLog} />`
     - dispatch → `<DispatchPanel dispatches={dispatches} />`
     - media → `<CampaignMediaBoard media={detail.media} filter={filterParam} onFilterChange={…} />`
     - economics → `<CampaignEconomicsPanel economics={economics} campaignId={detail.campaign.id} />`
     - brief → `<FullBrief campaign={detail.campaign} sourceCount={detail.sources.length} />` and below it `<AudienceLeadsTab campaign={detail.campaign} sources={detail.sources} />`
     (Match each component's REAL props by reading them; the above mirror the current `campaign-workspace.tsx` call sites.)

  URL behavior: derive the open drawer from search params using `drawerForUrl({ drawer: searchParams.get("drawer"), item: searchParams.get("item") })` (import from `./cockpit-drawers`). Open a drawer via `pushState` writing `?drawer=<key>` (and clearing `item`); close by clearing both — reuse the same `buildHref`/`writeParams` pattern the current `campaign-workspace.tsx` uses (copy those helpers in). `focus` for `ApprovalsTab` stays derived from `?item=` exactly as today. Keep `filter` via `replaceParams` as today.

- [ ] **Step 2: Update `src/app/campaigns/[campaignId]/page.tsx`** — replace the render block so it computes the agent name and renders the cockpit, dropping the separate economics panel:
  - Add: `import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";` and `import { getAppSettings } from "@/lib/settings/store";` and `import { CampaignCockpit } from "../_components/campaign-cockpit";`
  - In the `live` branch: `const { agentName } = await getAppSettings();` then render only:
    ```tsx
    <CampaignCockpit detail={detail} dispatches={dispatches} economics={economics} agentName={getAgentDisplayName(agentName)} />
    ```
    Remove the `<CampaignWorkspace …/>` + separate `<CampaignEconomicsPanel …/>` lines.

- [ ] **Step 3:** Delete `src/app/campaigns/_components/campaign-workspace.tsx` IF nothing else imports it (grep `campaign-workspace` first). If something else does, leave it. Also confirm `CampaignOverview` (in package-panel) isn't left as the only consumer of now-unused code — leave package-panel exports intact regardless (LaunchTracker/FullBrief are used by the cockpit).

- [ ] **Step 4:** `pnpm lint` clean; `pnpm test` green; `pnpm build` succeeds.
- [ ] **Step 5: Commit** — `git commit -m "feat(campaigns): Decision Cockpit replaces 7-tab workspace"`

---

## Task 6: Verification pass

- [ ] `pnpm test` (green), `pnpm lint` (clean), `pnpm build` (succeeds).
- [ ] Manual (`pnpm dev`, open a campaign with data):
  - Page is one screen: header + launch strip + drawer-trigger row + creative (left) + why/who/risk rail (right). No tab bar.
  - Per-piece Approve / Request rework / Remove still work on the creative; Launch still gated on full approval.
  - Each trigger opens the correct drawer; Escape/backdrop/✕ close it; "Talk to {agent}" shows the configured agent name.
  - A shared `?item=appr_…` link opens the Decision-log drawer focused on that record.
  - Mobile: columns stack, drawer is full-width; reduced-motion safe.
- [ ] Final commit if manual fixes were needed.

## Self-review notes

- Spec coverage: cockpit layout → Tasks 4,5; drawers → Tasks 1,2,5; launch/decision preserved (reused `LaunchTracker`+`CreativeTab`) → Tasks 3,5; agent-name label → Task 5; deep-link `?item=` → Tasks 1,5.
- No read-model/action edits. All secondary content retained behind drawers.
- Type consistency: `DrawerKey`/`DRAWER_KEYS`/`drawerForUrl`/`isDrawerKey` shared by cockpit + tests; component props copied from real call sites (implementer MUST read them, since this plan mirrors but does not re-specify every tab component's signature).
