# Settings Tab — Design Spec

**Date:** 2026-06-01
**Status:** Approved (design), pending implementation

## Problem

The "Settings" nav item points to `/score-rules`, which is not a settings page — it is
a scoring/guardrails *explainer* (Arc autonomy, approval requirements, guardrail scope,
a lead-score example, signal weights, and routing rules). An operator clicking "Settings"
expects controls for the system, not a read-only scoring writeup.

## Goal

Make Settings an actual settings surface: the operator's control panel for the Arc agent,
integrations, workspace/access, scoring/routing configuration, and data/system housekeeping.
Stay within the app's scaffold-mode posture (preview-only; no real writes).

## Decisions

- **Route:** rename `/score-rules` → `/settings`. Update the 3 inbound references:
  - `src/app/_data/growth-engine.ts` (`navItems`)
  - `src/app/_components/console-frame.tsx` (nav + `matches`)
  - `src/app/page.tsx` (Today page `HomeLink`)
- **Structure (Option A):** sectioned settings with a sticky left section rail. The content
  panel renders the active section, switched via a `?section=` query param. This matches the
  existing scaffold-mode pattern (async server component reading `searchParams`). Default
  section = `arc`. Unknown/missing section falls back to the default.
- **Scaffold-mode preserved:** level selectors / toggles set a query param and surface an
  `ActionFeedback`-style preview banner. No persistence, no mutations.
- **Reuse primitives** from `src/app/_components/page-header.tsx` (`PageHeader`, `Panel`,
  `StatusPill`, `OperatorBar`, `ActionFeedback`, `EmptyState`). Follow `DESIGN.md`.

## Sections

1. **Arc agent** — autonomy level selector (L1/L2/L3, scaffold), capability matrix
   (internal enrichment ✓ / draft generation ✓ / outbound execution ✗), approval
   requirements, guardrail scope. Reuses today's legitimate control content, reframed as
   controls instead of an explainer.
2. **Integrations & connections** — Supabase/persistence status (live vs. "not configured"),
   the lead-ingestion API endpoint, and connected workspace tools (Codex, Claude, ChatGPT,
   Higgsfield, Linear, Drive) with connection status. Sourced from existing
   `workspaceTools` / `campaignToolchain` data.
3. **Workspace & access** — business profile (Big Shoulders), team members & roles, default
   owners/queues, notification preferences.
4. **Scoring & routing** — signal weights (`scoreRules`) and routing rules (`routingRules`).
   These are genuine configuration, so they live as one section here instead of being the
   entire "Settings" page.
5. **Data & system** — customer types / personas (12, from `customerTypes`), data-integrity
   scan cadence (`integrityScannerRules`), retention & export.

## Data

Add settings-specific scaffold data to `growth-engine.ts` (autonomy levels, team members,
notification prefs, retention options) where existing exports don't already cover it. Reuse
existing exports (`workspaceTools`, `scoreRules`, `routingRules`, `customerTypes`,
`integrityScannerRules`, `exampleScore`) rather than duplicating.

## Out of scope

- Real persistence / mutations (stays scaffold-mode until the backend approval pipeline lands).
- Sub-routes per section (Option C) — not warranted for a preview UI.
- New design-system primitives — reuse existing ones.

## Acceptance

- Sidebar/console/Today "Settings" all navigate to `/settings`.
- `/settings` renders the section rail + the default Arc-agent section.
- `?section=integrations|access|scoring|data` switches the rendered section.
- No scoring-explainer content is lost — it moves into the Scoring & routing section.
- `pnpm lint` and `pnpm build` pass.
