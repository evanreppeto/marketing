# Arc-First Rebuild — Plan 1: Foundation (Design System + App Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the app to the Obsidian & Gold design language and reshape the shell so the app opens into Arc — without touching the backend engine.

**Architecture:** The app already consumes a token layer (CSS custom properties in `src/app/globals.css`) via Tailwind arbitrary values like `bg-[var(--canvas)]`. We re-value those tokens (keep the names) so every existing component re-skins at once. We add a serif display font for headlines, rebuild the sidebar wordmark + nav (Arc-first, two items), and land the app on Arc's route. No component-by-component rewrite.

**Tech Stack:** Next.js 16 (App Router; middleware is `proxy.ts`), React 19, Tailwind CSS v4 (`@import "tailwindcss"` + `@theme inline`), `next/font/google`, Vitest.

**This plan is Plan 1 of a sequence.** Later plans (not in this doc): 2) Policy gate enforcement core, 3) Campaigns redesign, 4) Arc as a place (Briefing/Chat/Board/Directives), 5) Directives + triggers + run engine. This plan must leave the app building, linting, and passing tests on its own.

**Spec:** `docs/superpowers/specs/2026-06-10-arc-first-rebuild-design.md` (§5 design language, §6 IA, §7 front door).

---

## Context the engineer needs

- **Token system:** `src/app/globals.css` defines `:root` CSS variables (currently a navy/blue "Signal" theme in OKLCH). Components reference them as `var(--token)`. The body wrapper adds class `chicago-dark` (an atmosphere/gradient layer). **We keep all class names and variable names; we only change values.** Renaming would touch hundreds of files — do not rename.
- **Fonts:** `src/app/layout.tsx` loads three Google fonts via `next/font/google` and exposes them as CSS variables `--ff-display` (Archivo), `--ff-body` (Hanken Grotesk), `--ff-mono` (JetBrains Mono). `globals.css` maps these into Tailwind theme tokens `--font-display`, `--font-sans`, `--font-mono` inside `@theme inline`, and a global rule sets `h1,h2,h3,h4,.font-display` to `--font-display`.
- **Shell:** `src/app/_components/console-frame.tsx` is the persistent chrome (rendered once in `layout.tsx`). It holds a local `navItems` array (the real sidebar), the logo `<Link>`, and `<OperatorProfile>`. `SideNav` (`src/app/_components/side-nav.tsx`) renders the items; its `ShellNavItem` type needs `{ label, href, icon, matches }` where `icon` is a `NavIconName`.
- **Quick-jump:** `src/app/_components/quick-jump.tsx` builds its list from `navItems` exported by `src/app/_data/growth-engine.ts` (a different array from the sidebar's). It has a test at `src/app/_data/__tests__/growth-engine.test.ts`.
- **Commands:** `pnpm test` (vitest run, one-shot), `pnpm test <path>` (single file), `pnpm lint`, `pnpm build`, `pnpm dev`.
- **Design rules (carry over from DESIGN.md):** no emojis, no equal 3-column dashboard rows, no neon/purple. New palette is warm near-black + antique gold + ivory text.

---

## Files touched

- Modify: `src/app/globals.css` — re-value color tokens + retint atmosphere.
- Modify: `src/app/layout.tsx` — add Fraunces serif font variable.
- Modify: `src/app/globals.css` — route headings to the serif var (same file, separate step).
- Modify: `src/app/_components/console-frame.tsx` — wordmark, Arc-first nav, logo link.
- Modify: `src/app/_data/growth-engine.ts` — Arc-first nav for quick-jump.
- Modify: `src/app/_data/__tests__/growth-engine.test.ts` — assert Arc-first order.
- Create: `src/app/page.tsx` change OR a redirect — land on Arc (verify existing file first).
- Modify: `DESIGN.md` — document the Obsidian & Gold palette.

---

## Task 1: Re-value the color tokens to Obsidian & Gold

**Files:**
- Modify: `src/app/globals.css:10-92` (the `:root` block) and `src/app/globals.css:144-161` (the `.chicago-dark` atmosphere).

This is a visual change; it is verified by building and by eye, not by a unit test.

- [ ] **Step 1: Replace the `:root` token values**

In `src/app/globals.css`, replace the entire `:root { ... }` block (lines 10–92, from `:root {` through its closing `}` just before `@theme inline`) with the following. Variable **names are unchanged**; only values change. We intentionally move this palette to hex/rgba for exact fidelity to the approved mockups.

```css
:root {
  /* Surface tiers — warm near-black, stepping up for separation */
  --canvas: #16161a;            /* page background, deepest */
  --canvas-deep: #101013;       /* gutter / behind-rail void */
  --surface-panel: #1c1c21;     /* cards & modules */
  --surface-inset: #202027;     /* headers, fields, sub-blocks inside a panel */
  --surface-soft: #1a1a1e;      /* quiet strips, list backgrounds */
  --surface-raised: #23232a;    /* hover, popovers, selected */
  --surface-sidebar: #101013;
  --surface-operator: linear-gradient(145deg, #1c1c21, #101013);
  --media-void: #0e0e10;
  --overlay: rgba(8, 8, 10, 0.78);

  /* Text tiers — warm ivory */
  --text-primary: #f1ede2;
  --text-secondary: #b9b9c0;
  --text-muted: #86868e;

  /* Borders */
  --border-hairline: #2c2c33;
  --border-panel: #2c2c33;
  --border-strong: #3a3a42;

  /* Accent — antique gold */
  --accent: #c8a24a;
  --accent-strong: #d8b65e;
  --accent-soft: rgba(200, 162, 74, 0.14);
  --accent-contrast: #e6d29a;
  --accent-border: rgba(200, 162, 74, 0.30);
  --accent-border-strong: rgba(200, 162, 74, 0.48);
  --on-accent: #16161a;         /* ink on a solid gold fill */

  /* Priority — restrained red, for destructive/decline only */
  --priority: #cc6666;
  --priority-bright: #d98080;
  --priority-solid: #b25555;
  --priority-hover: #c66;
  --priority-soft: rgba(204, 102, 102, 0.16);
  --priority-text: #e0a3a3;
  --priority-border: rgba(204, 102, 102, 0.58);
  --priority-border-soft: rgba(204, 102, 102, 0.45);
  --on-priority: #ffffff;

  /* Status hues */
  --ok: #7fb89a;
  --ok-solid: #6fae8c;
  --ok-hover: #7fb89a;
  --ok-soft: rgba(127, 184, 154, 0.15);
  --ok-text: #a3d0b8;
  --ok-border: rgba(127, 184, 154, 0.55);
  --ok-border-soft: rgba(127, 184, 154, 0.40);
  --on-ok: #0e1612;

  --warn: #d8b65e;
  --warn-solid: #c8a24a;
  --warn-hover: #d8b65e;
  --warn-soft: rgba(216, 182, 94, 0.14);
  --warn-text: #e6cf8e;
  --warn-border: rgba(216, 182, 94, 0.58);
  --warn-border-soft: rgba(216, 182, 94, 0.40);
  --on-warn: #1a1505;

  --neutral-solid: #2e2e35;
  --neutral-hover: #3a3a42;
  --neutral-on: #e7e7ea;
  --neutral-border: rgba(120, 120, 130, 0.52);

  /* Elevation — neutral shadows */
  --elev-panel: 0 1px 0 rgba(255, 255, 255, 0.03) inset,
    0 18px 40px -28px rgba(0, 0, 0, 0.9),
    0 2px 6px -4px rgba(0, 0, 0, 0.7);
  --elev-raised: 0 1px 0 rgba(255, 255, 255, 0.05) inset,
    0 28px 60px -30px rgba(0, 0, 0, 0.95);

  --background: var(--canvas);
  --foreground: var(--text-primary);

  /* Legacy brand vars kept for any remaining references */
  --chicago-navy: #101013;
  --chicago-blue: #c8a24a;
  --chicago-blue-soft: #e6d29a;
  --chicago-red: #cc6666;
  --chicago-white: #f1ede2;
  --chicago-muted: #86868e;
  --chicago-border: var(--border-hairline);
}
```

- [ ] **Step 2: Retint the `.chicago-dark` atmosphere**

In `src/app/globals.css`, replace the `.chicago-dark { background: ... }` rule (lines ~144–150) with a warm gold/charcoal wash instead of blue/red:

```css
.chicago-dark {
  background:
    radial-gradient(120% 80% at 12% -8%, rgba(200, 162, 74, 0.06), transparent 52%),
    radial-gradient(90% 60% at 96% 0%, rgba(200, 162, 74, 0.03), transparent 46%),
    var(--canvas);
  color: var(--text-primary);
}
```

- [ ] **Step 3: Retint the active-nav highlight border**

In `src/app/globals.css`, find the rule `.chicago-dark a[aria-current="page"] { ... }` (around line 249). Its `border-color` uses the old blue (`oklch(0.74 0.115 232 / 0.5)`). Replace that single declaration with the gold accent border:

```css
.chicago-dark a[aria-current="page"] {
  background-color: var(--surface-raised) !important;
  color: var(--text-primary) !important;
  border-color: var(--accent-border-strong) !important;
}
```

- [ ] **Step 4: Build to verify the CSS is valid**

Run: `pnpm build`
Expected: build completes with no CSS or compile errors. (If it fails, the error names the file/line.)

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): re-skin token layer to Obsidian & Gold"
```

---

## Task 2: Add the serif display font and route headlines to it

**Files:**
- Modify: `src/app/layout.tsx:1-28` (font imports + variables) and `:48-52` (html className).
- Modify: `src/app/globals.css:94-100` (`@theme inline`) and `:115-119` (heading rule).

- [ ] **Step 1: Import Fraunces and expose it as `--ff-serif`**

In `src/app/layout.tsx`, change the font import line and add a serif font. Replace:

```ts
import { Archivo, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
```

with:

```ts
import { Archivo, Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
```

Then, directly after the existing `display` (Archivo) declaration, add:

```ts
// Serif display: editorial voice for Arc and page headlines.
const serif = Fraunces({
  subsets: ["latin"],
  variable: "--ff-serif",
  display: "swap",
  weight: ["400", "500", "600"],
});
```

- [ ] **Step 2: Add the serif variable to the `<html>` className**

In `src/app/layout.tsx`, update the `<html>` `className` to include `serif.variable`. Change:

```tsx
className={`h-full antialiased ${display.variable} ${body.variable} ${mono.variable}`}
```

to:

```tsx
className={`h-full antialiased ${display.variable} ${serif.variable} ${body.variable} ${mono.variable}`}
```

- [ ] **Step 3: Register `--font-serif` in the Tailwind theme**

In `src/app/globals.css`, inside the `@theme inline { ... }` block (around lines 94–100), add a serif token after the `--font-display` line:

```css
  --font-serif: var(--ff-serif), "Fraunces", Georgia, "Times New Roman", serif;
```

- [ ] **Step 4: Route headlines to serif**

In `src/app/globals.css`, replace the heading rule (lines ~115–119):

```css
h1, h2, h3, h4, .font-display {
  font-family: var(--font-display);
  letter-spacing: -0.022em;
  font-feature-settings: "ss01";
}
```

with a split — serif headlines, grotesk kept for the `.font-display` utility (used by metric numbers/labels):

```css
h1, h2, h3 {
  font-family: var(--font-serif);
  letter-spacing: -0.01em;
  font-weight: 500;
}

h4, .font-display {
  font-family: var(--font-display);
  letter-spacing: -0.022em;
  font-feature-settings: "ss01";
}
```

- [ ] **Step 5: Build to verify fonts resolve**

Run: `pnpm build`
Expected: build completes; no "font" or module errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat(design): serif headlines via Fraunces"
```

---

## Task 3: Rebuild the sidebar wordmark and make the nav Arc-first

**Files:**
- Modify: `src/app/_components/console-frame.tsx:11-18` (navItems), `:39-52` (logo link), `:68-86` (OperatorProfile — leave as-is).

Note: the sidebar currently has `navItems = [Campaigns, Arc]` and the logo links to `/campaigns`. The spec requires **Arc first** and the app to **open into Arc**.

- [ ] **Step 1: Reorder nav to Arc-first**

In `src/app/_components/console-frame.tsx`, replace the `navItems` array (lines ~11–18):

```ts
const navItems: ShellNavItem[] = [
  { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
  { label: "Arc", href: "/arc", icon: "arc", matches: ["/arc"] },
];
```

with Arc first:

```ts
const navItems: ShellNavItem[] = [
  { label: "Arc", href: "/arc", icon: "arc", matches: ["/arc", "/"] },
  { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
];
```

(Adding `"/"` to Arc's `matches` so the home route highlights Arc.)

- [ ] **Step 2: Point the logo at Arc and render the "Big Shoulders Marketing" wordmark**

In `src/app/_components/console-frame.tsx`, replace the logo `<Link>` block (lines ~39–52, the `<Link href="/campaigns">...</Link>` that wraps the `<Image>`) with a typographic wordmark that links to `/arc`:

```tsx
            <Link
              href="/arc"
              className="group mb-2 flex flex-col px-1.5 leading-none transition hover:opacity-90"
              aria-label="Big Shoulders Marketing — go to Arc"
            >
              <span
                className="text-[1.15rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Big Shoulders
              </span>
              <span className="mt-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.34em] text-[var(--accent)]">
                Marketing
              </span>
            </Link>
```

(The `<Image>` import may now be unused — see Step 3.)

- [ ] **Step 3: Remove the now-unused `Image` import if present**

In `src/app/_components/console-frame.tsx`, if `import Image from "next/image";` is no longer referenced anywhere in the file, delete that import line. (Lint will flag it if left unused.)

- [ ] **Step 4: Lint to confirm no unused imports / type errors**

Run: `pnpm lint`
Expected: passes with no errors. If it reports `Image` unused, remove the import (Step 3).

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/console-frame.tsx
git commit -m "feat(shell): Big Shoulders Marketing wordmark, Arc-first nav"
```

---

## Task 4: Make the quick-jump nav Arc-first (TDD)

**Files:**
- Modify: `src/app/_data/__tests__/growth-engine.test.ts`
- Modify: `src/app/_data/growth-engine.ts:3-6` (the `navItems` array)

- [ ] **Step 1: Write the failing test for Arc-first order**

In `src/app/_data/__tests__/growth-engine.test.ts`, replace the `it("exposes only Campaigns and Arc", ...)` test with:

```ts
  it("exposes Arc first, then Campaigns, and nothing else", () => {
    const labels = navItems.map((item) => item.label);
    expect(labels).toEqual(["Arc", "Campaigns"]);
  });
```

(Leave the other two `it(...)` tests — "includes a Campaigns entry" and "includes a Arc entry" — unchanged.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/_data/__tests__/growth-engine.test.ts`
Expected: FAIL — current order is `["Campaigns", "Arc"]`, assertion wants `["Arc", "Campaigns"]`.

- [ ] **Step 3: Reorder the array**

In `src/app/_data/growth-engine.ts`, replace the `navItems` array (lines ~3–6):

```ts
export const navItems = [
  { label: "Arc", href: "/arc", icon: "agents" },
  { label: "Campaigns", href: "/campaigns", icon: "approval" },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/_data/__tests__/growth-engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/_data/growth-engine.ts src/app/_data/__tests__/growth-engine.test.ts
git commit -m "feat(shell): Arc-first quick-jump order"
```

---

## Task 5: Land the app on Arc

**Files:**
- Read first: `src/app/page.tsx` (the current home / "Today" route).
- Modify or replace: `src/app/page.tsx`.

The spec says the app opens into Arc's Briefing. Arc's full Briefing is built in Plan 4; for now, the home route should **redirect to `/arc`** so the entry point is correct and there is no stale "Today" dashboard.

- [ ] **Step 1: Inspect the current home route**

Run: `cat src/app/page.tsx` (or open it). Note whether it is an async server component and what it renders. We are replacing its body with a redirect.

- [ ] **Step 2: Replace `src/app/page.tsx` with a redirect to Arc**

Replace the entire contents of `src/app/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

// The app opens into Arc. The full Briefing lives at /arc (built in a later
// plan); the home route simply forwards there so there is one front door.
export default function HomePage() {
  redirect("/arc");
}
```

- [ ] **Step 3: Verify the redirect builds and the old home no longer renders**

Run: `pnpm build`
Expected: build completes. `/` is now a redirect to `/arc`.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(shell): land the app on Arc (/ redirects to /arc)"
```

---

## Task 6: Update DESIGN.md to the Obsidian & Gold palette

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Read the current DESIGN.md**

Run: `cat DESIGN.md` to see its structure (it currently describes Command Charcoal / Canvas White / Restoration Red).

- [ ] **Step 2: Replace the palette section**

Update the palette/color section of `DESIGN.md` to describe the new system. Add (or replace the existing palette description with) this block near the top of the color section:

```markdown
## Palette — Obsidian & Gold

The app uses a warm, minimalist black-and-gold system (token values live in
`src/app/globals.css` `:root`).

- **Canvas:** warm near-black — `--canvas` `#16161a`, deepest `--canvas-deep` `#101013`.
- **Surfaces:** step up `--surface-soft` `#1a1a1e` → `--surface-panel` `#1c1c21` → `--surface-inset` `#202027` → `--surface-raised` `#23232a`.
- **Text:** warm ivory `--text-primary` `#f1ede2`, secondary `#b9b9c0`, muted `#86868e`.
- **Accent:** antique gold `--accent` `#c8a24a` (ink-on-gold via `--on-accent` `#16161a`).
- **Status:** live/ok green `--ok` `#7fb89a`; "needs you"/warn gold `--warn` `#d8b65e`; destructive only red `--priority` `#cc6666`.
- **Headlines:** serif (`--font-serif`, Fraunces) for page titles and Arc's voice; grotesk (`--font-display`) for metrics/labels; body `--font-sans`.

Rules that carry over: **no emojis, no equal 3-column dashboard rows, no neon/purple "AI" aesthetic.** Premium, calm, low-fatigue.
```

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): document the Obsidian & Gold palette"
```

---

## Task 7: Full verification pass

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass (including the updated `growth-engine.test.ts`).

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: clean production build.

- [ ] **Step 4: Visual smoke check**

Run: `pnpm dev`, open the app. Confirm:
- The app loads at `/` and redirects to `/arc`.
- Background is warm near-black; the sidebar shows the **Big Shoulders / Marketing** wordmark in gold.
- Nav shows **Arc** then **Campaigns** only; the active item has a gold highlight.
- Open `/campaigns`: page titles render in serif; panels are dark with gold accents; no blue/navy remnants on primary surfaces.
- No console errors.

(There are no automated visual tests; this step is a manual confirmation. If the `run` skill is available, use it to launch and screenshot.)

- [ ] **Step 5: Final commit (if any stray formatting changed)**

```bash
git status   # should be clean; if formatting changed, add & commit
```

---

## Self-review notes (already applied)

- **Spec coverage:** §5 design language → Tasks 1–2, 6. §6 IA (nav = Arc + Campaigns, Arc first; "Arc" name in one place = the wordmark/nav) → Tasks 3–4. §7 front door (open into Arc) → Task 5. Arc's *internal* views (Briefing/Chat/Board/Directives), Campaigns redesign, and the policy gate are intentionally deferred to Plans 2–5.
- **No backend touched:** consistent with §3/§4 (reset experience, keep engine).
- **Type consistency:** `ShellNavItem` requires `icon: NavIconName` — Task 3 uses `"arc"`/`"campaigns"`, which the file already used, so they are valid icon names. `growth-engine.ts` `navItems` is a looser shape (`icon: string`) consumed only by quick-jump; `"agents"`/`"approval"` match its prior values.
- **Open item for the implementer:** Task 5 assumes `src/app/page.tsx` exists; Step 1 verifies before replacing. If the home route lives elsewhere, redirect from the actual home file instead.
