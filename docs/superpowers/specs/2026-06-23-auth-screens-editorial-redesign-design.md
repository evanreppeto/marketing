# Auth Screens — Editorial Redesign (Design)

**Date:** 2026-06-23
**Status:** Approved (direction + scope confirmed; mockup approved)

## Problem

The sign-in / sign-up / onboarding screens read as "generic AI." Concrete tells:

- The split's right panel is a **gradient-blur blob** (`EtheralShadow`) behind a glass
  "Workspace boundary" trust card and **three equal Owner/Invite/Arc cards** — the
  archetypal AI-slop signature, and a violation of `DESIGN.md` ("no equal 3-column rows").
- **Uppercase eyebrow kickers** ("OPERATOR ACCESS", "WORKSPACE SETUP") — the label tic
  removed elsewhere in the app.
- **No editorial type moment.** Headings request `font-serif`, but `--ff-serif` is pointed
  at Geist in `layout.tsx`, so the intended serif signature never renders — everything is
  default sans.
- A **loud gradient-yellow button** with a shimmer underline does the shouting instead of
  restraint + one confident moment.
- Several **inconsistent auth shells** exist (`AuthPageFrame` in `sign-in.tsx`,
  `OperatorAuthSurface` in `operator-login-page.tsx`, bespoke shells in `welcome/page.tsx`,
  `start/page.tsx`, `onboarding/page.tsx`).

Approved direction (mockup): an **editorial split** — a confident Fraunces serif statement
on the left, a calm form on the right, gold used ≤2× per screen, hairlines not cards.
Scope: **all** auth screens (sign-in, sign-up, welcome/invite, /start, forgot-password,
onboarding).

## Architecture

### 1. One shared shell — `AuthShell`

New `src/components/ui/auth-shell.tsx`. Replaces every bespoke auth shell.

```
<AuthShell headline={…} supporting={…} meta={…}>{form}</AuthShell>
```

- **Left editorial panel** (hidden < md, collapses to a slim wordmark band on mobile):
  Arc wordmark (top), a serif **headline** (ReactNode — allows a single italic gold accent
  word), a muted **supporting** line, and an optional quiet hairline-separated **meta** row
  (e.g. "Approval-gated · Persona-aware · Source-backed"). No cards, no gradient blob.
- **Right form panel**: `children`. Vertically centered, generous whitespace.
- Brand tokens only (`--canvas`, `--accent`, hairline borders via existing CSS vars). Flat —
  no gradients/blur/shadows beyond functional focus rings.
- Props: `headline: ReactNode`, `supporting?: ReactNode`, `meta?: string[]`,
  `formMaxWidth?` (sign-up/onboarding are wider than sign-in).

### 2. Editorial type face — Fraunces, scoped

- Load `Fraunces` via `next/font/google` in `layout.tsx` (opsz, weights 400/500), exposed as
  a **new** variable `--ff-editorial`. **Do not** change the global `--ff-serif` (it stays
  Geist — the app-wide "one family" decision is intentional and out of scope).
- Add a `.font-editorial` utility in `globals.css`:
  `font-family: var(--ff-editorial), "Fraunces", Georgia, serif;` Used only on auth headlines.

### 3. Calmer primary button

`PrimarySubmitButton` (in `sign-in.tsx`): solid `--accent` fill with `--on-accent` ink,
flat, subtle hover lift — drop the `linear-gradient` fill and the `BottomGradient` shimmer
(an AI-slop tell). Keep the pending state.

### 4. Per-screen adoption (left copy = each screen's voice; right = its existing form)

| Screen | Left headline (serif) | Right form |
|---|---|---|
| Sign in (`SignInPage`) | "Marketing that moves only when you say *yes*." | email/password + Google |
| Sign up (`SignUpPage`) | "Give every team a clean place for Arc to work." | existing sign-up form |
| Welcome (`welcome/page.tsx`) | "You've joined *{workspace}*." | name + password |
| `/start` | "Let Arc learn your *brand*." | website capture (existing two-phase form) |
| Forgot password | "Let's get you back *in*." | support/reset instructions |
| Onboarding | "Create the place where Arc *learns*." | join-with-code + create-workspace |

All copy is **product-level (Arc)**, not BSR-specific — multi-tenant safe.

### 5. Removals

- `EtheralShadow` usage in auth (component file may remain for other uses; auth stops
  importing it). The "Workspace boundary" + Owner/Invite/Arc card block is deleted.
- Uppercase `authLabel` kickers.
- The duplicate `OperatorAuthSurface` / bespoke shells collapse into `AuthShell`.

## Testing & verification

- Pure visual components; no new unit tests required. Keep existing page/route guard tests
  green (`sign-in` route, `/start` page guards, welcome actions).
- `npx tsc --noEmit`, scoped eslint, `pnpm build`.
- **Browser preview**: auth screens are previewable via `?preview=1`
  (`isAuthScreenPreviewEnabled`) without Supabase — verify `/login?preview=1`,
  `/sign-up?preview=1`, and `/start` visually (layout, Fraunces rendering, gold ≤2×,
  responsive collapse) before claiming done.

## Safety & scope

- Presentation-only. No auth logic, routing, or persistence changes. No outbound behavior.
- Fraunces is additive and scoped; the global type system is untouched.
