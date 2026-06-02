# Campaign workspace — slim intel + Mark drawer redesign

**Date:** 2026-06-02
**Status:** Approved (brainstorm) → building
**Branch:** `feat/campaigns-tab`

## Goal

The campaign workspace (`/campaigns/[campaignId]`) currently splits into a
full-width content column and a fixed **360px right rail** that stacks two
things: a long "Growth intelligence / decision context" card and a cramped
"Ask Mark to revise" form. The intel card is too long and the rail eats
horizontal space, while the Mark prompt is too small to be useful.

Rework the workspace so that:

1. The **growth-intelligence content collapses** into a slim, glanceable
   "decision context" bar (with the full panel available behind a disclosure),
   and the permanent rail is removed so content goes full-width.
2. **Asking Mark / chatting with Mark** moves into a larger right-side
   **slide-over drawer**, openable campaign-wide and pre-targeted per asset.
3. A clearly-disabled **"Generate creative with Mark"** hook marks where the
   future Gemini/Veo/Nano Banana integration plugs in — not wired this round.

**Outbound stays locked.** Prompting Mark still creates a revision request via
the existing server action; nothing is sent, published, launched, or spent.

## Decisions (from brainstorm)

- **Remove the permanent right rail.** Root cause of both "too long" and "too
  much side space" is the fixed `xl:grid-cols-[1fr_360px]` rail. Content spans
  full width; Mark moves to a drawer.
- **Intel → collapsible.** A slim horizontal "Decision context" bar sits under
  the existing `MetricStrip`. The full `IntelligencePanel` (unchanged) renders
  inside a "Details" disclosure, collapsed by default. Nothing is deleted.
- **Mark → slide-over drawer**, ~480–560px, full height, much larger composer
  than today's rail form. Reusable: opened campaign-wide *and* per-asset.
- **Per-asset revise** keeps working: each asset card's existing "Ask Mark to
  revise" button opens the drawer pre-targeted to that asset (instead of
  focusing a small rail form).
- **Mark prompt = revision request** (deterministic Mark; no live LLM rewrite).
  Drawer shows existing revision/event activity as a running thread — it reads
  conversational, but replies are not synthesized this round.
- **Gemini/Veo/Nano Banana = separate future sub-project.** Disabled
  "Generate creative with Mark ▸" affordance only; its own brainstorm covers
  model routing, persona-DB grounding, and how generated assets enter approval.

## Out of scope (deferred to follow-up spec)

- Live two-way Mark conversation with synthesized AI replies. The read-model
  does not expose a per-asset Mark reply thread; this round surfaces existing
  revision-request activity only.
- Any Gemini / Veo / Nano Banana model wiring, API keys, or generation flow.
- Changes to server actions, auth gating, approval/decision logic, or the
  locked-outbound posture.

## Components

### `campaign-workspace.tsx` (modify)

- Drop the `xl:grid-cols-[1fr_360px]` two-column grid. Content column becomes
  full-width.
- Keep `CampaignHeader`, `MetricStrip`, and the pending-approval banner as-is.
- Add a **`DecisionContextBar`** (new) directly under `MetricStrip`.
- Add **drawer state**: `markOpen: boolean` and `targetAssetId` (already
  present). Replace `MarkRail` usage with `<MarkDrawer>` rendered once.
- `CampaignHeader` (or a sticky action near the tabs) gets a **"Chat with
  Mark"** button that opens the drawer with no specific asset targeted.
- `pickAsset(assetId)` now sets `targetAssetId` **and opens the drawer**
  (instead of switching to the creative tab). The asset card "Ask Mark to
  revise" path flows through this.

### `decision-context-bar.tsx` (new)

- Slim horizontal strip of pills: **persona · confidence · journey stage ·
  🔒 guardrail status**, plus small lead/tool counts. Built from the same
  `MarkRailContext` data already passed in (`persona`, `leadsCount`, `tools`,
  `whyBuilt`).
- A **"Details"** disclosure (button toggling local `useState`) expands the
  **existing `IntelligencePanel`** inline below the bar, using the same model
  object the rail used to build. Collapsed by default.
- Reuses `StatusPill` / primitives from `page-header.tsx`. No new design tokens.

### `mark-drawer.tsx` (new — replaces `mark-rail.tsx`)

- Right-side slide-over (`fixed inset-y-0 right-0`), ~480–560px, full height,
  with a translucent scrim and `Esc` / scrim-click / close-button dismissal.
  Controlled via `open` + `onClose` props from the workspace.
- Header: "Chat with Mark" + subtitle "Creates a revision request. Nothing is
  sent." + close button.
- **Disabled "Generate creative with Mark ▸"** row at the top (the future
  Gemini/Veo/Nano hook): visually present, `disabled`, tooltip/caption
  "Coming soon — AI generation grounded on persona data."
- Body: the existing revise form, enlarged —
  - target-asset `<select>` (options = assets). Opening the drawer campaign-wide
    defaults the selection to the first asset (matching today's `assets[0]`
    default); opening from an asset card pre-selects that asset. A revision
    request is always asset-scoped — the current action requires an `assetId`,
    so there is no submittable "whole campaign" option this round. With no
    assets, the form is disabled (see Error & empty states).
  - a generous instruction `<textarea>` (more rows than today),
  - submit button via `useActionState(requestRevisionAction)` (unchanged),
  - inline success/error result banner (unchanged styling).
- **Activity thread:** below the composer, render the campaign's revision/event
  activity already in the read-model (`reasoning` / events / approvals as
  available) as a simple chronological list so the drawer reads conversational.
  Read-only this round.
- Accessibility: `role="dialog"`, `aria-modal`, focus moves into the drawer on
  open and returns to the trigger on close; body scroll locked while open.

### `creative-tab.tsx` (modify)

- The existing per-asset button (`creative-tab.tsx:84`) keeps its label "Ask
  Mark to revise" but now calls the workspace handler that **opens the drawer
  pre-targeted** to that asset (via the existing `onPickAsset` prop, whose
  implementation in the workspace now opens the drawer rather than switching
  tabs). The targeted card keeps its accent highlight.

### `mark-rail.tsx` (remove)

- Deleted once `MarkDrawer` + `DecisionContextBar` cover its responsibilities.
  Its `MarkRailContext` type moves to wherever the drawer/bar consume it (e.g.
  exported from `mark-drawer.tsx` or a small shared types module).

## Data flow

No backend changes. The same `LiveCampaignWorkspace` detail powers everything:

- `DecisionContextBar` + `IntelligencePanel` ← `campaign.persona`,
  `sources` (lead count), `reasoning.toolsUsed`, `reasoning.whyBuilt` (the
  exact inputs `MarkRail` used today).
- `MarkDrawer` form ← `assets` list + `campaign.id`; submits via
  `requestRevisionAction` (`src/app/campaigns/actions.ts`), unchanged.
- Activity thread ← existing read-model fields (events/approvals/reasoning);
  read-only.

## Error & empty states

- Drawer with no assets: form disabled with "No assets to revise yet"
  (preserves current `hasAssets` behavior).
- Supabase not configured: existing action returns its not-configured message;
  drawer shows it in the result banner (unchanged).
- Intel with no substance: `IntelligencePanel` already renders its empty state;
  the collapsed bar still shows persona/guardrail defaults.

## Testing

- Domain logic is untouched, so no new `src/domain` tests are required.
- Component behavior to verify manually (operator view): rail is gone and
  content is full-width; "Details" expands/collapses the full intel panel;
  "Chat with Mark" opens the drawer; an asset card's "Ask Mark to revise"
  opens the drawer pre-targeted to that asset; submitting an instruction still
  produces the revision-request result and leaves outbound locked; `Esc`/scrim
  close the drawer; the "Generate creative with Mark" row is visibly disabled.
- `pnpm lint` and `pnpm build` must pass.

## Follow-up spec (not this work)

"Mark live generation" — Gemini + Veo + Nano Banana creating ads/media in-app,
grounded on the persona database, with generated assets entering the existing
approval pipeline. Brainstormed separately; this redesign only leaves the
disabled hook where it attaches.
