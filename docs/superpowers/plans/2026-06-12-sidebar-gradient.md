# Sidebar Animated Gradient — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a subtle, brand-recolored animated gradient as the background of the global navigation rail.

**Architecture:** Port the 21st.dev `BackgroundGradientAnimation` into `src/app/_components/`, adapted for this codebase (`cx` instead of `cn`, color vars scoped to the component root instead of `document.body`, fills its parent instead of the viewport, `interactive` off by default, brand palette). Register its keyframes/animation classes in `globals.css` (Tailwind v4, CSS-first) with a reduced-motion freeze. Mount it as a clipped, `-z-10`, `aria-hidden` backdrop behind the `ConsoleFrame` `<aside>`, with a readability scrim toward `--surface-sidebar`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4 (CSS-first, no `tailwind.config.js`).

**Spec:** `docs/superpowers/specs/2026-06-12-sidebar-gradient-design.md`

**No automated tests** — this is purely visual/CSS. Each task verifies with `pnpm build` (type/compile gate) + scoped ESLint; the final task is a manual screenshot check. Commit after each task.

---

## File Structure

- **Modify** `src/app/globals.css` — add 3 `@keyframes` + 5 `.animate-first…fifth` classes + a `prefers-reduced-motion` guard.
- **Create** `src/app/_components/background-gradient-animation.tsx` — the adapted, brand-recolored component.
- **Modify** `src/app/_components/theme.ts` — add `relative isolate overflow-hidden` to `theme.shell.sidebar`.
- **Modify** `src/app/_components/console-frame.tsx` — render the backdrop + scrim as the first child of the `<aside>`.

---

## Task 1: Register keyframes + animation classes in globals.css

**Files:**
- Modify: `src/app/globals.css` (insert after the `@theme inline { … }` block, which ends at line 169)

- [ ] **Step 1: Add the CSS**

Insert this block immediately AFTER line 169 (the closing `}` of `@theme inline`) and before the `* { … }` rule at line 171:

```css
/* Animated nav-rail gradient — keyframes + blob animation classes
   (consumed by BackgroundGradientAnimation). Frozen under reduced motion. */
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
.animate-first  { animation: moveVertical 30s ease infinite; }
.animate-second { animation: moveInCircle 20s reverse infinite; }
.animate-third  { animation: moveInCircle 40s linear infinite; }
.animate-fourth { animation: moveHorizontal 40s ease infinite; }
.animate-fifth  { animation: moveInCircle 20s ease infinite; }
@media (prefers-reduced-motion: reduce) {
  .animate-first, .animate-second, .animate-third, .animate-fourth, .animate-fifth {
    animation: none;
  }
}
```

- [ ] **Step 2: Verify the build compiles the CSS**

Run: `pnpm build`
Expected: build succeeds (Tailwind v4 processes `globals.css` with no errors). The classes aren't used yet; this just confirms the CSS is valid.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(ui): add nav-rail gradient keyframes + animation classes"
```

---

## Task 2: Create the adapted BackgroundGradientAnimation component

**Files:**
- Create: `src/app/_components/background-gradient-animation.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/_components/background-gradient-animation.tsx` with exactly:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "./theme";

/**
 * Animated gradient backdrop (ported from 21st.dev `BackgroundGradientAnimation`),
 * adapted for this app: brand-recolored defaults (charcoal/gold/red), color vars
 * scoped to its own root (not `document.body`), fills its parent instead of the
 * viewport, and `interactive` off by default. Keyframe classes (`animate-first…fifth`)
 * live in `globals.css` and freeze under prefers-reduced-motion.
 */
export const BackgroundGradientAnimation = ({
  gradientBackgroundStart = "rgb(16, 16, 19)",
  gradientBackgroundEnd = "rgb(22, 22, 26)",
  firstColor = "200, 162, 74",
  secondColor = "184, 138, 46",
  thirdColor = "120, 110, 80",
  fourthColor = "150, 70, 60",
  fifthColor = "60, 60, 70",
  pointerColor = "200, 162, 74",
  size = "120%",
  blendingValue = "soft-light",
  children,
  className,
  interactive = false,
  containerClassName,
}: {
  gradientBackgroundStart?: string;
  gradientBackgroundEnd?: string;
  firstColor?: string;
  secondColor?: string;
  thirdColor?: string;
  fourthColor?: string;
  fifthColor?: string;
  pointerColor?: string;
  size?: string;
  blendingValue?: string;
  children?: React.ReactNode;
  className?: string;
  interactive?: boolean;
  containerClassName?: string;
}) => {
  const interactiveRef = useRef<HTMLDivElement>(null);

  const [curX, setCurX] = useState(0);
  const [curY, setCurY] = useState(0);
  const [tgX, setTgX] = useState(0);
  const [tgY, setTgY] = useState(0);

  useEffect(() => {
    if (!interactive || !interactiveRef.current) return;
    setCurX(curX + (tgX - curX) / 20);
    setCurY(curY + (tgY - curY) / 20);
    interactiveRef.current.style.transform = `translate(${Math.round(curX)}px, ${Math.round(curY)}px)`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tgX, tgY]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (interactiveRef.current) {
      const rect = interactiveRef.current.getBoundingClientRect();
      setTgX(event.clientX - rect.left);
      setTgY(event.clientY - rect.top);
    }
  };

  const [isSafari, setIsSafari] = useState(false);
  useEffect(() => {
    setIsSafari(/^((?!chrome|android).)*safari/i.test(navigator.userAgent));
  }, []);

  const colorVars = {
    "--gradient-background-start": gradientBackgroundStart,
    "--gradient-background-end": gradientBackgroundEnd,
    "--first-color": firstColor,
    "--second-color": secondColor,
    "--third-color": thirdColor,
    "--fourth-color": fourthColor,
    "--fifth-color": fifthColor,
    "--pointer-color": pointerColor,
    "--size": size,
    "--blending-value": blendingValue,
  } as React.CSSProperties;

  return (
    <div
      style={colorVars}
      className={cx(
        "absolute inset-0 h-full w-full overflow-hidden bg-[linear-gradient(40deg,var(--gradient-background-start),var(--gradient-background-end))]",
        containerClassName,
      )}
    >
      <svg className="hidden">
        <defs>
          <filter id="blurMe">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
      <div className={cx("", className)}>{children}</div>
      <div
        className={cx(
          "gradients-container h-full w-full blur-lg",
          isSafari ? "blur-2xl" : "[filter:url(#blurMe)_blur(40px)]",
        )}
      >
        <div
          className={cx(
            `absolute [background:radial-gradient(circle_at_center,_var(--first-color)_0,_var(--first-color)_50%)_no-repeat]`,
            `[mix-blend-mode:var(--blending-value)] w-[var(--size)] h-[var(--size)] top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)]`,
            `[transform-origin:center_center]`,
            `animate-first`,
            `opacity-100`,
          )}
        ></div>
        <div
          className={cx(
            `absolute [background:radial-gradient(circle_at_center,_rgba(var(--second-color),_0.8)_0,_rgba(var(--second-color),_0)_50%)_no-repeat]`,
            `[mix-blend-mode:var(--blending-value)] w-[var(--size)] h-[var(--size)] top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)]`,
            `[transform-origin:calc(50%-400px)]`,
            `animate-second`,
            `opacity-100`,
          )}
        ></div>
        <div
          className={cx(
            `absolute [background:radial-gradient(circle_at_center,_rgba(var(--third-color),_0.8)_0,_rgba(var(--third-color),_0)_50%)_no-repeat]`,
            `[mix-blend-mode:var(--blending-value)] w-[var(--size)] h-[var(--size)] top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)]`,
            `[transform-origin:calc(50%+400px)]`,
            `animate-third`,
            `opacity-100`,
          )}
        ></div>
        <div
          className={cx(
            `absolute [background:radial-gradient(circle_at_center,_rgba(var(--fourth-color),_0.8)_0,_rgba(var(--fourth-color),_0)_50%)_no-repeat]`,
            `[mix-blend-mode:var(--blending-value)] w-[var(--size)] h-[var(--size)] top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)]`,
            `[transform-origin:calc(50%-200px)]`,
            `animate-fourth`,
            `opacity-70`,
          )}
        ></div>
        <div
          className={cx(
            `absolute [background:radial-gradient(circle_at_center,_rgba(var(--fifth-color),_0.8)_0,_rgba(var(--fifth-color),_0)_50%)_no-repeat]`,
            `[mix-blend-mode:var(--blending-value)] w-[var(--size)] h-[var(--size)] top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)]`,
            `[transform-origin:calc(50%-800px)_calc(50%+800px)]`,
            `animate-fifth`,
            `opacity-100`,
          )}
        ></div>

        {interactive && (
          <div
            ref={interactiveRef}
            onMouseMove={handleMouseMove}
            className={cx(
              `absolute [background:radial-gradient(circle_at_center,_rgba(var(--pointer-color),_0.8)_0,_rgba(var(--pointer-color),_0)_50%)_no-repeat]`,
              `[mix-blend-mode:var(--blending-value)] w-full h-full -top-1/2 -left-1/2`,
              `opacity-70`,
            )}
          ></div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm build`
Expected: build succeeds. The component isn't mounted yet; this confirms it compiles (imports `cx`, types OK).

- [ ] **Step 3: Lint the new file**

Run: `pnpm exec eslint src/app/_components/background-gradient-animation.tsx`
Expected: no errors (the `react-hooks/exhaustive-deps` line is explicitly disabled for the faithful interactive-move effect).

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/background-gradient-animation.tsx
git commit -m "feat(ui): add brand-recolored BackgroundGradientAnimation component"
```

---

## Task 3: Mount the backdrop behind the nav rail

**Files:**
- Modify: `src/app/_components/theme.ts:14-15` (the `sidebar` string)
- Modify: `src/app/_components/console-frame.tsx` (import + first child of `<aside>`)

- [ ] **Step 1: Make the sidebar a clipping/stacking context**

In `src/app/_components/theme.ts`, the `shell.sidebar` value is currently:

```ts
    sidebar:
      "border-b border-[var(--border-panel)] bg-[var(--surface-sidebar)] px-4 py-3 lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r lg:px-4 lg:py-5",
```

Change it to (prepend `relative isolate overflow-hidden`):

```ts
    sidebar:
      "relative isolate overflow-hidden border-b border-[var(--border-panel)] bg-[var(--surface-sidebar)] px-4 py-3 lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r lg:px-4 lg:py-5",
```

- [ ] **Step 2: Import the component in console-frame**

In `src/app/_components/console-frame.tsx`, add this import alongside the other `_components` imports (e.g. right after the `SideNav` import on line 9):

```ts
import { BackgroundGradientAnimation } from "./background-gradient-animation";
```

- [ ] **Step 3: Render the backdrop as the first child of the `<aside>`**

In `src/app/_components/console-frame.tsx`, the `<aside className={theme.shell.sidebar} …>` opens around line 82 and its first child is the `<div className="flex gap-3 …">` at line 91. Insert this block immediately AFTER the `<aside …>` opening tag (with all its `onMouseEnter`/`onFocus`/etc. props) and BEFORE that first `<div className="flex gap-3 …">`:

```tsx
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <BackgroundGradientAnimation />
            {/* Readability scrim: fade the gradient toward the sidebar tone so nav
                labels and the gold active-indicator stay legible. */}
            <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_20%,transparent,var(--surface-sidebar)_88%)]" />
            <div className="absolute inset-0 bg-[var(--surface-sidebar)] opacity-40" />
          </div>
```

(The wrapper carries `aria-hidden` + `pointer-events-none` + `-z-10`; with the aside's new `isolate`, the backdrop paints behind the in-flow nav content without changing any child's z-index. The scrim divs come after the gradient so they sit above the blobs but still behind the nav.)

- [ ] **Step 4: Verify the build**

Run: `pnpm build`
Expected: build succeeds, no type errors.

- [ ] **Step 5: Lint the changed files**

Run: `pnpm exec eslint src/app/_components/theme.ts src/app/_components/console-frame.tsx`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/theme.ts src/app/_components/console-frame.tsx
git commit -m "feat(ui): mount animated gradient backdrop behind the nav rail"
```

---

## Task 4: Manual verification

**Files:** none.

- [ ] **Step 1: Run the app**

Run: `pnpm dev` and open the app in a browser.

- [ ] **Step 2: Confirm the visual result**

Check, and screenshot:
1. **Expanded rail** — a subtle charcoal/gold/red gradient drifts behind the nav; labels and the gold active-tab indicator remain clearly legible.
2. **Collapsed rail** (resize to the `lg` icon-rail width) — the gradient still fills the rail; icons stay legible.
3. **Reduced motion** — with the OS "reduce motion" setting on (or DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`), the gradient is static (no drift), and the rail still shows the brand-colored gradient over `--surface-sidebar`.
4. **No neon** — confirm the palette reads charcoal + gold + muted red (no purple/blue), per DESIGN.md.

- [ ] **Step 3: If intensity needs tuning**

If too strong/weak, adjust the scrim opacity (`opacity-40` on the second scrim div in `console-frame.tsx`) and/or the blob opacities / `blendingValue` defaults in `background-gradient-animation.tsx`, rebuild, recheck, and amend the relevant commit. (Visual taste pass — no code-structure changes.)
