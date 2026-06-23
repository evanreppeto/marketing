# Pull brand design (logo, colors, fonts) from the company website

**Date:** 2026-06-23
**Status:** Approved design — ready for implementation plan

## Problem

The Brand page can already learn a company's *words* from its website — the
"Add single page" and "Import key website pages" imports fetch a site, strip it
to readable text, and run it through the Gemini brand pipeline (voice, services,
proof, CTAs). But it learns nothing about the company's *look*:

- The website fetchers (`src/lib/brand-knowledge/url-source.ts`,
  `src/lib/brand-kit/website.ts`) deliberately delete `<style>`, `<script>`,
  and `<svg>` before anything sees the HTML, so colors, fonts, and the logo are
  thrown away.
- `BusinessProfile` already has `logoUrl`, `faviconUrl`, and a full
  `brandPalette` (primary/secondary/accent/dark/light + heading/body fonts), and
  the masthead (`src/app/library/brand/_components/brand-identity.tsx`) already
  renders `profile.logoUrl` — falling back to a monogram ("BR") only when it's
  empty. Nothing ever populates those fields except a manual upload/paste in
  *Edit brand*.

Result: a customer who pastes their website reasonably expects their logo and
brand colors to appear, but the masthead shows a generic monogram and an empty
palette.

## Goal

Add a **"Pull brand design from your website"** capability to the Brand page
that fetches the site, extracts the **logo, colors, and fonts**, previews them
for the operator, and — on approval — writes them onto the Business Profile so
the masthead shows the company's real logo and palette.

## Decisions

- **Trigger: a dedicated control on the Brand page** (not folded into the text
  crawl, not onboarding-only). It needs the raw HTML/CSS the text crawl
  discards, so it is a separate fetch path anyway, and a dedicated control works
  for existing workspaces that want to re-pull, not just first run.
- **Apply model: preview, then apply.** Color/font detection from arbitrary
  sites is heuristic; a preview lets the operator accept good guesses and ignore
  bad ones, and it respects the app's non-negotiable "human approves decisions"
  principle. Apply **fills empty brand fields by default**, with an explicit
  "overwrite values I've already set" toggle.

## Non-goals (YAGNI)

- Full CSS cascade parsing or a headless browser for pixel-accurate dominant
  colors. High-signal sources + a human review gate get most of the value at a
  fraction of the complexity.
- Auto-applying design without operator review.
- Changing the existing text-import crawl or the Gemini brand pipeline.
- Letting Arc (the agent) trigger this autonomously. This is an operator action
  for now; an Arc tool can come later if wanted.

## Architecture

Follows the repo's `domain → lib → app` layering and the vault/campaigns wired
reference shape (`requireOperator()` + `isSupabaseAdminConfigured()` gates,
persist through a `src/lib/<feature>/` layer, `revalidatePath`).

### 1. Pure extraction — `src/domain/brand-design.ts`

No I/O. Re-exported through `src/domain/index.ts`.

```ts
export type BrandDesignColor = { hex: string; source: "theme-color" | "css-var" | "frequency" };
export type BrandDesignSignal = {
  logoCandidates: string[];   // absolute URLs, best first
  faviconUrl: string | null;  // absolute
  colors: BrandDesignColor[]; // deduped, brand-relevant, best first
  headingFont: string | null;
  bodyFont: string | null;
};

export function extractBrandDesign(html: string, baseUrl: string): BrandDesignSignal;
```

Extraction rules (all best-effort, all unit-tested):

- **Logo candidates**, in priority order, each resolved to an absolute URL via
  `new URL(href, baseUrl)`:
  1. `<link rel="apple-touch-icon">` (usually a clean square mark)
  2. `og:image` / `twitter:image` meta
  3. header `<img>` whose `alt`, `class`, or `src` contains "logo"
  4. `<link rel="...icon...">` / favicon (also stored separately as
     `faviconUrl`)
- **Colors**: collect from (a) `<meta name="theme-color">`, (b) CSS custom
  properties whose name matches `/-(primary|secondary|accent|brand|color)/i` in
  `<style>` blocks and `style=` attributes, (c) frequency count of `#hex` /
  `rgb()` literals in `<style>` / inline styles. Normalize to lowercase 6-digit
  hex. Drop near-duplicates (small distance). Keep brand-relevant ones first;
  near-black and near-white are still returned (they fill the `dark`/`light`
  palette slots) but ranked below vivid colors.
- **Fonts**: parse Google Fonts `<link href="...fonts.googleapis.com/...family=X">`
  family names, plus the first non-generic `font-family` declarations in
  `<style>`. First distinct family → `headingFont` (prefer one used in an
  `h1`/`h2`/heading rule when detectable), next distinct → `bodyFont`.

A mapping helper turns the raw signal into palette slots:

```ts
export function brandDesignToPaletteUpdate(signal: BrandDesignSignal): {
  primary?: string; secondary?: string; accent?: string;
  dark?: string; light?: string; headingFont?: string; bodyFont?: string;
};
```

### 2. Fetch + store — `src/lib/brand-kit/design-fetch.ts`

Node runtime (needs `node:dns`). Reuses the existing SSRF guard rather than
re-rolling one: `assertPublicHttpUrl` (from `website.ts`) plus the
DNS-resolution / private-IP / redirect-revalidation logic that
`website-fetch.ts` already implements. To avoid duplication, factor the guarded
fetch loop in `website-fetch.ts` into a small reusable
`fetchPublicHtml(url): Promise<{ html: string; finalUrl: string }>` helper and
call it from both `website-fetch.ts` and here. Unlike the text path, this keeps
the CSS — it does **not** strip `<style>`/`<svg>`.

```ts
export type BrandDesignProposal = {
  logoUrl: string | null;       // OUR hosted asset URL (see below), or null
  logoAssetId: string | null;
  faviconUrl: string | null;
  palette: { primary?: string; secondary?: string; accent?: string; dark?: string; light?: string };
  headingFont: string | null;
  bodyFont: string | null;
  sourceUrl: string;
};

export async function analyzeBrandDesignFromUrl(rawUrl: string, opts: { orgId: string; uploadedBy: string }):
  Promise<{ ok: true; proposal: BrandDesignProposal } | { ok: false; status: "rejected" | "failed"; message: string }>;
```

- Logo handling: download the best logo candidate's bytes (SSRF-guarded,
  size-capped, content-type must be an image), and store it as a Library asset
  via the existing `insertAssetWithUrl` (`source: "url"`,
  `provenance: { brandRole: "logo", sourceUrl }`) — the same path manual logo
  upload uses. The proposal returns OUR hosted URL, never a hotlink to the
  customer's site. If every candidate fails to download, `logoUrl` is null and
  the preview shows "no logo found".

### 3. Server actions — `src/app/library/brand/actions.ts`

Both `requireOperator()`-gated; return `{ ok: false }` / `NOT_CONFIGURED` when
Supabase is unconfigured, matching the existing brand actions.

- `analyzeBrandDesignFromWebsiteAction(prev, formData)` — reads `websiteUrl`,
  calls `analyzeBrandDesignFromUrl`, returns the proposal as action state.
  Persists nothing to the profile (the logo asset is stored so the preview can
  show a stable image).
- `applyBrandDesignAction(prev, formData)` — receives the chosen values
  (hidden fields carrying the proposal) plus an `overwrite` flag. Loads the
  current profile, applies logo/favicon/palette/fonts (fill-blanks-only unless
  `overwrite`), validates via `validateBusinessProfile`, `upsertBusinessProfile`,
  then `revalidatePath("/library/brand")` (and `/`, `/settings`, `/arc` like
  `saveBrandKitAction`). Re-validates that `logoUrl` is one of our hosted asset
  URLs (not an arbitrary client-supplied external URL).

### 4. UI — `src/app/library/brand/_components/brand-design-import.tsx`

Client component, `"use client"`, two `useActionState` hooks (analyze, apply).
Placed on the Brand page next to the existing teach/source-upload zone
(`src/app/library/brand/page.tsx`, near `<TeachArc />`). Uses `page-header.tsx`
primitives and obeys `DESIGN.md` (charcoal/canvas/red, no emojis, no neon).

- URL input + "Pull design" button → on success renders a **preview card**:
  - logo on the same white-bg rounded tile the masthead uses (or an empty-state
    if none found),
  - up to 5 color swatches with hex labels,
  - heading/body font names,
  - an "overwrite values I've already set" toggle (default off),
  - "Apply to brand" (primary) and a dismiss control.
- Errors (rejected URL, fetch failure, nothing found) surface inline via the
  same `StatusPill` + message pattern as `BrandSourceUpload`.

### 5. Logo guarantee

No masthead change is required: `BrandIdentity` already renders
`profile.logoUrl`. Applying the proposal sets `logoUrl`, so the company's real
logo replaces the monogram immediately after `revalidatePath`. Manual upload in
*Edit brand* continues to work unchanged.

## Data flow

```
operator pastes homepage URL
  → analyzeBrandDesignFromWebsiteAction (requireOperator)
      → analyzeBrandDesignFromUrl (SSRF-guarded fetch, keeps CSS)
          → extractBrandDesign(html, baseUrl)         [pure]
          → download + insertAssetWithUrl(best logo)  [Library asset]
      → BrandDesignProposal (hosted logo URL + swatches + fonts)
  → preview card (operator reviews, toggles overwrite)
  → applyBrandDesignAction (requireOperator)
      → upsertBusinessProfile (fill-blanks or overwrite)
      → revalidatePath("/library/brand")
  → masthead renders real logo + palette
```

## Error handling

- Unsafe/private/loopback URL → `rejected`, inline message (reuses existing
  guard's messages).
- Fetch timeout / non-2xx / too many redirects → `failed`, inline message.
- No logo found → proposal returns `logoUrl: null`; preview shows an empty
  state; colors/fonts can still apply.
- No colors/fonts found → those slots stay empty; apply is still allowed if a
  logo was found.
- Supabase unconfigured → `NOT_CONFIGURED` (consistent with other brand
  actions); no asset stored, no write.

## Testing

- `src/domain/__tests__/brand-design.test.ts` (pure, primary coverage):
  - logo priority ordering (apple-touch-icon > og:image > header img > favicon)
  - relative-URL resolution against base
  - color extraction from theme-color, CSS vars, and frequency; dedupe;
    dark/light bucketing
  - font parsing from Google Fonts link and `font-family` declarations
  - no-logo / no-color fallbacks
  - `brandDesignToPaletteUpdate` slot mapping
- `src/lib/brand-kit/design-fetch.test.ts`: injected `fetch` for the page and
  the logo image; asserts SSRF rejection, image download + store, proposal
  shape, and the no-logo path. (Mock `next/cache` per-file per the known
  vitest `revalidatePath` gotcha if the action is exercised here.)
- The SSRF guard itself is already covered by `website-fetch.test.ts` /
  `website.test.ts`; the extracted `fetchPublicHtml` helper keeps that coverage.

## Files

New:
- `src/domain/brand-design.ts` (+ export in `src/domain/index.ts`)
- `src/domain/__tests__/brand-design.test.ts`
- `src/lib/brand-kit/design-fetch.ts`
- `src/lib/brand-kit/design-fetch.test.ts`
- `src/app/library/brand/_components/brand-design-import.tsx`

Changed:
- `src/lib/brand-kit/website-fetch.ts` — extract reusable `fetchPublicHtml`
- `src/app/library/brand/actions.ts` — add the two actions
- `src/app/library/brand/page.tsx` — render `BrandDesignImport`

No schema/migration changes: `business_profiles` already has `logo_url`,
`favicon_url`, and `brand_palette`.
