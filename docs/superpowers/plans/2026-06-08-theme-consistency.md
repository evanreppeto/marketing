# Centralized Theme Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the app's divergent page headers and copy-pasted tab navs onto two shared, token-driven primitives (`PageHeader` with an optional back-link, and a new `TabNav`) so every page renders the same Signal design system.

**Architecture:** This is a presentational consolidation, not a redesign. We add one new component (`TabNav`) and one new primitive (`BackLink`) + a `PageHeader` prop, all reading from the existing `src/app/_components/theme.ts` token contract. Then we migrate 4 tabbed pages and 2 bespoke campaign headers to them and delete the dead code. The only page whose appearance changes is campaign-detail, which adopts the standard header used everywhere else.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript, Tailwind utility classes driven by CSS custom properties in `src/app/globals.css`, `next/link`.

---

## Notes for the implementer

- **No component test framework exists** in this repo (tests are Vitest *domain* unit tests under `src/domain/__tests__/`, and these changes touch only presentational React server components). So the verification gate for each task is **`pnpm build`** (the real TypeScript/Next typecheck) + **`pnpm lint`**, plus grep assertions that dead code is gone — not unit tests. This matches the spec's testing section.
- `pnpm build` compiles the whole app, so it verifies that a migrated page still type-checks against the new primitives. It is slower than lint (~tens of seconds); that's expected.
- The existing `theme.control.tabBase` / `tabActive` / `tabIdle` tokens **already match** the unified style we want (verified against `theme.ts` lines 49–52) — do **not** rewrite them. We only add a `tabBadge` token.
- `--accent-shadow` already exists in `globals.css` (`0 0 20px oklch(0.74 0.115 232 / 0.18)`) and is exactly CRM's current hard-coded tab glow, so standardizing on it is visually identical for CRM and adds the same subtle glow to the other tab groups.
- Do **not** touch anything under `.claude/worktrees/*` (stale copies) or `CrmCommandHeader` (intentional CRM object switcher).
- Baseline check before starting: run `pnpm build` once to confirm the current working tree compiles. `src/app/_components/theme.ts` is currently untracked but present — that's the expected baseline.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/app/_components/theme.ts` | Modify | Add `control.tabBadge` token. |
| `src/app/_components/tab-nav.tsx` | Create | The shared `TabNav` component + `TabItem` type. |
| `src/app/_components/page-header.tsx` | Modify | Add `BackLink` primitive; add `backHref`/`backLabel` to `PageHeader`. |
| `src/app/approvals/page.tsx` | Modify | Replace `ApprovalTabs` with `TabNav`; delete the function. |
| `src/app/persona-intelligence/page.tsx` | Modify | Replace inline tab `<nav>` with `TabNav`. |
| `src/app/reports/page.tsx` | Modify | Replace `PerformanceTabs` with `TabNav`; delete the function. |
| `src/app/crm/page.tsx` | Modify | Replace `CrmTabs` with `TabNav`; delete the function. |
| `src/app/campaigns/_components/campaign-header.tsx` | Modify | Rewrite internals to render via `PageHeader` (same props). |
| `src/app/campaigns/[campaignId]/page.tsx` | Modify | Replace `SlimHeader` with `PageHeader`. |
| `src/app/campaigns/_components/slim-header.tsx` | Delete | Dead after the line above. |
| `DESIGN.md` | Modify | Document `TabNav` and `PageHeader` back-link. |

---

## Task 1: Add the `tabBadge` token to `theme.ts`

**Files:**
- Modify: `src/app/_components/theme.ts` (the `control` object, after the `kbd` entry on line 55)

- [ ] **Step 1: Add the token**

In `src/app/_components/theme.ts`, inside the `control: { ... }` object, add a `tabBadge` entry immediately after the `kbd` line:

```ts
    kbd: "rounded border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-1 font-mono",
    tabBadge: "rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent-contrast)]",
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm lint`
Expected: PASS (no new errors). `theme.control.tabBadge` is now available.

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/theme.ts
git commit -m "feat(theme): add tabBadge token for shared tab nav"
```

---

## Task 2: Create the `TabNav` component

**Files:**
- Create: `src/app/_components/tab-nav.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/_components/tab-nav.tsx` with this exact content:

```tsx
import Link from "next/link";

import { cx, theme } from "./theme";

export type TabItem = {
  key: string;
  label: string;
  detail?: string;
  count?: number;
  href: string;
};

/**
 * Canonical tabbed-section navigation. One source of truth for the card-tab
 * pattern that was previously copy-pasted across CRM, personas, reports, and
 * approvals. Styling comes entirely from `theme.control.tab*` tokens.
 */
export function TabNav({
  ariaLabel,
  tabs,
  activeKey,
  columns,
  className = "",
}: {
  ariaLabel: string;
  tabs: TabItem[];
  activeKey: string;
  columns: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cx(
        "module-rise grid gap-2 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2 shadow-[var(--elev-panel)]",
        columns,
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cx(theme.control.tabBase, active ? theme.control.tabActive : theme.control.tabIdle)}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-[var(--text-primary)]">{tab.label}</span>
              {tab.count !== undefined ? <span className={theme.control.tabBadge}>{tab.count}</span> : null}
            </span>
            {tab.detail ? (
              <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{tab.detail}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm lint`
Expected: PASS. (The component is unused so far — that's fine; it has no `export default` so no unused-var lint triggers.)

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/tab-nav.tsx
git commit -m "feat(ui): add shared TabNav component"
```

---

## Task 3: Add `BackLink` + `backHref`/`backLabel` to `PageHeader`

**Files:**
- Modify: `src/app/_components/page-header.tsx`

- [ ] **Step 1: Import `next/link`**

At the top of `src/app/_components/page-header.tsx`, the only import is currently from `./theme`. Add a `next/link` import above it:

```tsx
import Link from "next/link";

import { cx, theme, type ButtonSize, type ButtonVariant, type ThemeTone } from "./theme";
```

- [ ] **Step 2: Add the `BackLink` primitive**

Immediately above the `type PageHeaderProps = {` declaration, add:

```tsx
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-3 inline-flex min-h-9 items-center gap-2 self-start rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--accent)]"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M12 5 7 10l5 5" />
        <path d="M8 10h8" />
      </svg>
      Back to {label}
    </Link>
  );
}
```

- [ ] **Step 3: Extend `PageHeaderProps`**

Replace the `PageHeaderProps` type:

```tsx
type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  aside?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
};
```

- [ ] **Step 4: Render the back-link in `PageHeader`**

Update the `PageHeader` function signature and add the back-link as the first child of the `min-w-0 max-w-full` div (just before the eyebrow `<p>`):

```tsx
export function PageHeader({ eyebrow, title, description, aside, backHref, backLabel }: PageHeaderProps) {
```

and inside the JSX:

```tsx
        <div className="min-w-0 max-w-full">
          {backHref ? <BackLink href={backHref} label={backLabel ?? "back"} /> : null}
          <p className={cx("flex items-center gap-2.5", theme.text.eyebrow)}>
```

(Leave the rest of the component unchanged.)

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: PASS. Existing `PageHeader` call sites (which pass no `backHref`) are unaffected because both new props are optional.

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/page-header.tsx
git commit -m "feat(ui): add BackLink primitive and PageHeader back-link support"
```

---

## Task 4: Migrate Approvals tabs to `TabNav`

**Files:**
- Modify: `src/app/approvals/page.tsx`

Current state: `<ApprovalTabs activeTab={activeTab} queueCount={queueItems.length} historyCount={decisions.length} />` is rendered around line 42; the `ApprovalTabs` function spans roughly lines 71–108. Original hrefs: queue → `/approvals`, history → `/approvals?tab=history`.

- [ ] **Step 1: Add the `TabNav` import**

In the import block, add (the page already imports `PageHeader, StatusPill` from `@/app/_components/page-header`):

```tsx
import { TabNav } from "@/app/_components/tab-nav";
```

- [ ] **Step 2: Replace the render site**

Replace the `<ApprovalTabs ... />` usage (around line 42) with:

```tsx
      <TabNav
        ariaLabel="Review sections"
        activeKey={activeTab}
        columns="sm:grid-cols-2"
        className="mb-5"
        tabs={[
          { key: "queue", label: "Needs review", detail: "Active human approval gate.", count: queueItems.length, href: "/approvals" },
          { key: "history", label: "Decision history", detail: "Read-only approval ledger.", count: decisions.length, href: "/approvals?tab=history" },
        ]}
      />
```

- [ ] **Step 3: Delete the `ApprovalTabs` function**

Remove the entire `function ApprovalTabs({ ... }) { ... }` declaration (roughly lines 71–108). Leave the `normalizeTab` function and `ApprovalTabKey` type intact.

- [ ] **Step 4: Verify build + lint**

Run: `pnpm build && pnpm lint`
Expected: PASS, with no "unused variable" errors (if `Link` is now unused in this file, remove its import).

- [ ] **Step 5: Commit**

```bash
git add src/app/approvals/page.tsx
git commit -m "refactor(approvals): use shared TabNav"
```

---

## Task 5: Migrate Persona Intelligence tabs to `TabNav`

**Files:**
- Modify: `src/app/persona-intelligence/page.tsx`

Current state: the tabs are an inline `<nav aria-label="Persona Intelligence sections"> ... </nav>` (roughly lines 61–78). The data array is `TABS` (lines 19–24) whose items use `id` (not `key`). Active value is `activeTab`. Original href: `/persona-intelligence?tab=${tab.id}`.

- [ ] **Step 1: Add the `TabNav` import**

```tsx
import { TabNav } from "@/app/_components/tab-nav";
```

- [ ] **Step 2: Replace the inline `<nav>`**

Replace the entire inline tab `<nav> ... </nav>` block (lines ~61–78) with:

```tsx
      <TabNav
        ariaLabel="Persona Intelligence sections"
        activeKey={activeTab}
        columns="sm:grid-cols-2 xl:grid-cols-4"
        className="mb-4"
        tabs={TABS.map((tab) => ({
          key: tab.id,
          label: tab.label,
          detail: tab.detail,
          href: `/persona-intelligence?tab=${tab.id}`,
        }))}
      />
```

- [ ] **Step 3: Verify build + lint**

Run: `pnpm build && pnpm lint`
Expected: PASS. If `Link` is now unused in this file, remove its import.

- [ ] **Step 4: Commit**

```bash
git add src/app/persona-intelligence/page.tsx
git commit -m "refactor(personas): use shared TabNav"
```

---

## Task 6: Migrate Reports tabs to `TabNav`

**Files:**
- Modify: `src/app/reports/page.tsx`

Current state: `<PerformanceTabs activeTab={activeTab} />` is rendered in the page body; the `PerformanceTabs` function spans roughly lines 99–120. Data array is `performanceTabs` (lines 15–23) with `key`/`label`/`detail`. Original href: `/reports?tab=${tab.key}`. Original grid: `sm:grid-cols-2 xl:grid-cols-7`, margin `mb-5`.

- [ ] **Step 1: Add the `TabNav` import**

```tsx
import { TabNav } from "@/app/_components/tab-nav";
```

- [ ] **Step 2: Replace the render site**

Replace the `<PerformanceTabs activeTab={activeTab} />` usage with:

```tsx
      <TabNav
        ariaLabel="Performance sections"
        activeKey={activeTab}
        columns="sm:grid-cols-2 xl:grid-cols-7"
        className="mb-5"
        tabs={performanceTabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          detail: tab.detail,
          href: `/reports?tab=${tab.key}`,
        }))}
      />
```

- [ ] **Step 3: Delete the `PerformanceTabs` function**

Remove the entire `function PerformanceTabs({ ... }) { ... }` declaration (roughly lines 99–120). Keep the `performanceTabs` array and `normalizeTab`.

- [ ] **Step 4: Verify build + lint**

Run: `pnpm build && pnpm lint`
Expected: PASS. If `Link` is now unused in this file, remove its import.

- [ ] **Step 5: Commit**

```bash
git add src/app/reports/page.tsx
git commit -m "refactor(reports): use shared TabNav"
```

---

## Task 7: Migrate CRM tabs to `TabNav`

**Files:**
- Modify: `src/app/crm/page.tsx`

Current state: `<CrmTabs activeTab={activeTab} query={query} activeView={activeView} selectedId={selectedRecord?.id ?? null} />` is rendered around line 73; the `CrmTabs` function spans roughly lines 90–123. Data array is `crmTabs` (lines 23–28). Hrefs are built with `crmHref(query, { tab, view, selected })` (function at ~line 364). Original grid `md:grid-cols-4`, margin `mt-4`. Note: CRM's old idle border was `border-transparent`; standardizing to the shared `tabIdle` (hairline border) is the intended change.

- [ ] **Step 1: Add the `TabNav` import**

```tsx
import { TabNav } from "@/app/_components/tab-nav";
```

- [ ] **Step 2: Replace the render site**

`query`, `activeView`, and `selectedRecord` are in scope at the render site (line ~73). Replace the `<CrmTabs ... />` usage with:

```tsx
      <TabNav
        ariaLabel="CRM page sections"
        activeKey={activeTab}
        columns="md:grid-cols-4"
        className="mt-4"
        tabs={crmTabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          detail: tab.detail,
          href: crmHref(query, { tab: tab.key, view: activeView, selected: selectedRecord?.id ?? null }),
        }))}
      />
```

- [ ] **Step 3: Delete the `CrmTabs` function**

Remove the entire `function CrmTabs({ ... }) { ... }` declaration (roughly lines 90–123). Keep `crmTabs`, `crmHref`, `normalizeTab`, and the `CrmTabKey` type.

- [ ] **Step 4: Verify build + lint**

Run: `pnpm build && pnpm lint`
Expected: PASS. If `Link` is now unused in `crm/page.tsx`, remove its import.

- [ ] **Step 5: Commit**

```bash
git add src/app/crm/page.tsx
git commit -m "refactor(crm): use shared TabNav"
```

---

## Task 8: Rewrite `CampaignHeader` to render via `PageHeader`

**Files:**
- Modify: `src/app/campaigns/_components/campaign-header.tsx`

The exported signature stays `CampaignHeader({ campaign, launchState })`, so `campaign-workspace.tsx` (the only caller, line ~104) needs **no change**. We only replace the internals: drop the bespoke `rounded-2xl`/radial-gradient card and hand-rolled back-link; render a standard `PageHeader` with the status pills + meta chips in `aside`.

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `src/app/campaigns/_components/campaign-header.tsx` with:

```tsx
import { PageHeader, StatusPill } from "@/app/_components/page-header";
import type { CampaignLaunchState, CampaignWorkspaceMeta } from "@/lib/campaigns/read-model";

const LIFECYCLE_TONE: Record<CampaignLaunchState["lifecycle"], "blue" | "green" | "amber" | "gray"> = {
  Drafting: "gray",
  "In review": "amber",
  Ready: "green",
  Live: "blue",
};

export function CampaignHeader({ campaign, launchState }: { campaign: CampaignWorkspaceMeta; launchState: CampaignLaunchState }) {
  // Identity-at-a-glance only; the full brief below carries focus, owner, and the rest.
  const meta: Array<[string, string]> = [
    ["Persona", cleanPersonaLabel(campaign.persona)],
    ["Updated", campaign.updatedAt],
  ];

  return (
    <PageHeader
      eyebrow="Campaign"
      title={campaign.name}
      backHref="/campaigns"
      backLabel="campaigns"
      aside={
        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={LIFECYCLE_TONE[launchState.lifecycle]}>{launchState.lifecycle}</StatusPill>
            {launchState.live ? (
              <StatusPill tone="green">Outbound unlocked</StatusPill>
            ) : (
              <StatusPill tone="amber">Outbound locked</StatusPill>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
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
      }
    />
  );
}

function cleanPersonaLabel(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}
```

- [ ] **Step 2: Verify build + lint**

Run: `pnpm build && pnpm lint`
Expected: PASS. The campaign-detail page now shows the standard image-backed header with a "Back to campaigns" link.

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/campaign-header.tsx
git commit -m "refactor(campaigns): campaign-detail header uses shared PageHeader"
```

---

## Task 9: Replace `SlimHeader` with `PageHeader` and delete it

**Files:**
- Modify: `src/app/campaigns/[campaignId]/page.tsx`
- Delete: `src/app/campaigns/_components/slim-header.tsx`

`SlimHeader` is used only in `[campaignId]/page.tsx` (line ~27) for the not-found/unavailable state.

- [ ] **Step 1: Update imports**

In `src/app/campaigns/[campaignId]/page.tsx`, change the page-header import (line 3) to also bring in `PageHeader`, and remove the `SlimHeader` import (line 8):

```tsx
import { EmptyState, PageHeader } from "../../_components/page-header";
```

Delete this line:

```tsx
import { SlimHeader } from "../_components/slim-header";
```

- [ ] **Step 2: Replace the `SlimHeader` usage**

Replace the `<SlimHeader title={notFound ? "Campaign not found" : "Campaign unavailable"} backHref="/campaigns" />` line (~27) with:

```tsx
        <PageHeader
          eyebrow="Campaign"
          title={notFound ? "Campaign not found" : "Campaign unavailable"}
          backHref="/campaigns"
          backLabel="campaigns"
        />
```

- [ ] **Step 3: Delete the `slim-header.tsx` file**

```bash
git rm src/app/campaigns/_components/slim-header.tsx
```

- [ ] **Step 4: Verify no remaining references**

Run: `rg "SlimHeader" src/`
Expected: no matches.

- [ ] **Step 5: Verify build + lint**

Run: `pnpm build && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/campaigns/[campaignId]/page.tsx
git commit -m "refactor(campaigns): not-found state uses shared PageHeader; remove SlimHeader"
```

---

## Task 10: Document the primitives in `DESIGN.md`

**Files:**
- Modify: `DESIGN.md` (§4 Component Stylings)

- [ ] **Step 1: Add a Tabs bullet and back-link note**

In `DESIGN.md`, in the `## 4. Component Stylings` list, add two bullets (place the Tabs bullet after the **DataTable** bullet):

```markdown
- **Tabs** (`TabNav` in `tab-nav.tsx`, backed by `control.tab*` in `theme.ts`): the canonical tabbed-section nav — a card grid of `{key,label,detail?,count?,href}` items with one active treatment (accent border + soft fill + `--accent-shadow` glow). Use it for any in-page section switcher; never hand-roll tab class strings.
- **Back-link:** detail/record pages pass `backHref`/`backLabel` to `PageHeader` (renders the shared `BackLink`). Don't hand-roll back buttons.
```

- [ ] **Step 2: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): document TabNav and PageHeader back-link"
```

---

## Task 11: Final verification

- [ ] **Step 1: Full build + lint**

Run: `pnpm build && pnpm lint`
Expected: both PASS, clean.

- [ ] **Step 2: Assert dead code is gone**

Run each and expect **no matches**:

```bash
rg "function ApprovalTabs" src/app/approvals/page.tsx
rg "function PerformanceTabs" src/app/reports/page.tsx
rg "function CrmTabs" src/app/crm/page.tsx
rg "SlimHeader" src/
```

- [ ] **Step 3: Assert the primitives are used**

Run and expect matches in all four pages:

```bash
rg "TabNav" src/app/approvals/page.tsx src/app/persona-intelligence/page.tsx src/app/reports/page.tsx src/app/crm/page.tsx
```

- [ ] **Step 4: Manual visual check (`pnpm dev`)**

Start `pnpm dev` and confirm, on the dark Signal theme:
- `/approvals`, `/persona-intelligence`, `/reports`, `/crm` — tab groups render identically (same active glow, hairline idle border, hover lift); active tab matches the URL; approvals tabs show count badges.
- `/campaigns/<an existing id>` — campaign-detail shows the standard image-backed header with a "Back to campaigns" link, lifecycle + outbound pills, and Persona/Updated chips.
- `/campaigns/does-not-exist` — not-found shows the standard `PageHeader` with the back-link and the `EmptyState` below.
- Toggle `prefers-reduced-motion` and confirm the module-rise/hover transitions degrade gracefully.

There is no commit for this task; it is verification only.

---

## Self-Review (completed by plan author)

- **Spec coverage:** §A TabNav → Task 2; §B theme tokens → Task 1 (tab tokens already matched, only badge added — noted); §C BackLink + PageHeader → Task 3; §D tab migrations → Tasks 4–7, header migrations → Tasks 8–9; §E DESIGN.md → Task 10; testing/verification → Task 11. All covered.
- **Placeholder scan:** none — every code step shows full content.
- **Type consistency:** `TabItem`/`TabNav` props (`ariaLabel`, `tabs`, `activeKey`, `columns`, `className`) are used identically in Tasks 4–7; `theme.control.tabBadge` defined in Task 1 and consumed in Task 2; `BackLink({href,label})` defined in Task 3 and consumed by `PageHeader` (Tasks 8–9). Consistent.
