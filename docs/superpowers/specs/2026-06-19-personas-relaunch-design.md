# Personas — relaunch design

**Date:** 2026-06-19
**Status:** Approved for planning

## Problem

The persona page (`/persona-intelligence`) is fully built and backed by a real
read-model, but it is **orphaned** — it is not linked from the sidebar nav in
`src/app/_components/console-frame.tsx`. This is the same "live but unreachable"
merge-drop that previously hit the Gallery link.

Re-linking the old page as-is would not be enough, because while it sat
orphaned the app grew a `/brain` page that advertises personas as part of its
knowledge graph ("brand facts, personas, proof, and what it has learned"), and a
`/brand` page that owns approved facts. Naively re-linking would leave **two**
surfaces claiming personas. The goal is to bring Personas back *and* make it
coherent with Brain/Brand.

## Purpose

A structured, per-persona operator lens: **who BSR sells to and how Arc should
talk to them.** The 12-persona roster, each drilling into its rulebook, live
segment snapshot, and (later) performance.

This is distinct from Brain — they cross-link rather than overlap:

- **Brain** = the raw memory substrate — a graph of *everything* Arc has learned
  (brand facts, proof, personas-as-nodes) plus the approval queue for newly
  learned facts. Answers "what does Arc know and how is it connected."
- **Personas** = a structured, opinionated lens on *one* category — the
  12-persona roster, each with its rulebook (CTA / angle / guardrails), its live
  segment snapshot, and how it is performing. Answers "who are we selling to and
  how do we talk to them." The graph cannot give this cross-section ergonomically.

Personas stays **inspect-only**: no editing of rules, no outbound, consistent
with the current posture and the non-negotiable "no outbound without human
approval" principle.

## Information architecture

### Roster page (`/personas`)

Replaces the old tab-first layout with a roster-first one:

- **KPI strip** — tracked personas · high-confidence (ready to convert) · partner
  candidates · live snapshots attached. Reuses the existing `stats` from
  `getPersonaIntelligenceData()`.
- **Roster grid** of all 12 personas (from `PERSONA_CTA_RULES`). Each card shows
  segment, primary/secondary CTA, message angle, and a "Live memory / Rule only"
  pill driven by whether a `persona_snapshots` row exists for that persona. This
  merges today's separate "Persona rules" and "Live snapshots" tabs into one
  roster rather than two parallel lists.
- **Supporting panels** — knowledge signals and guardrails move from top-level
  tabs to supporting panels, because they are cross-persona reference material,
  not the main event.

### Drill-in (`/personas/[personaKey]`)

Keeps the existing three sub-views, relabeled to the unified vision:

- **Rulebook** — CTA rule, landing guidance, guardrail. (Exists today as "CTA rule".)
- **Live snapshot** — Supabase persona memory: relationship stage, value tier,
  dominant loss pattern, preferred channel, risk flags, next best action.
  (Exists today as "Live memory".)
- **How Arc uses it** — campaign briefs, approval cards, CRM enrichment,
  guardrails. (Exists today as "Arc use".)
- **Performance** — *deferred tab*, visibly "coming soon," wired in the
  fast-follow once the persona↔outcome join exists.

Cross-links from the drill-in:

- **Open in Brain** — jump to this persona's node in the knowledge graph.
- **Open related CRM** — exists today.

### Brain ↔ Personas cross-linking

- Brain: persona-category nodes gain an "Open in Personas" affordance.
- Personas drill-in: "Open in Brain" jumps to the matching graph node.

Additive and low-risk on both sides.

## Routing / naming

- Move the route `/persona-intelligence` → `/personas`. Shorter, matches the nav
  label, and aligns with the `Brand` / `Brain` sibling naming.
- The old `/persona-intelligence` path (and `/persona-intelligence/[personaKey]`)
  **301-redirects** to the new path so existing links/bookmarks do not break.
- Add a **Personas** entry to the **Intelligence** nav group in
  `src/app/_components/console-frame.tsx` (`intelligenceNavItems`), alongside
  Activity · Analytics · Brand · Brain.

## Data — all real, nothing faked

- Roster, snapshots, knowledge signals, guardrails: existing
  `getPersonaIntelligenceData()` read-model in
  `src/lib/persona-intelligence/read-model.ts`. **No new queries for v1.**
- Brain cross-link: existing knowledge-graph node ids.
- Performance (deferred): a new persona↔outcome join in the performance
  read-model. The Performance tab stays hidden / "coming soon" until that lands —
  no placeholder numbers.

## Deferred (explicitly out of v1)

- Live per-persona performance numbers and the persona↔outcome join.
- Any editing of persona rules — the page stays read/inspect-only.

## Testing

- Existing domain tests for personas (`src/domain/__tests__/personas.test.ts`)
  stay green.
- Add read-model coverage only when the performance join is built.
- UI is server-component + existing `page-header` primitives, so verification is
  a preview smoke test: roster renders, drill-in tabs work, redirect from the old
  path resolves.

## Out-of-scope notes for the implementer

- Nav lives in `console-frame.tsx` (hardcoded array), **not** in
  `src/app/_data/growth-engine.ts`. Add the entry there and watch for
  merge collisions on that file.
- A `nav-icons` entry may be needed for the Personas icon.
- Follow the existing scaffold-vs-wired conventions; this page stays a
  read-model-backed inspect surface (like the current persona page), not a
  mutation surface.
