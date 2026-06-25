# App Redesign — Foundation Pass (design)

Date: 2026-06-24
Status: approved (brainstorm) — ready for implementation plan

## Goal

The app feels cluttered, unprofessional, and "AI-slop"-ish despite a thoughtful
design system on paper. Redesign the app for a **simpler, more professional,
premium, less-cluttered** feel — going page by page, on top of a shared
foundation.

This spec covers **only the Foundation Pass**: the global change that makes the
whole app calmer and gives every later page a consistent base. Each individual
page redesign is a separate brainstorm → plan → build cycle that comes after.

## Diagnosis

The bones are good — `DESIGN.md` is detailed and tasteful (obsidian + gold,
Fraunces serif display, hairlines, one-accent discipline). The problem is the
**execution layers on too much decoration**, and that accumulation is what reads
as busy / generic-AI:

- A 360-particle animated `FlowFieldBackground` canvas behind every content page.
- Hero auras (`.hero-aura`), radial/linear glow washes on the content section
  and sidebar (`arc-rail-glow`, multi-stop radial gradients).
- Accent "bloom" glows on hover beyond the single focal card.
- 13 navigation destinations stacked across 4 labeled groups (incl. a 5-item
  "Intelligence" pile).

## Decisions (locked in brainstorm)

1. **Direction: Refined Dark.** Keep the obsidian + gold identity and the
   existing design tokens. Strip the decoration. Replace density-by-decoration
   with whitespace, hairlines, and one accent moment per screen. (Not a reskin
   to light; not a recolor to neutral graphite.)
2. **Sequence: Foundation first, then pages.** One global pass to remove
   decoration, tighten shared primitives, and calm the nav — then redesign pages
   one at a time on the clean base.
3. **Approach: restyle existing primitives in place.** No rebuild. Lower risk,
   keeps every wired feature working, immediate visual win everywhere. Subtract
   and tighten, not re-architect.
4. **Arc / Mark stay the rich exception.** `/arc` and `/mark` keep their richer,
   "alive" feel (a deliberate exception per existing design notes). Everything
   else goes calm.

## Scope — what the Foundation Pass changes

### 1. Decoration kill-list (global removals)

- Remove the `FlowFieldBackground` particle canvas from the content section in
  `src/app/_components/console-frame.tsx`. Replace with a flat calm canvas
  (solid `--canvas`, at most one extremely subtle, static top vignette if
  needed — no animation, no multi-stop radial wash).
- Remove `.hero-aura` usage (Today/home header in `src/app/page.tsx`, and any
  other page headers using it).
- Remove the sidebar `arc-rail-glow` and the radial gradient layers in the
  sidebar `aside` and the content `section` of `console-frame.tsx`.
- Remove accent "bloom" hover glows everywhere **except** the single
  `.focal-card` per screen, which keeps its one allowed warm-border treatment.
- Audit `src/app/globals.css` for decorative-only utilities (pulsing/breathing
  ambience, gradient-strip decorations, glow shadows that DESIGN.md §8 already
  bans) and delete the unused/decorative ones. Keep functional motion
  (`.module-rise`, `.rise-in` cascade, `CountUp`, reduced-motion guards).
- Do **not** touch `/arc` and `/mark` decorative surfaces.

### 2. Token & primitive tightening

- **Spacing:** codify a standard page-padding and section-gap rhythm with more
  breathing room, so pages stop setting ad-hoc margins. Express as tokens/utility
  classes (e.g. in `globals.css` / `theme.ts`) that page redesigns consume.
- **One-accent rule:** gold appears once per screen as the primary/focal cue.
  Elsewhere rely on text hierarchy + hairlines, not color. (Already DESIGN.md
  intent — make it enforced and audited.)
- **Panels (`.signal-panel`):** flatter — hairline border + minimal elevation,
  drop stacked inner highlights. Never nested (already a rule; verify).
- **Buttons / pills / `PageHeader`:** keep the public API unchanged. Lighten
  execution — softer shadows; hover = background/border step only; no
  levitation, no glow.

### 3. Navigation restructure (calmer IA)

New rail structure in `src/app/_components/console-frame.tsx` (the nav arrays are
hard-coded there — see memory note "nav lives in console-frame"):

- Top (ungrouped): **Home**, **Arc**
- **Work:** Campaigns, CRM, Opportunities
- **Studio:** Brand & Files, Gallery, Board
- **Intelligence:** Analytics, Brain, Personas
- Base: **Settings**

Route moves (nothing deleted — relocated):

- **Activity → a tab inside Analytics.** `/activity`'s content becomes an
  Analytics tab; keep `/activity` route working (redirect or tab deep-link) so
  existing links/`href`s don't break.
- **Usage → Settings.** Surface `/usage` (billing/usage) under Settings; keep
  the `/usage` route reachable.
- **Outbox → a tab/column in Board.** Fold `/outbox` into `/board`; keep
  `/outbox` reachable.

Update the mobile nav dock (`MobileNavDock`) groupings to match. Verify
`routeMatches` active-state logic still highlights correctly after the moves.

### 4. Calm principles → DESIGN.md

Add an enforced checklist that every redesigned page must follow, so page-by-page
work stays consistent:

- Lead with the operational task; exactly one focal moment per screen.
- Whitespace and hairlines over cards-in-cards; no nested panels.
- No equal 3-column dashboard rows; asymmetric grids.
- One accent use per screen; one serif (Fraunces) display moment (the title).
- Calm motion only: short fades; no levitation/glow on ordinary elements; at most
  one live `.status-breathe` dot per view.

## Page rollout order (post-foundation, each its own cycle)

Highest-traffic first: **Home → Campaigns → CRM → Opportunities → Analytics →
Brand/Library → Personas → Brain → Board → Settings → long tail.**

## Out of scope (this pass)

- Per-page layout redesigns (separate cycles).
- Any change to `/arc` and `/mark` visual treatment.
- Backend/data/route logic beyond the three nav route relocations.
- Light-mode or palette changes (Direction A keeps the current tokens).

## Constraints & guardrails

- Follow `DESIGN.md` and `CLAUDE.md` conventions; build from
  `globals.css` `:root` tokens and `theme.ts` — no new hex/one-off class maps.
- Approval-safe: no outbound behavior changes. Pure presentation + IA.
- Preserve wired features (vault, campaigns, CRM interactions) — no regressions.
- Keep everything reduced-motion safe.
- The nav arrays live in `console-frame.tsx`, not `growth-engine.ts` — edit the
  rendered source.

## Success criteria

- No animated particle field or glow washes on ordinary content pages; canvas is
  calm and flat.
- Rail shows 10 destinations in 3 tidy groups (+ Home/Arc/Settings); Activity,
  Usage, Outbox reachable via their new homes; active states correct.
- `pnpm lint` (scoped to changed files), `pnpm build`, and `pnpm test` pass.
- The app visibly reads calmer/more premium on at least Home + one list page,
  verified in the preview, with no broken links from the route moves.

## Verification

- Preview the app: Home, a Work page, Analytics (with Activity tab), Settings
  (with Usage), Board (with Outbox). Confirm no particle field, calm canvas,
  correct nav grouping + active states, and that relocated routes resolve.
- Run scoped `pnpm lint`, `pnpm build`, `pnpm test`.
