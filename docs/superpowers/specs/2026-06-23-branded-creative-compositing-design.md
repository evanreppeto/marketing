# Branded Creative Compositing ("Phase 2")

**Date:** 2026-06-23
**Status:** Approved design — ready for implementation planning
**Owner:** Evan / Arc

---

## 1. Problem

Arc generates AI **background** images but never produces a finished, branded creative.
Operators repeatedly ask Arc to "put our logo / colors / text on it" and Arc cannot — so it
falls back to writing a text **"Overlay Composite Spec"** and tagging the bare background
"real logo attached separately."

Root cause (confirmed in code):

- Every image prompt is hardened by `NO_TEXT_DIRECTIVE` in
  [`src/lib/media/prompt.ts`](../../../src/lib/media/prompt.ts) — text, logos, and signage are
  **unconditionally stripped** from generations. This is correct and stays: AI models render
  garbled fake text and fake logos, which is brand-damaging and can look like fake "proof of a
  real job."
- The system was designed as **two phases** — (1) generate a clean background, (2) composite
  the *real* brand on top. Phase 1 exists. **Phase 2 was never built.**
- There is **no image-compositing library anywhere** in the repo (no sharp/canvas/satori/jimp).
- The `"composite"` value already exists in `ArcMediaSource`
  ([`src/domain/arc-chat.ts`](../../../src/domain/arc-chat.ts)) but has zero implementation.
- The brand kit already stores everything needed — see §4.

This spec builds Phase 2.

## 2. Goals

- Render a **finished, on-brand image**: real logo + headline + CTA + brand colors/fonts baked onto
  an AI background.
- **Brand-driven, never identical:** the look is painted from each workspace's brand kit, and the
  layout varies per creative — it must not look like one fixed template or generic "AI slop."
- **Arc does it automatically** via a real tool, so operators stop having to ask twice.
- **Preserve the approval gate and provenance** — nothing changes about human approval or
  outbound-locking; the composite just makes the approved asset actually look finished.

## 3. Non-goals (explicitly out of v1)

- In-browser overlay **editor** (drag logo, retype headline, swap layout, re-render). Strong
  follow-up; not v1.
- **Video** compositing. Still images only.
- **Visual** scraping of a website's exact palette/fonts/layout. We consume what's already in the
  brand kit; richer website-style learning is a later enhancement.
- Net-new approval flow. Reuse the existing campaign-asset approval path.

## 4. Brand data we consume (already exists)

From `BusinessProfile` / `BrandPalette` in
[`src/domain/brand-kit.ts`](../../../src/domain/brand-kit.ts), fetched via
`getBusinessProfile(orgId)` in [`src/lib/brand-kit/persistence.ts`](../../../src/lib/brand-kit/persistence.ts):

- `brandPalette`: `primary, secondary, accent, dark, light` (each `{label, hex}`) + `headingFont`,
  `bodyFont`
- `logoUrl`, `faviconUrl`, `shortMark` (fallback mark when no logo)
- `tagline`, `displayName`, `tone`, `serviceAreas`
- Website learning already exists ([`src/lib/brand-kit/website.ts`](../../../src/lib/brand-kit/website.ts)),
  so these fields can be populated from the company's site.

No schema change is required to brand data.

## 5. Architecture

Follows the app's layering: `domain/` (pure) → `lib/<feature>/` (I/O) → `app/<route>/` + runner tool.

### 5.1 Rendering engine — `ImageResponse` (`next/og`)

Render a JSX layout to PNG using Next.js's **built-in** `ImageResponse` (satori + resvg).
Rationale: **no heavy native dependency** (no sharp/canvas) — important for the Vercel + Windows
setup — and it's first-class in Next 16. Output PNG bytes are uploaded to the existing
`campaign-media` Supabase bucket via the current `storeGeneratedImage` helper
([`src/lib/media/storage.ts`](../../../src/lib/media/storage.ts)).

### 5.2 Template system

- **Pure selection logic** lives in a new domain module (e.g. `src/domain/creative-templates.ts`):
  given `{ templateHint?, campaignType, persona, aspectRatio }` it returns a template id and a
  resolved set of layout tokens. Deterministic and unit-tested. No I/O. Re-exported through
  `src/domain/index.ts`.
- **Template renderers** (TSX, server-only) live under `src/lib/media/compose/templates/`. Start
  with **3**: `bold`, `editorial`, `minimal`. Each accepts `(brandTokens, copy, backgroundUrl,
  format)` and returns the JSX tree for `ImageResponse`.
- Each template is **brand-tokenized** — colors from `brandPalette`, fonts from
  `headingFont`/`bodyFont`, logo from `logoUrl` (falls back to a `shortMark` chip in the brand's
  accent color when `logoUrl` is null). Same template → different brand → different look.
- **Arc selects** the template per creative (option A). A deterministic default selection exists so
  the route works even when Arc doesn't specify one.

### 5.3 Fonts (the fiddliest part)

satori needs the actual **font file**, not a CSS name. Bundle a curated set (~6–8 common families,
e.g. Inter, a geometric sans, a humanist serif, a slab) under `src/lib/media/compose/fonts/`.
Map the brand's `headingFont`/`bodyFont` to the nearest bundled family; fall back to a default
pairing when unknown. Document the map so it's extendable.

### 5.4 Compose route

`POST /api/v1/arc/media/compose` — new route at
`src/app/api/v1/arc/media/compose/route.ts`. Bearer-gated like the other `/api/v1/arc/*` routes
(`ARC_AGENT_API_TOKEN`). Behavior:

1. Guard `isMediaGenEnabled()` (same `ARC_MEDIA_ENABLED` + key gate as generation) and
   `isSupabaseAdminConfigured()`.
2. Resolve org/workspace; `getBusinessProfile(orgId)` → brand tokens.
3. Resolve the background: either a passed `background_url`/asset id (an existing AI background) or
   bytes generated immediately before.
4. Pick template (Arc's hint or deterministic default) + format → render with `ImageResponse`.
5. Upload PNG to `campaign-media`; return `{ url, path, template, format }`.

**Inputs:** `{ background_asset_id? | background_url?, headline, kicker?, cta_label?, format,
template? }`.

### 5.5 Runner tool — `compose_creative`

Add to [`apps/arc-runner/src/tools/media.ts`](../../../apps/arc-runner/src/tools/media.ts). Calls
the compose route. Tool description instructs Arc to **finish** creatives (logo + copy baked in),
not write overlay specs. Params mirror the route inputs.

> **Tool-surface test gotcha:** the runner pins the exact READ/WRITE/DRAFT tool sets in
> `apps/arc-runner/src/index.test.ts`. Adding `compose_creative` requires updating the matching
> const + the affected assertions, and running the **full** runner package suite (not just the new
> file).

### 5.6 Arc behavior + prompt

- Update [`apps/arc-runner/src/prompt.ts`](../../../apps/arc-runner/src/prompt.ts): keep "never bake
  text/logos into the *generated background*," and add that after generating a campaign background
  Arc should **call `compose_creative`** to produce the finished asset.
- **Default deliverable:** when Arc makes an image *for a campaign*, the **finished composite** is
  the asset shown on the card. The bare AI background is retained as the underlying source layer for
  provenance, not the headline asset.

### 5.7 Asset persistence + provenance

Reuse the draft-asset path ([`src/app/api/v1/arc/campaigns/draft-asset/route.ts`](../../../src/app/api/v1/arc/campaigns/draft-asset/route.ts)
→ [`src/lib/campaigns/create.ts`](../../../src/lib/campaigns/create.ts)):

- `media.source = "composite"`.
- `riskFlags` includes: *"Real logo overlaid on AI-generated background — background is not proof of
  a real job."*
- `audit_payload.media_assets` records both layers: the composite (`source:"composite"`) and the
  source background (`source:"ai_generated"`), plus `template`, `format`, brand-kit version/snapshot.
- `status: "pending_approval"`, `dispatch_locked: true` — **unchanged approval gate**.

## 6. Data flow

```
Arc (campaign image request)
  → generate_image            → clean AI background  (bucket)   [source layer]
  → compose_creative          → fetch brand kit
                              → pick template (+ format)
                              → ImageResponse render (logo+copy+colors+fonts)
                              → store PNG (bucket)
  → draft-asset               → campaign_asset { source:"composite", riskFlags, both layers }
  → operator approves         → outbound unlocks (existing flow)
```

## 7. Formats

Support `1:1, 4:5, 9:16, 16:9`; templates adapt per ratio. **Ship `1:1` + `4:5` first** (social
workhorses), then add `9:16` / `16:9`.

## 8. Error handling & fallbacks

- `isMediaGenEnabled()` false → `503 not_configured` (consistent with generation).
- Missing `logoUrl` → render `shortMark` chip in the brand accent (no broken image).
- Unknown brand font → default bundled pairing.
- Background fetch fails → return a clear error; Arc keeps the bare background asset rather than
  emitting a broken composite.
- Remote logo URL must pass the existing public-URL/SSRF guard before fetch (reuse
  `assertPublicHttpUrl` from [`src/lib/brand-kit/website.ts`](../../../src/lib/brand-kit/website.ts)).

## 9. Security / guardrails

- Route bearer-gated (`ARC_AGENT_API_TOKEN`) like the other `/api/v1/arc/*` routes.
- No outbound side effects; composite is approval-locked exactly like today.
- Org-scoping: brand kit + asset writes resolved through the same org/workspace path used by the
  draft-asset route (service-role client bypasses RLS, so the gate is in app code).

## 10. Testing

- **Domain:** unit tests for template selection + font mapping + token resolution (pure, in
  `src/domain/__tests__/`).
- **Renderer:** snapshot/structural tests that each template produces a valid `ImageResponse` for
  each format with logo-present and logo-absent brand kits.
- **Route:** test the gating (503 when disabled), provenance payload shape, and the both-layers
  `media_assets` record. Mock `next/cache` per-file (`revalidatePath` throws in the vitest node env).
- **Runner:** update and run the full `apps/arc-runner` suite (tool-surface consts are pinned).
- Run `tsc` / `pnpm build` (lint ≠ typecheck); scope eslint to changed files.

## 11. Files

**New**
- `src/domain/creative-templates.ts` (+ `__tests__`) — pure selection + token logic; export via
  `src/domain/index.ts`
- `src/lib/media/compose/renderer.ts` — ImageResponse wrapper
- `src/lib/media/compose/templates/{bold,editorial,minimal}.tsx`
- `src/lib/media/compose/fonts.ts` (+ bundled font files)
- `src/app/api/v1/arc/media/compose/route.ts`

**Modified**
- `apps/arc-runner/src/tools/media.ts` — add `compose_creative`
- `apps/arc-runner/src/index.test.ts` — pinned tool-surface consts
- `apps/arc-runner/src/prompt.ts` — finish-the-creative guidance
- `src/app/api/v1/arc/campaigns/draft-asset/route.ts` / `src/lib/campaigns/create.ts` — accept and
  persist `source:"composite"` + both-layer provenance (verify current shape; may already suffice)

## 12. Phasing

1. **v1:** renderer + 3 templates (`1:1`, `4:5`) + compose route + `compose_creative` tool + Arc
   prompt + composite provenance. Arc renders, operator approves.
2. **v1.1:** add `9:16` / `16:9`; more templates.
3. **Later:** in-browser overlay editor; video; visual website-style learning.

## 13. Open implementation risks

- **Font bundling vs. brand font fidelity** — we approximate brand fonts to a bundled set; exact
  brand typefaces aren't guaranteed in v1.
- **satori CSS subset** — satori supports a limited flexbox/CSS subset; templates must stay within
  it (no arbitrary CSS). Keep layouts flex-based and simple.
- **Background embedding** — confirm `ImageResponse` reliably fetches the Supabase public URL;
  fall back to fetching bytes → data URL if needed.
- **Logo aspect/transparency** — logos vary wildly; templates need a bounded logo box with
  `object-fit: contain` and a safe-area so odd logos don't break layout.
