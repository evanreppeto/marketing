# Design: Centralized Theme Consistency (Headers + Tabs)

Date: 2026-06-08
Status: Approved (pending spec review)
Scope: Headers + Tabs consolidation (no redesign)

## Problem

The app already has a mature, centralized design system:

- `DESIGN.md` — the spec (Signal: dark command-center palette, Archivo/Hanken/JetBrains type).
- `src/app/_components/theme.ts` — the canonical class contract (`theme.*`, `buttonClasses`, `pill`, surfaces, text, `control.tab*`).
- `src/app/_components/page-header.tsx` — shared primitives: `PageHeader`, `Panel`, `Button`, `StatusPill`, `OperatorBar`, `ActionFeedback`, `EmptyState`.

Most routes (~13: CRM + subroutes, approvals, settings, persona-intelligence, reports, outbox, gallery, partners) already use these correctly. The inconsistency is a small set of pages that **bypass** the system rather than a missing theme. This work consolidates the outliers onto the existing primitives. It is not a redesign — the only page whose look changes is campaign-detail, which adopts the standard header used everywhere else.

## Goals

- One header primitive (`PageHeader`) used by every page, including detail/not-found states.
- One tab primitive (`TabNav`) used by every tabbed page, driven by `theme.ts` tokens.
- No hand-rolled tab class strings or bespoke header components left behind.

## Non-Goals

- No changes to stub/blank pages (`/ai-studio`, `/vault/*`, `/lead-ingestion`, `/customer-types`, `/data-foundation`, `/loss-routing`).
- No full token sweep of every page (that was the "full sweep" option; not chosen).
- No new colors, fonts, spacing scale, or motion language.
- No change to `CrmCommandHeader` (it is an intentional CRM object-switcher sub-nav, not a page header).

## Current Divergences (live tree only; `.claude/worktrees/*` copies ignored)

### Tabs — same card-tab `<nav>` copy-pasted, drifting per page
- `src/app/crm/page.tsx` (`CrmTabs`, ~L90–123) — adds an active glow shadow `shadow-[0_0_20px_oklch(0.74_0.115_232/0.18)]`, idle `border-transparent`, `font-bold` label, `text-muted` detail.
- `src/app/persona-intelligence/page.tsx` (~L61–78) — `font-black` label, `border-hairline` idle, `text-secondary` detail, no glow.
- `src/app/reports/page.tsx` (`PerformanceTabs`, ~L99–120) — like personas, `px-3`, 7-col grid.
- `src/app/approvals/page.tsx` (`ApprovalTabs`, ~L71–108) — adds a one-off count badge `rounded-full bg-current/10 px-2 py-0.5`.

All four share the same container: `module-rise … grid gap-2 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2 shadow-[var(--elev-panel)]` + a per-page responsive column count and `mt`/`mb`.

Note: `theme.ts` already defines `control.tabBase` / `control.tabActive` / `control.tabIdle`, but they describe a simpler single-line tab and are currently unused.

### Headers — two bespoke components remain
- `src/app/campaigns/_components/campaign-header.tsx` (`CampaignHeader`) — bespoke `rounded-2xl` panel + radial-gradient overlay + hand-rolled back-link + Persona/Updated meta chips + lifecycle/outbound status pills. One use: `campaign-workspace.tsx:104`.
- `src/app/campaigns/_components/slim-header.tsx` (`SlimHeader`) — second hand-rolled back-link + mini title for not-found/unavailable. One use: `campaigns/[campaignId]/page.tsx:27`.

(`campaigns/page.tsx` already uses `PageHeader` — no change needed there.)

## Design

### A. Shared `TabNav` component

New file: `src/app/_components/tab-nav.tsx`.

```ts
type TabItem = {
  key: string;
  label: string;
  detail?: string;
  count?: number;     // optional badge (replaces approvals' one-off)
  href: string;
};

function TabNav({
  ariaLabel,
  tabs,
  activeKey,
  columns,            // responsive grid utility class, e.g. "sm:grid-cols-2 xl:grid-cols-4"
  className,          // for mt/mb differences, e.g. "mb-5" or "mt-4"
}: {
  ariaLabel: string;
  tabs: TabItem[];
  activeKey: string;
  columns: string;
  className?: string;
}): JSX.Element
```

Behavior:
- Renders the standardized container (`module-rise grid gap-2 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2 shadow-[var(--elev-panel)]` + `columns` + `className`).
- Each tab is a `next/link` card reading `theme.control.tabBase` + (`tabActive` | `tabIdle`).
- `aria-current="page"` on the active tab.
- Label: `font-bold text-[var(--text-primary)]`. Detail (if present): `text-xs leading-5 text-[var(--text-secondary)]`.
- Count (if present): one standardized badge (the approvals badge, promoted to the shared component).

### B. `theme.ts` token updates

Update `control.tabBase` / `control.tabActive` / `control.tabIdle` to encode the unified card style so `TabNav` is purely token-driven:
- `tabBase`: `rounded-lg border px-4 py-3 transition duration-200 hover:-translate-y-0.5 active:translate-y-px`.
- `tabActive`: `border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] shadow-[var(--accent-shadow)]` (the subtle glow, standardized for all tabs — replaces CRM's hard-coded `0_0_20px…` and the missing glow elsewhere; reuse the existing `--accent-shadow` token from globals.css).
- `tabIdle`: `border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]`.
- Add `theme.pill`-style or `control` entry for the count badge if cleaner than inlining it in the component.

If `--accent-shadow` does not exist in `globals.css`, reuse `--accent-glow`/`--accent-soft-glow` (already referenced by buttons) rather than inventing a new hard-coded shadow.

### C. `page-header.tsx` updates

- Add a `BackLink` primitive (shared by detail headers):
  ```ts
  function BackLink({ href, label }: { href: string; label: string }): JSX.Element
  ```
  Styled from tokens (the inset/hairline pill currently duplicated in `CampaignHeader`); includes the back-arrow svg. Min 44px-ish touch target consistent with the rest of the system.
- Extend `PageHeader` props with optional `backHref?: string` and `backLabel?: string`. When `backHref` is set, render `<BackLink>` above the eyebrow row. No other behavior change; existing call sites are unaffected.

### D. Migrations

Tabs → `TabNav` (delete each page's local tab function + inline class strings):
- `crm/page.tsx`: replace `CrmTabs`. Preserve `crmHref(...)`-built `href`s and `md:grid-cols-4`.
- `persona-intelligence/page.tsx`: replace inline `nav`. `sm:grid-cols-2 xl:grid-cols-4`.
- `reports/page.tsx`: replace `PerformanceTabs`. `sm:grid-cols-2 xl:grid-cols-7`.
- `approvals/page.tsx`: replace `ApprovalTabs`, passing `count` per tab.

Headers:
- `campaign-header.tsx` → `CampaignHeader` renders via `PageHeader` with `eyebrow="Campaign"`, `title={campaign.name}`, `backHref="/campaigns"`, `backLabel="campaigns"`, and `aside` carrying the lifecycle + outbound `StatusPill`s and the Persona/Updated meta chips. Drop the `rounded-2xl`/radial-gradient markup. (Decision: campaign detail matches the rest of the app.)
- `campaigns/[campaignId]/page.tsx` → replace `SlimHeader` with `PageHeader` (`backHref="/campaigns"`, `backLabel="campaigns"`, title = not-found/unavailable text). **Delete `slim-header.tsx`.**

### E. `DESIGN.md`

- Add a **Tabs** bullet to §4 Component Stylings documenting `TabNav` as the canonical tabbed-section pattern.
- Note `PageHeader`'s optional back-link for detail/record pages.

## Testing / Verification

- `pnpm lint` and `pnpm build` clean (no unused imports left from deleted tab functions / `SlimHeader`).
- Manual visual check (`pnpm dev`) of the four tabbed pages (CRM, personas, reports, approvals) and campaign detail + campaign not-found, confirming active/idle/hover states and the back-link render correctly and identically.
- Confirm no remaining references to `SlimHeader`; confirm `theme.control.tab*` is now consumed by `TabNav`.

## Risks / Notes

- The `.claude/worktrees/*` directories contain stale copies of these files — out of scope; do not edit.
- `CrmCommandHeader` is intentionally left as-is (object switcher, not a page header).
- Count-badge styling is being standardized; the approvals badge is the reference.
- Only campaign-detail changes appearance; all other migrations are visually equivalent (modulo intentional standardization of label weight/border/glow).
