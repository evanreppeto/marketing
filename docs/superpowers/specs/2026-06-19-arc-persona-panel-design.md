# Persona Panel on /brand (SP3) — Design

**Date:** 2026-06-19
**Status:** Approved (design) — pending spec review
**Scope:** Add a **read-only persona panel** to `/brand` that surfaces the personas BSR markets to + a glanceable view of their intelligence (segment, stage, score, next action). Editing stays on `/persona-intelligence`.

> Final piece of the "make `/brand` the hub" effort. **SP1** (brand identity → Arc, PR #148) and **SP2** (Arc reads brand documents, PR #150) shipped; **SP3 (this)** is the human-facing persona surface. Arc already *reads* personas via the `read_persona_intelligence` tool, so this SP is UI-only.

## Problem

`/brand` is becoming the place to see what the agent knows about the brand — company, voice, rules, facts, source documents — but personas live only on the separate `/persona-intelligence` page. We want `/brand` to also *show* the personas (with their intelligence) so it's a complete overview, while keeping persona editing/management where it already is.

## What exists (reuse, no rebuild)

- `getPersonaIntelligenceData(client?)` (`src/lib/persona-intelligence/read-model.ts`) → `{ status:"live"; stats: PersonaStat[]; personas: PersonaTrackerRow[]; contentSignals; guardrailSignals } | { status:"unavailable"; message }`. Resolves org internally; degrades gracefully.
- `PersonaTrackerRow`: `{ key, persona, segment, stage, intent, nextAction, contentNeed, score, offer, tone: "amber"|"green"|"red"|"blue", snapshot? }`.
- `PERSONA_CTA_RULES: PersonaCtaRule[]` (the canonical 12 official personas) + `personaSlug(persona)` (`src/lib/persona-intelligence/cta-rules.ts`). The `/persona-intelligence` page already overlays live rows onto these via `liveBySlug.get(personaSlug(rule.persona))`.
- UI primitives: `Panel`, `StatusPill`, `buttonClasses` (`src/app/_components/page-header.tsx`); `cx` (`src/app/_components/theme.ts`). The `/brand` page is a server component already calling other read-models in a `Promise.all`.

## Behavior

`/brand` renders a **Personas** panel showing every canonical persona; each persona that has a live snapshot shows its segment, relationship stage, a tone-colored score, and recommended next action. Personas without a live read still appear (marked "no live read yet"), so the panel always reflects the full audience. A header link goes to `/persona-intelligence` for the full view + editing. When persona memory is unavailable, the panel shows a short note + the same link.

## Architecture

### Component — `src/app/brand/_components/brand-personas.tsx` (new, server component)
- Props: `{ data: PersonaIntelligenceData }` (the panel is pure-presentational; the page fetches the data and passes it in, so the component is trivially testable and the page keeps a single `Promise.all`).
- Builds the row list by mapping `PERSONA_CTA_RULES` → overlay `liveBySlug = new Map(livePersonas.map(p => [p.key, p]))` keyed by `personaSlug(rule.persona)` (mirrors the persona-intelligence page exactly).
- Renders a `Panel`: header ("Personas" + a "Manage in Persona Intelligence →" `Link` to `/persona-intelligence`), then one row per persona — persona label, segment (when live), stage, a `StatusPill` with the score using the row's `tone`, and the `nextAction`. Personas with no live overlay render the name + a muted "no live read yet".
- `status:"unavailable"` → a small inline note (mirroring the page's unavailable banner) + the link; no rows.
- Follows `DESIGN.md` (Command Charcoal / Canvas White / Restoration Red; no emojis; reuse primitives) and the existing `/brand` panel styling (`SECTION_TONE`, `Panel`).

### Page wiring — `src/app/brand/page.tsx`
- Add `getPersonaIntelligenceData()` to the existing `Promise.all` (alongside `loadBrandProfile()`, `listNodes({})`, `getMediaLibraryData()`, `getAgentName()`).
- Render `<BrandPersonas data={personaData} />` as a brand-hub panel between the facts/sources section and the `BrandProfileEditor`.

### Pure helper (testable)
- A small pure function `buildPersonaPanelRows(data: PersonaIntelligenceData): PersonaPanelRow[]` (in the component file or a colocated `_data` helper) that does the `PERSONA_CTA_RULES` × `liveBySlug` overlay → `{ key, label, segment, stage, score, tone, nextAction, hasLive }[]`. This is the only logic worth unit-testing; the rest is JSX.

## Data flow

```
/brand (server) → Promise.all([..., getPersonaIntelligenceData()])
  → <BrandPersonas data={personaData} />
  → buildPersonaPanelRows: PERSONA_CTA_RULES overlaid with live tracker rows (by personaSlug)
  → read-only rows + "Manage in Persona Intelligence →" link
```

## Testing

- **`buildPersonaPanelRows`** (pure): all 12 personas present; live overlay applied by slug (segment/stage/score/tone/nextAction); personas without a live row get `hasLive:false`; `status:"unavailable"` → empty rows. (`src/app/brand/_components/brand-personas.test.ts` or a `_data` test.)
- **Build/typecheck** covers the presentational JSX.

## Safety & scope

- **Read-only.** No writes, no new persistence, no route, no runner/Arc change, no schema/migration. Pure UI reading an existing read-model. Editing stays on `/persona-intelligence`.
- Degrades gracefully (the read-model already returns `unavailable` without throwing).

## Out of scope

- Editing/creating personas on `/brand`.
- Relocating or removing the `/persona-intelligence` page.
- Any change to persona data, the read-model, or Arc's persona tool (already wired).
