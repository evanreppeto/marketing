# Brand-design color heuristics + Arc design tool

**Date:** 2026-06-24
**Status:** Approved design — ready for implementation plan
**Builds on:** `docs/superpowers/specs/2026-06-23-brand-design-from-website-design.md` (the website design-pull feature, PR #248)

## Problem

Two follow-ups to the website design-pull feature:

1. **The color-bucketing heuristic is rough.** It maps every vivid color (saturation
   > 0.15) to primary/secondary/accent and the luminance extremes to dark/light.
   Known rough edges: near-identical colors fill multiple swatches; a vivid brand
   color (e.g. navy primary) can also land in the `dark` slot; 8-digit hex
   (`#rrggbbaa`) and `!important` css-var values are dropped; vivid ordering ignores
   how prominent a color actually is on the page.

2. **Arc can't pull design from a site.** The runner has `analyze_website` (returns
   title/description/favicon/text) and `propose_brand_profile` (writes a DRAFT
   profile the operator activates). Neither carries the logo/palette/fonts the new
   extractor produces, and `propose_brand_profile` stores logo/favicon URLs **raw
   (hotlinked)**. Arc should be able to detect a brand's visual design and propose
   it as a draft — never activating it.

## Goal

Improve the color heuristics, and give Arc a read-only `analyze_brand_design` tool
plus a `propose_brand_profile` that carries the full palette + fonts into a DRAFT
profile (operator activates). Fix the latent hotlink while we're there.

## Decisions

- **Arc proposes a draft; the operator activates.** Consistent with the existing
  `propose_brand_profile` contract and the non-negotiable approval principle. Arc
  never writes the live/active profile. `PUT /brand/profile` keeps its `409 locked`
  guard on an active profile.
- **All four heuristic tweaks**, with prominence as a *tiebreaker* (not a replacement
  for the brand-CSS-var signal).
- **Store, don't hotlink.** Logo/favicon URLs reaching the draft are downloaded +
  stored as Library assets via a shared helper — fixes existing behavior and serves
  the new flow.

## Non-goals (YAGNI)

- Arc applying design directly to the live profile (operator has the UI for that).
- A separate "both modes" Arc capability.
- Changing the operator-facing preview/apply UI from PR #248 (Part 1 improves what
  it shows by improving the extractor; no UI changes).
- Headless-browser / computed-style color extraction (still best-effort from HTML).

---

## Part 1 — Color heuristics (`src/domain/brand-design.ts`, pure)

All changes are in the pure extractor + its unit tests. No I/O.

### 1a. Dedupe near-identical swatches
Add an RGB-distance helper and, when assembling the final color list, drop a hex
within Euclidean RGB distance `< 32` of one already kept (the earlier/higher-priority
one wins). Prevents five swatches that are visually the same color.

```ts
function rgbDistance(a: string, b: string): number; // Euclidean over 0–255 channels
```

### 1b. Dark/light from neutrals, not vivid brand colors
In `brandDesignToPaletteUpdate`, after choosing vivid primary/secondary/accent:
- `dark` = the lowest-luminance color that is **not** already a vivid pick, preferring
  low-saturation neutrals; if none, fall back to the darkest overall.
- `light` = the highest-luminance non-vivid color, same fallback.

So a navy primary no longer doubles as `dark`.

### 1c. 8-digit hex + `!important`
- `normalizeHex` accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` — for the alpha forms,
  drop the alpha and keep the 6-digit RGB.
- The frequency regex matches 3/4/6/8-digit hex runs.
- The css-var value capture trims at the first whitespace (and any `!important`/`;`/`}`),
  so `--brand-primary:#C8A24B !important` is tagged `css-var` with hex `#c8a24b`.

### 1d. Prominence tiebreaker
Add an optional `count?: number` to `BrandDesignColor` (occurrence count for
frequency-sourced colors; omitted for theme-color/css-var). The final color sort key
becomes: vivid-bucket → source rank (css-var < theme-color < frequency) → `count`
desc. `count` is optional so existing test fixtures (`{ hex, source }`) stay valid.

### Testing (Part 1)
Add cases to `src/domain/__tests__/brand-design.test.ts`:
- near-duplicate collapse (two close hexes → one swatch),
- dark/light avoid a vivid pick when a neutral exists,
- `#rrggbbaa` normalized to 6-digit; `!important` css-var tagged `css-var`,
- prominence tiebreaker orders two frequency colors by count.

---

## Part 2 — Arc design tool (propose-a-draft)

### 2a. Shared logo-store helper — `src/lib/brand-kit/brand-image.ts` (new)
Extract the operator action's inline `storeBrandImage` into:

```ts
export async function storeBrandImageFromUrl(args: {
  orgId: string;
  url: string;
  role: "logo" | "favicon";
  sourceUrl: string;
  uploadedBy: string;
}): Promise<string | null>; // hosted asset URL, or null if fetch/store failed
```

It uses `fetchPublicImage` (SSRF guard) + `insertAssetWithUrl`, with the host-derived
filename logic currently inline in `actions.ts`. Refactor `applyBrandDesignAction`
to call it (behavior unchanged). Unit-test the helper with injected deps.

### 2b. New route — `POST /api/v1/arc/brand/design`
`src/app/api/v1/arc/brand/design/route.ts`, `runtime = "nodejs"`, bearer-gated via
`arcGuard` (mirrors `analyze-website`). Body `{ url }` → `analyzeBrandDesignFromUrl(url)`
→ `200 { logoUrl, faviconUrl, palette, headingFont, bodyFont, sourceUrl }` (the
candidate logo URL — not stored here; storage happens on propose). `400` on
rejected URL, `502` on fetch failure. No LLM.

### 2c. New runner tool — `analyze_brand_design`
In `apps/arc-runner/src/tools/brand.ts`, add a read-only tool:
`analyze_brand_design({ url })` → `client.apiPost("/api/v1/arc/brand/design", { url })`.
Description: detects the brand's logo, colors, and fonts; after calling it, pass the
palette + fonts into `propose_brand_profile`. Returns the raw JSON for Arc to reason
over. Added to the `brandTools` array (act + draft modes).

### 2d. Extend `propose_brand_profile` + `PUT /brand/profile`
- **Tool schema** (`brand.ts`): add optional `brandPalette` (object with
  `primary?/secondary?/accent?/dark?/light?` each a hex string) and `headingFont?` /
  `bodyFont?`.
- **PUT route** (`src/app/api/v1/arc/brand/profile/route.ts`): accept those fields,
  validate hexes, merge into `current.brandPalette` (fill provided slots, keep the
  rest). Set `runtime = "nodejs"`. When `logoUrl`/`faviconUrl` are external http(s)
  URLs, download + store via `storeBrandImageFromUrl` (uploadedBy `"arc"`), using the
  hosted URL (fall back to the raw string only if the store fails) — this also fixes
  the existing hotlink behavior. Still forces `status:"draft"` and keeps the `409`
  active-profile guard and `validateBusinessProfile`.

### Testing (Part 2)
- `src/lib/brand-kit/brand-image.test.ts` — helper stores via injected deps; returns
  null on fetch failure.
- `apps/arc-runner/src/tools/brand.test.ts` — `analyze_brand_design` posts to the
  route and returns the body; `propose_brand_profile` forwards `brandPalette`/fonts.
- `apps/arc-runner/src/tools/index.test.ts` — add `analyze_brand_design` to the
  `DRAFT` set and the `ask`/`scan` exclusion checks.
- Route-level: extend or add a test alongside the existing brand route tests for the
  new `design` route and the palette/logo-store path in `profile` (mock Supabase +
  `fetchPublicImage`; mind the per-file `next/cache` mock gotcha if `revalidatePath`
  is touched — the PUT route does not call it today).

---

## Data flow (Part 2)

```
operator: "Arc, pull our brand design from acme.com"
  → analyze_brand_design(url)            [read tool]
      → POST /api/v1/arc/brand/design → analyzeBrandDesignFromUrl  (SSRF-guarded)
      → { logoUrl(candidate), faviconUrl, palette, fonts, sourceUrl }
  → propose_brand_profile({ displayName, brandPalette, headingFont, bodyFont, logoUrl, ... })
      → PUT /api/v1/arc/brand/profile
          → storeBrandImageFromUrl(logo/favicon)   [re-guard + store, hosted URL]
          → merge palette+fonts, status:"draft", validate, upsert
      → draft review card → /settings
  → operator reviews + activates in Settings   (Arc never activates)
```

## Error handling
- Rejected/blocked URL → tool returns the route's error text; no draft written.
- Image store failure → `storeBrandImageFromUrl` returns null; the field keeps the
  raw URL fallback (PUT) so the proposal still lands; nothing crashes.
- Active profile present → `PUT` returns `409 locked`; Arc tells the operator to edit
  in Settings (existing behavior).
- Invalid hex in palette → `validateBusinessProfile` rejects with `400`.

## Files

New:
- `src/lib/brand-kit/brand-image.ts` (+ `brand-image.test.ts`)
- `src/app/api/v1/arc/brand/design/route.ts`

Modified:
- `src/domain/brand-design.ts` (+ tests) — Part 1
- `src/app/library/brand/actions.ts` — use the shared `storeBrandImageFromUrl`
- `src/app/api/v1/arc/brand/profile/route.ts` — palette/fonts + logo-store, nodejs runtime
- `apps/arc-runner/src/tools/brand.ts` (+ `brand.test.ts`) — new tool + extended propose
- `apps/arc-runner/src/tools/index.test.ts` — tool-surface update

No schema/migration change: `business_profiles.brand_palette` already holds the palette.
