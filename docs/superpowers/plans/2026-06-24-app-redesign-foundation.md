# App Redesign — Foundation Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole app feel calmer and more premium by globally removing decorative noise, flattening primitives, and tidying the navigation — giving every later page-by-page redesign a consistent base.

**Architecture:** Restyle the existing Signal primitives and shell in place — no rebuild. Subtract decoration (particle field, auras, glows), flatten panels, regroup the nav into 3 tidy groups, and relocate three rail items (Activity, Usage, Outbox) into logical parents at the link level. The `/arc` and `/mark` surfaces are deliberately left rich. Deep content-merging of relocated routes is deferred to those pages' own redesign cycles.

**Tech Stack:** Next.js 16, React 19, Tailwind (CSS variables in `globals.css`), the Signal theme (`src/app/_components/theme.ts`), `TabNav` (`src/app/_components/tab-nav.tsx`).

**Reference spec:** `docs/superpowers/specs/2026-06-24-app-redesign-foundation-design.md`

**Verification note:** These are presentation/IA changes, not unit-testable logic. The verification per task is: `pnpm build` (type-checks + compiles), targeted `npx eslint <changed files>` (project `pnpm lint` is eslint-only and scans vendored files — scope to changed files per repo convention), and a preview check with the preview tools. Commit after each task.

---

### Task 1: Remove the particle field & glow washes from the shell

**Files:**
- Modify: `src/app/_components/console-frame.tsx` (the `FlowFieldBackground` import; the sidebar decorative block ~lines 233-237; the content `section` decorative block ~lines 295-314)

- [ ] **Step 1: Remove the FlowFieldBackground import**

Delete this import line near the top of `console-frame.tsx`:

```tsx
import FlowFieldBackground from "@/components/ui/flow-field-background";
```

- [ ] **Step 2: Flatten the content section background**

Find the non-`/arc` content branch (currently renders the `FlowFieldBackground` + radial gradient overlay):

```tsx
            <section className="arc-graphite relative isolate min-w-0 flex-1 lg:min-h-0 lg:overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                <FlowFieldBackground
                  className="absolute inset-0 opacity-22"
                  particleCount={360}
                  speed={0.38}
                  trailOpacity={0.08}
                />
                <div className="absolute inset-0 bg-[radial-gradient(90%_65%_at_8%_-8%,rgba(200,162,74,0.12),transparent_50%),radial-gradient(70%_54%_at_105%_0%,rgba(127,184,154,0.06),transparent_48%),linear-gradient(180deg,rgba(22,22,26,0.22),rgba(22,22,26,0.72)_62%,rgba(22,22,26,0.93))]" />
              </div>
              <div className="h-full w-full px-3 py-4 sm:px-5 lg:h-screen lg:overflow-y-auto lg:px-5 lg:py-5 xl:px-6 2xl:px-7">
                <ShellContent>{children}</ShellContent>
              </div>
            </section>
```

Replace it with a flat calm canvas (the whole decorative `<div aria-hidden>` block is removed):

```tsx
            <section className="relative isolate min-w-0 flex-1 bg-[var(--canvas)] lg:min-h-0 lg:overflow-hidden">
              <div className="h-full w-full px-3 py-4 sm:px-5 lg:h-screen lg:overflow-y-auto lg:px-5 lg:py-5 xl:px-6 2xl:px-7">
                <ShellContent>{children}</ShellContent>
              </div>
            </section>
```

- [ ] **Step 3: Remove the sidebar glow block**

In the `<aside>`, delete this decorative layer entirely:

```tsx
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
              <div className="arc-rail-glow" />
              <div className="absolute inset-0 bg-[radial-gradient(110%_45%_at_24%_-8%,color-mix(in_srgb,var(--accent)_6%,transparent),transparent_54%),linear-gradient(180deg,transparent_60%,rgba(0,0,0,0.22))]" />
              <div className="absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" />
            </div>
```

The sidebar keeps its base surface from `theme.shell.sidebar` — no glow.

- [ ] **Step 4: Verify build + lint**

Run: `pnpm build`
Expected: compiles with no errors (no unused-import error for `FlowFieldBackground`).
Run: `npx eslint src/app/_components/console-frame.tsx`
Expected: no errors.

- [ ] **Step 5: Preview check**

Start the app (`preview_start` or existing server), load `/` and one list page (`/campaigns`). Confirm: no moving particles, flat dark canvas, sidebar has no glow pool. `preview_console_logs` shows no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/console-frame.tsx
git commit -m "refactor(shell): remove particle field and glow washes for a calm canvas"
```

---

### Task 2: Neutralize decorative CSS (auras, rail glow, focal-card bloom)

**Files:**
- Modify: `src/app/globals.css` (`.arc-rail-glow` ~255-273; `.hero-aura` ~854-871; `.focal-card` ~876-897)

- [ ] **Step 1: Delete the `.arc-rail-glow` rules**

Remove the entire `.arc-rail-glow` block, its `@keyframes arc-rail-glow-drift`, and the reduced-motion override for it (the comment + rules spanning ~lines 252-273). Its only usage was removed in Task 1.

- [ ] **Step 2: Neutralize `.hero-aura` globally**

`.hero-aura` is referenced on many pages (Today, personas, crm, etc.). Kill the effect centrally instead of editing each page — replace the whole `.hero-aura` rule and its `@keyframes`/reduced-motion override (~lines 851-871) with:

```css
/* Hero aura retired in the redesign foundation — the calm canvas replaces the
   accent bloom. Kept as a no-op so existing `.hero-aura` markup is harmless
   until each page drops the dead class during its own redesign cycle. */
.hero-aura { display: none; }
```

- [ ] **Step 3: Strip the focal-card glow, keep the warm hairline**

Replace the `.focal-card` rules (~lines 876-897) with a version that keeps the one allowed focal cue (a border that warms on hover) but drops the constant `::before` radial glow and the 44px accent bloom shadow:

```css
/* Focal card — the single "primary action" block per surface. The one allowed
   focal cue: a hairline that warms on hover. No glow bloom (redesign foundation). */
.focal-card {
  position: relative;
  overflow: hidden;
  transition: border-color 220ms ease;
}
.focal-card:hover {
  border-color: var(--accent-border-strong);
}
```

- [ ] **Step 4: Verify build + lint**

Run: `pnpm build`
Expected: compiles cleanly.
Run: `npx stylelint src/app/globals.css` if configured, else skip — otherwise rely on `pnpm build`.

- [ ] **Step 5: Preview check**

Reload `/`. Confirm the "Top priority" focal card still reads as primary (warm border on hover) but has no glow halo; no aura behind the "Today" title.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "refactor(theme): retire hero aura, rail glow, and focal-card bloom"
```

---

### Task 3: Flatten panels and confirm calm hover

**Files:**
- Modify: `src/app/globals.css` (`.signal-panel` rule — locate by search)
- Inspect: `src/app/_components/theme.ts` (`shell` + any panel/button decorative gradients)

- [ ] **Step 1: Find and flatten `.signal-panel`**

Search: `grep -n "signal-panel" src/app/globals.css`. The `.signal-panel` rule currently layers a panel surface + a subtle top highlight + `--elev-panel` shadow. Reduce it to: panel surface background, a 1px `--border-panel` border, and a minimal shadow. Remove the inner top-highlight gradient/`inset` highlight if present. Target end state (adapt to the existing property names actually in the file):

```css
.signal-panel {
  background: var(--surface-panel);
  border: 1px solid var(--border-panel);
  border-radius: 0.75rem;
  box-shadow: var(--elev-panel); /* keep if subtle; drop any second stacked highlight layer */
}
```

Keep the radius and border tokens that already exist; the change is removing the stacked highlight so panels read flat.

- [ ] **Step 2: Audit theme.ts shell for decorative gradients**

Open `src/app/_components/theme.ts`. In the `shell` object (`canvas`, `sidebar`), if either applies a multi-stop gradient/glow background, simplify to a flat token background (`bg-[var(--canvas)]` for canvas, the existing sidebar surface token for sidebar). Leave structural classes (fl, layout) untouched. If they are already flat, make no change and note it.

- [ ] **Step 3: Verify build + lint**

Run: `pnpm build`
Expected: compiles cleanly.

- [ ] **Step 4: Preview check**

Reload `/campaigns`. Confirm panels read as flat hairline-bordered cards (no glossy top highlight), and hovering a list row only steps background/border (no lift, no glow).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/_components/theme.ts
git commit -m "refactor(theme): flatten panels and shell surfaces"
```

---

### Task 4: Regroup the navigation rail into Work / Studio / Intelligence

**Files:**
- Modify: `src/app/_components/console-frame.tsx` (the nav arrays ~lines 105-145; the `SidebarSection` group blocks ~lines 273-288; `MobileNavDock` groupings)

- [ ] **Step 1: Rewrite the nav arrays**

Replace the existing `growthNavItems` / `intelligenceNavItems` / `assetNavItems` definitions (~lines 109-130) with the calmer IA. Note `Brand` keeps `matches: ["/library"]` and `href: "/library/brand"` as today; `Board` keeps `matches: ["/board"]`. Activity, Usage, Outbox are removed from the rail (relocated in Tasks 5-6).

```tsx
  const workNavItems: ShellNavItem[] = [
    { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
    { label: "CRM", href: "/crm", icon: "crm", matches: ["/crm"] },
    { label: "Opportunities", href: "/opportunities", icon: "opportunities", matches: ["/opportunities"] },
  ];

  const studioNavItems: ShellNavItem[] = [
    { label: "Brand & Files", href: "/library/brand", icon: "brand", matches: ["/library"] },
    { label: "Gallery", href: "/gallery", icon: "gallery", matches: ["/gallery"] },
    { label: "Board", href: "/board", icon: "board", matches: ["/board"] },
  ];

  const intelligenceNavItems: ShellNavItem[] = [
    { label: "Analytics", href: "/analytics", icon: "analytics", matches: ["/analytics"] },
    { label: "Brain", href: "/brain", icon: "brain", matches: ["/brain"] },
    { label: "Personas", href: "/personas", icon: "personas", matches: ["/personas"] },
  ];
```

- [ ] **Step 2: Update the combined `navItems` array**

Replace the `navItems` composition (~lines 132-138) so it references the renamed arrays:

```tsx
  const navItems: ShellNavItem[] = [
    homeNavItems[0],
    { label: agentName, href: "/arc", icon: "arc", matches: ["/arc"] },
    ...workNavItems,
    ...studioNavItems,
    ...intelligenceNavItems,
  ];
```

- [ ] **Step 3: Update the desktop sidebar group blocks**

In the rendered groups (~lines 273-288), update the three `SidebarSection` blocks to the new labels + arrays (keep the first "Workspace"/Home group and the `ArcCommandLink` above them unchanged):

```tsx
                  <SidebarSection collapsed={sidebarCollapsed} divider label="Work">
                    <SideNav active={pathname} items={workNavItems} collapsed={sidebarCollapsed} />
                  </SidebarSection>

                  <SidebarSection collapsed={sidebarCollapsed} divider label="Studio">
                    <SideNav active={pathname} items={studioNavItems} collapsed={sidebarCollapsed} />
                  </SidebarSection>

                  <SidebarSection collapsed={sidebarCollapsed} divider label="Intelligence">
                    <SideNav active={pathname} items={intelligenceNavItems} collapsed={sidebarCollapsed} />
                  </SidebarSection>
```

- [ ] **Step 4: Fix the mobile dock references**

`mobilePrimaryNavItems` (~line 143) currently reads `growthNavItems[0]`/`growthNavItems[1]`. Update to the renamed array:

```tsx
  const mobilePrimaryNavItems = [homeNavItems[0], navItems[1], workNavItems[0], workNavItems[1]];
```

`mobileMoreNavItems` derives from `navItems` and needs no change. Confirm no other reference to `growthNavItems` / `assetNavItems` remains (`grep -n "growthNavItems\|assetNavItems" src/app/_components/console-frame.tsx` → no results).

- [ ] **Step 5: Verify build + lint**

Run: `pnpm build`
Expected: compiles; no "growthNavItems is not defined" errors.
Run: `npx eslint src/app/_components/console-frame.tsx`
Expected: no errors.

- [ ] **Step 6: Preview check**

Load the app. Desktop rail shows: Home, Arc, then **Work** (Campaigns, CRM, Opportunities), **Studio** (Brand & Files, Gallery, Board), **Intelligence** (Analytics, Brain, Personas), Settings at the base. Navigate to `/campaigns` and `/analytics` and confirm the active item highlights in the correct group. Shrink to mobile width; confirm the dock + "More" menu list all destinations.

- [ ] **Step 7: Commit**

```bash
git add src/app/_components/console-frame.tsx
git commit -m "feat(nav): regroup rail into Work, Studio, Intelligence"
```

---

### Task 5: Relocate Activity → Analytics and Outbox → Board (view tabs)

A small shared two-item view switch makes each relocated route reachable from its new parent, using the canonical `TabNav`. No internal redesign of the parent pages.

**Files:**
- Modify: `src/app/analytics/page.tsx` (add a view switch above the content)
- Modify: `src/app/activity/page.tsx` (add the matching view switch, Activity active)
- Modify: `src/app/board/page.tsx` (add a view switch above the content)
- Modify: `src/app/outbox/page.tsx` (add the matching view switch, Outbox active)

- [ ] **Step 1: Add the Analytics ↔ Activity view switch on Analytics**

In `src/app/analytics/page.tsx`, add the import:

```tsx
import { TabNav } from "../_components/tab-nav";
```

Then render a view switch as the first child inside `<WorkbenchFrame>` (immediately before the `{statItems ? ... }` line, ~line 126):

```tsx
      <TabNav
        ariaLabel="Analytics views"
        activeKey="performance"
        columns=""
        className="mb-4"
        tabs={[
          { key: "performance", label: "Performance", href: "/analytics" },
          { key: "activity", label: "Activity", href: "/activity" },
        ]}
      />
```

(`columns=""` → the `TabNav` renders the scrollable flex row, correct for a 2-item switch.)

- [ ] **Step 2: Add the matching switch on Activity**

In `src/app/activity/page.tsx`, import `TabNav` the same way and render the same switch with `activeKey="activity"` at the top of the page's returned content (just inside the outer fragment/wrapper, above the existing header/content). Use the identical `tabs` array so the two pages read as one surface.

- [ ] **Step 3: Add the Board ↔ Outbox view switch on Board**

In `src/app/board/page.tsx`, import `TabNav`. Render it as the first element inside the returned fragment, above `<Header .../>` is awkward — instead place it immediately after `<Header agentName={agentName} />` and before `<StatStrip ... />` (~line 41):

```tsx
      <TabNav
        ariaLabel="Board views"
        activeKey="board"
        columns=""
        className="mb-4"
        tabs={[
          { key: "board", label: "Board", href: "/board" },
          { key: "outbox", label: "Outbox", href: "/outbox" },
        ]}
      />
```

- [ ] **Step 4: Add the matching switch on Outbox**

In `src/app/outbox/page.tsx`, import `TabNav` and render the same Board/Outbox switch with `activeKey="outbox"` near the top of the page content. Match the `tabs` array exactly.

- [ ] **Step 5: Verify build + lint**

Run: `pnpm build`
Expected: compiles cleanly.
Run: `npx eslint src/app/analytics/page.tsx src/app/activity/page.tsx src/app/board/page.tsx src/app/outbox/page.tsx`
Expected: no errors.

- [ ] **Step 6: Preview check**

Visit `/analytics` → click the **Activity** tab → lands on `/activity` with Activity active; click **Performance** → back to `/analytics`. Repeat `/board` ↔ `/outbox`. Confirm both relocated routes are now reachable without the rail entries.

- [ ] **Step 7: Commit**

```bash
git add src/app/analytics/page.tsx src/app/activity/page.tsx src/app/board/page.tsx src/app/outbox/page.tsx
git commit -m "feat(nav): surface Activity under Analytics and Outbox under Board via view tabs"
```

---

### Task 6: Relocate Usage → Settings

Add a Usage section to Settings that links to the existing `/usage` route (link-level relocation; deeper embedding deferred to the Settings redesign cycle).

**Files:**
- Modify: `src/app/settings/settings-sections.ts` (add a `usage` section)
- Modify: `src/app/settings/page.tsx` (add a `usage` panel to the `SettingsShell` panel map)
- Create: `src/app/settings/usage-settings.tsx` (the panel component)

- [ ] **Step 1: Add the `usage` settings section**

In `settings-sections.ts`, add `Gauge` to the lucide import list, then add this entry to `SETTINGS_SECTIONS` in the `"Account"` group (after `account`, before/after `system`):

```tsx
  {
    id: "usage",
    label: "Usage & billing",
    group: "Account",
    icon: Gauge,
    blurb: "Token usage, run volume, and plan limits.",
    keywords: "usage billing tokens credits plan limits volume spend cost",
  },
```

- [ ] **Step 2: Create the Usage settings panel**

Create `src/app/settings/usage-settings.tsx`:

```tsx
import Link from "next/link";

import { buttonClasses, Panel } from "../_components/page-header";

export function UsageSettings() {
  return (
    <Panel className="p-5">
      <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
        Usage &amp; billing
      </h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-6 text-[var(--text-secondary)]">
        Token usage, run volume, and plan limits live on the full usage report.
      </p>
      <div className="mt-4 inline-flex">
        <Link className={buttonClasses({ size: "sm" })} href="/usage">
          Open usage report&nbsp;→
        </Link>
      </div>
    </Panel>
  );
}
```

(Confirm `buttonClasses` and `Panel` are exported from `_components/page-header` — they are used this way in `src/app/page.tsx`.)

- [ ] **Step 3: Wire the panel into the Settings shell**

In `src/app/settings/page.tsx`, add the import:

```tsx
import { UsageSettings } from "./usage-settings";
```

Add `usage: <UsageSettings />,` to the `panels={{ ... }}` map passed to `<SettingsShell>` (~line 59).

- [ ] **Step 4: Verify build + lint**

Run: `pnpm build`
Expected: compiles; the `usage` id is now a valid `SettingsSectionId`.
Run: `npx eslint src/app/settings/settings-sections.ts src/app/settings/page.tsx src/app/settings/usage-settings.tsx`
Expected: no errors.

- [ ] **Step 5: Preview check**

Visit `/settings?section=usage` → the Usage & billing section renders with a working "Open usage report" link to `/usage`. Confirm "Usage & billing" appears in the Settings rail under Account.

- [ ] **Step 6: Commit**

```bash
git add src/app/settings/settings-sections.ts src/app/settings/page.tsx src/app/settings/usage-settings.tsx
git commit -m "feat(settings): relocate Usage into Settings"
```

---

### Task 7: Document the calm principles + IA in DESIGN.md

**Files:**
- Modify: `DESIGN.md` (add a "Redesign — Calm Principles" subsection; update the nav/IA description)

- [ ] **Step 1: Add the calm-principles checklist**

Append a new subsection to `DESIGN.md` (e.g. under §5 Layout or §8 Anti-Patterns) titled **"Redesign — Calm Principles (every page must follow)"**:

```markdown
## Redesign — Calm Principles (every page must follow)

The foundation pass removed ambient decoration (particle field, hero auras, rail
glow, focal-card bloom). Every redesigned page inherits these rules:

- Lead with the operational task; exactly **one focal moment** per screen.
- Whitespace and hairlines over cards-in-cards; **no nested panels**.
- **No equal 3-column dashboard rows**; use asymmetric grids.
- **One accent use** per screen (the primary/focal cue); one serif (Fraunces)
  display moment (the page title).
- **Calm motion only:** short fades; no levitation (`hover:-translate-y-*`) or
  glow on ordinary elements; at most one live `.status-breathe` dot per view.
- `/arc` and `/mark` are the deliberate rich exceptions — these rules don't bind them.
```

- [ ] **Step 2: Update the navigation description**

Update the nav/IA reference (in `DESIGN.md` and, if it still describes the old groups, the relevant note in `CLAUDE.md`) to the new structure: **Home, Arc; Work (Campaigns, CRM, Opportunities); Studio (Brand & Files, Gallery, Board); Intelligence (Analytics, Brain, Personas); Settings.** Note that Activity is reachable as a view tab on Analytics, Outbox as a view tab on Board, and Usage as a Settings section.

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md CLAUDE.md
git commit -m "docs(design): add calm principles and updated IA"
```

---

### Task 8: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Type-check + build**

Run: `pnpm build`
Expected: success, no type or compile errors.

- [ ] **Step 2: Tests**

Run: `pnpm test`
Expected: pass (this pass changes no domain logic; if a snapshot/DOM test references removed decorative classes or old nav labels, update it to match the new output and note it in the commit).

- [ ] **Step 3: Lint changed files**

Run: `npx eslint` over every file changed in Tasks 1-7.
Expected: no errors.

- [ ] **Step 4: Preview sweep**

With the preview server running, walk: `/` (calm canvas, no particles, focal card without glow), `/campaigns` (flat panels, calm hover), `/analytics` ↔ `/activity` (view tabs), `/board` ↔ `/outbox` (view tabs), `/settings?section=usage` (Usage link). For each, `preview_console_logs` shows no new errors and `preview_snapshot` confirms structure. Capture one before/after-style screenshot of `/` to share.

- [ ] **Step 5: Final commit (if any test/lint fixups were needed)**

```bash
git add -A
git commit -m "chore(redesign): foundation pass verification fixups"
```

---

## Self-review notes

- **Spec coverage:** Decoration kill-list → Tasks 1-2; token/primitive tightening → Tasks 2-3; nav restructure → Task 4; route moves (Activity/Usage/Outbox) → Tasks 5-6; calm principles → Task 7; success criteria/verification → Task 8. Arc/Mark left untouched (Tasks 1-3 only touch the non-`/arc` branch and global decoration). Spacing standard is folded into the DESIGN.md principles + the existing section padding (no new token invented — YAGNI).
- **Deferred (intentional, per spec):** deep content-merging of Activity/Usage/Outbox into their parents, and removing now-dead `.hero-aura` classNames from individual pages, happen during each page's own redesign cycle. `.hero-aura` is neutralized centrally so it's harmless meanwhile.
- **Type consistency:** nav arrays renamed `growth/asset` → `work/studio` and all references updated (Task 4 steps 2 & 4). `TabNav` props (`ariaLabel`, `tabs`, `activeKey`, `columns`, `className`) match `tab-nav.tsx`. New `usage` id flows through `SettingsSectionId`.
