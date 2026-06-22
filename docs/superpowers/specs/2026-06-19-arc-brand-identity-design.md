# Brand Identity → Arc (SP1) — Design

**Date:** 2026-06-19
**Status:** Approved (design) — pending spec review
**Scope:** Close the wiring gap so Arc references the full brand identity shown on `/brand` — including a new **brand color palette + fonts**, plus the logo/tagline/description/website/service-areas that the profile already stores but `assembleArcContext` currently drops.

> Part of a 3-sub-project effort to make `/brand` the knowledge hub Arc references:
> **SP1 (this) — brand identity → Arc.** SP2 — Arc reads the uploaded brand documents. SP3 — read-only persona panel on `/brand`. SP2/SP3 are separate specs.

## Problem

`/brand` is backed by `getBusinessProfile(orgId)` → `BusinessProfile`, which holds the full identity (name, voice, rules, services, proof, `logoUrl`, `faviconUrl`, `shortMark`, `tagline`, `description`, `websiteUrl`, `serviceAreas`, and the console-theme `accent`). Arc's context is assembled by `assembleArcContext(profile, personas, brainFacts)` → `ArcBusinessContext`, returned by `GET /api/v1/arc/brand/context` and rendered into the runner prompt by `fromAppContext`.

Two gaps:
1. **No brand color palette / fonts exist at all.** The only color is `accent`, which themes the *operator console UI* — it is not BSR's creative brand palette.
2. **`assembleArcContext` drops the visual identity.** Even the fields that exist (`logoUrl`, `tagline`, `description`, `websiteUrl`, `serviceAreas`) never reach `ArcBusinessContext`, so Arc can't cite the logo, tagline, site, or service areas when packaging creative.

## What already works (do not rebuild)

`assembleArcContext` already passes through: businessName, industry, services, tone, voiceGuidance, preferredPhrases, bannedPhrases, proofPoints, personas, guardrails, and trusted brain facts. Voice, offerings, rules, and approved facts are wired. This SP only adds the **palette** and the **dropped visual-identity fields**.

## Behavior

After SP1, when Arc fetches its brand context it receives — and the prompt renders — the brand palette (named hex colors + fonts), logo URL, tagline, description, website, and service areas, alongside the existing fields. The operator edits the palette on `/brand`.

## Architecture

### a. Data model (`src/domain/brand-kit.ts` + migration)
Add `brandPalette` to `BusinessProfile`:
```ts
type BrandColor = { label: string; hex: string };   // hex may be "" (unset)
type BrandPalette = {
  primary: BrandColor;
  secondary: BrandColor;
  accent: BrandColor;
  dark: BrandColor;    // ink / text
  light: BrandColor;   // background / surface
  headingFont: string; // may be ""
  bodyFont: string;    // may be ""
};
// BusinessProfile gains: brandPalette: BrandPalette
```
- `NEUTRAL_DEFAULTS.brandPalette` = all five colors `{label:"",hex:""}` + empty fonts.
- New migration adds a `brand_palette jsonb not null default '{}'::jsonb` column on `business_profiles` (same jsonb pattern as `guardrails`/`proof_points`).
- `parseBusinessProfile` maps the `brand_palette` jsonb → `BrandPalette`, tolerating missing keys (fall back to empty color/font). A pure helper `parseBrandPalette(raw: unknown): BrandPalette` keeps this testable.
- `validateBusinessProfile` adds: each non-empty `hex` must match `/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/`; invalid hex → a validation error. Empty values are allowed (partial palette is fine).
- The console-theme `accent`/`density`/`motion` fields are **unchanged** — separate concern; no UI-theme behavior changes.

### b. Persistence (`src/lib/brand-kit/persistence.ts`)
`upsertBusinessProfile` writes `brand_palette: profile.brandPalette` (jsonb); the select/`parseBusinessProfile` path reads it back. Round-trips through the existing typed admin client.

### c. Editor (`src/app/brand/_components/brand-profile-editor.tsx` + brand `actions.ts`)
Add a **"Brand palette"** section to the existing editor: five color rows (each = native `<input type="color">` + hex text field + label text field) and two font text inputs (Heading, Body). Saved through the existing `requireOperator()`-gated brand action that already persists the profile — extend its payload parsing to include the palette. The `/brand` snapshot gains a small swatch strip so the palette is visible at a glance. Follows `DESIGN.md` (Command Charcoal / Canvas White / Restoration Red; no emojis; reuse `page-header.tsx` primitives) and the existing form patterns.

### d. Arc wiring (`src/domain/brand-kit.ts` + `apps/arc-runner/src/business-context.ts`)
- `ArcBusinessContext` gains: `palette: BrandPalette`, `logoUrl: string | null`, `tagline: string | null`, `description: string | null`, `websiteUrl: string | null`, `serviceAreas: string[]`.
- `assembleArcContext` populates them from the profile.
- `GET /api/v1/arc/brand/context` already returns `assembleArcContext` output → no route change needed.
- Runner: `AppBusinessContext` (the re-declared wire shape) gains the same fields; `fromAppContext` renders them into the prompt text — a brand-identity line (logo, tagline, website, service areas) and a palette line (e.g. `Brand colors — Primary #1B2A4A (Navy), Accent #C8A24B (Gold), …; Fonts — Heading: Oswald, Body: Inter`). Only non-empty values are rendered. `BSR_CONTEXT` fallback is unaffected (it's the 5-field shape).

## Data flow

```
Operator edits palette on /brand → brand action → upsertBusinessProfile (brand_palette jsonb)
Arc turn → GET /api/v1/arc/brand/context → assembleArcContext(profile,…)
  → { ...existing, palette, logoUrl, tagline, description, websiteUrl, serviceAreas }
  → runner fromAppContext renders palette + identity into the system prompt
  → Arc cites real brand colors / fonts / logo / tagline when drafting & packaging creative
```

## Testing

- **Domain:** `parseBrandPalette` (full / partial / missing jsonb → safe defaults); `validateBusinessProfile` rejects bad hex, allows empty; `assembleArcContext` includes `palette` + the five identity fields. (`src/domain/__tests__/brand-kit.test.ts`.)
- **Persistence:** upsert→read round-trip preserves `brand_palette` (mock Supabase, mirror existing persistence tests).
- **Runner:** `fromAppContext` renders palette + identity when present, omits empty values, and the BSR fallback still works. (`apps/arc-runner/src/business-context.test.ts`.)
- Full `pnpm build` + `pnpm --filter @bsr/arc-runner test`.

## Safety & scope

- Read-for-Arc + operator-edited; no outbound behavior, no approval-gate change.
- No change to the console UI theme (`accent`/`density`/`motion` untouched).
- Additive migration with a default — existing rows get `{}` and parse to an empty palette (graceful).

## Out of scope (own sub-projects / future)

- **SP2:** Arc reading the raw uploaded brand documents (a brand-sources read tool).
- **SP3:** the persona panel on `/brand`.
- Applying the palette to the operator console theme.
- Auto-extracting the palette from uploaded brand-guideline files via the Gemini parser (future tie-in with SP2).
- Arbitrary swatch lists (we chose fixed named slots + two fonts).
