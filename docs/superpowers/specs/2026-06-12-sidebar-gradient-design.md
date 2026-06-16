# Animated Gradient Background for the Global Nav Rail

**Date:** 2026-06-12
**Status:** Approved (design)
**Area:** `src/app/_components` (app chrome / sidebar)
**Branch:** `feat/sidebar-gradient` (off `origin/main`)

## Goal

Give the **global navigation rail** (the left sidebar rendered by `ConsoleFrame`) a subtle
animated gradient background, ported from the 21st.dev `BackgroundGradientAnimation`
component — recolored to the brand palette and adapted to this codebase.

## Decisions (from brainstorming)

- **Target:** the global app nav rail only (`<aside>` in `src/app/_components/console-frame.tsx`,
  styled by `theme.shell.sidebar`). Not the Arc thread sidebar.
- **Palette:** recolor to the brand palette (Command Charcoal base + antique gold + a muted
  Restoration Red), **fixed** — not driven by the active theme accent. This respects
  `DESIGN.md` ("no purple/neon AI aesthetic"); the component's neon-purple defaults are NOT used.
- **Use the real component**, adapted — not a CSS-only lookalike.
- **Intensity:** subtle/ambient. **Interactive mouse-follow:** off by default.

## Constraints discovered

- **Tailwind v4, CSS-first.** No `tailwind.config.js`. Keyframes/animations are registered in
  `src/app/globals.css` (it already defines `@keyframes` + `@theme inline` and custom animation
  classes like `.msg-rise`, `.arc-aurora`). The instructions' `tailwind.config.js` block is
  translated into v4 CSS, NOT added as a JS config.
- **No `@/lib/utils` `cn`.** The project uses `cx` from `@/app/_components/theme`. The component
  must import `cx`.
- **Not a `/components/ui` layout.** Shared UI lives in `src/app/_components/`. The component
  goes there.
- The provided component is full-viewport (`h-screen w-screen`) and writes CSS vars to
  `document.body`. Both are adapted (fills its parent; vars scoped to its own root).

## Design

### 1. New component — `src/app/_components/background-gradient-animation.tsx`

Port the provided `BackgroundGradientAnimation` with these adaptations:

- `"use client"` retained.
- Import `cx` from `./theme` and replace every `cn(...)` call with `cx(...)`.
- **Scope CSS vars to the component, not the body.** Remove the first `useEffect` that calls
  `document.body.style.setProperty(...)`. Instead build a `style` object of the same CSS custom
  properties and apply it to the component's outer `<div>` via `style={...}`. (The blob layers
  read these vars; scoping them to the root keeps the cascade working without polluting the body
  or other pages.)
- **Fill the parent, not the screen.** Outer container className changes from
  `h-screen w-screen relative overflow-hidden top-0 left-0 ...` to
  `absolute inset-0 h-full w-full overflow-hidden ...` (keep the `bg-[linear-gradient(...)]` base).
- `interactive` prop **defaults to `false`** (the pointer-follow layer + `document`-level
  mousemove is unwanted on a nav rail). The interactive branch + its `useEffect` are kept for reuse
  but inert by default. The `isSafari` blur fallback is kept.
- **Brand-recolored prop defaults** (override the neon defaults):
  - `gradientBackgroundStart = "rgb(16, 16, 19)"` (`--surface-sidebar`)
  - `gradientBackgroundEnd = "rgb(22, 22, 26)"` (`--canvas`)
  - `firstColor = "200, 162, 74"` (antique gold, `--accent`)
  - `secondColor = "184, 138, 46"` (deeper bronze gold)
  - `thirdColor = "120, 110, 80"` (warm charcoal-gold haze)
  - `fourthColor = "150, 70, 60"` (muted Restoration Red)
  - `fifthColor = "60, 60, 70"` (charcoal-blue)
  - `pointerColor = "200, 162, 74"` (gold)
  - `size = "120%"`, `blendingValue = "soft-light"` (softer than the demo's `hard-light` for a
    calm, legible rail; tune during implementation).

The component keeps its full prop surface so it stays reusable elsewhere.

### 2. `globals.css` — register animations (Tailwind v4)

Add (near the other `@keyframes`, ~line 401+):

```css
@keyframes moveHorizontal {
  0%   { transform: translateX(-50%) translateY(-10%); }
  50%  { transform: translateX(50%) translateY(10%); }
  100% { transform: translateX(-50%) translateY(-10%); }
}
@keyframes moveInCircle {
  0%   { transform: rotate(0deg); }
  50%  { transform: rotate(180deg); }
  100% { transform: rotate(360deg); }
}
@keyframes moveVertical {
  0%   { transform: translateY(-50%); }
  50%  { transform: translateY(50%); }
  100% { transform: translateY(-50%); }
}
```

Register the five animation utilities so `animate-first…fifth` resolve under v4. Add to the
existing `@theme inline` block:

```css
  --animate-first: moveVertical 30s ease infinite;
  --animate-second: moveInCircle 20s reverse infinite;
  --animate-third: moveInCircle 40s linear infinite;
  --animate-fourth: moveHorizontal 40s ease infinite;
  --animate-fifth: moveInCircle 20s ease infinite;
```

Add a reduced-motion guard (mirrors the existing pattern):

```css
@media (prefers-reduced-motion: reduce) {
  .animate-first, .animate-second, .animate-third, .animate-fourth, .animate-fifth {
    animation: none;
  }
}
```

(If `@theme` animate vars don't generate the utilities cleanly in this setup, fall back to
explicit `.animate-first { animation: var(--animate-first); }` … classes in the same file. Decide
during implementation by checking the built output.)

### 3. Wire into the rail — `src/app/_components/console-frame.tsx`

- The sidebar `<aside className={theme.shell.sidebar}>` needs a positioning/clipping context.
  Add `relative isolate overflow-hidden` to it. Cleanest: append these to the `theme.shell.sidebar`
  string in `src/app/_components/theme.ts` (preferred, single source) OR add them inline on the
  `<aside>`. The base `bg-[var(--surface-sidebar)]` stays (the no-JS / reduced-motion floor).
- Render the backdrop as the FIRST child of the `<aside>`:

```tsx
<BackgroundGradientAnimation
  aria-hidden
  className="..."           // see readability scrim below
  containerClassName="pointer-events-none absolute inset-0 -z-10"
/>
```

  `-z-10` + the aside's `isolate` keeps it behind the nav content without touching each child's
  z-index. `pointer-events-none` keeps nav clicks working.
- **Readability scrim:** pass a `children` scrim (or add to `className`) so labels and the gold
  active-indicator stay legible — e.g. a `bg-[radial-gradient(120%_80%_at_30%_20%,transparent,var(--surface-sidebar)_85%)]`
  overlay plus a low-opacity `var(--surface-sidebar)` wash, mirroring `MarkBackdrop`'s scrim.

### 4. No new dependencies

The provided component is dependency-free (React + Tailwind classes). No `@paper-design/shaders`
needed (that's the separate `MarkBackdrop`). No new packages, icons, or image assets.

## Data flow / behavior

```
ConsoleFrame <aside> (relative isolate overflow-hidden, bg --surface-sidebar)
  └─ BackgroundGradientAnimation (absolute inset-0 -z-10, pointer-events-none, aria-hidden)
       ├─ brand-colored blob layers (animate-first…fifth, blurred)
       └─ readability scrim toward --surface-sidebar
  └─ nav content (brand link, SideNav, settings nav, OperatorProfile) — paints above, unchanged
```

## Edge cases

- **Reduced motion:** keyframes frozen via the media-query guard; the static brand gradient + base
  color remain (calm, no motion).
- **Collapsed rail:** backdrop fills the `<aside>` at any width; no special handling.
- **No-JS / SSR:** the base `bg-[var(--surface-sidebar)]` and the linear-gradient base render
  without the animation; the component is client-only but degrades to the base color.
- **Legibility:** the scrim + low blob opacity keep `--text-secondary` labels and the
  `shadow-[inset_4px_0_0_var(--accent)]` active indicator readable (verify in screenshot).
- **Theme switching:** colors are fixed brand values, so the rail looks consistent across themes
  (intentional per the decision).

## Verification

- `pnpm build` — type-checks and builds.
- `pnpm exec eslint` on the changed files — no new errors.
- Manual: screenshot the rail expanded, collapsed (lg icon rail), and with
  `prefers-reduced-motion` forced — confirm legibility and that motion stops under reduced-motion.

## Out of scope

- The Arc thread sidebar and any other surface.
- Theme-accent-driven coloring (fixed brand palette chosen).
- Interactive pointer-follow (kept in the component but off by default).
