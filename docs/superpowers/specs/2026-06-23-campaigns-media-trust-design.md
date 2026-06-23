# Campaigns: Media Trust & Email Section Fix — Design

**Date:** 2026-06-23
**Status:** Approved (scope + Approach A)
**Area:** `src/app/campaigns/`, `src/lib/campaigns/read-model.ts`

## Problem

A live, Arc-generated campaign showed a **fake/placeholder image in its email section**. The
campaigns page renders creative that is not backed by any real asset.

### Root cause

`buildMediaAssets` in [`read-model.ts`](../../../src/lib/campaigns/read-model.ts) scrapes media URLs
out of **free text** — the asset's draft/edited/approved body and its `reasoning_payload` /
`audit_payload` (`collectMediaFromAsset`, read-model.ts:2514). `isMediaLikeUrl` (read-model.ts:2850)
treats *any* `https://` string as a renderable image if it contains a word like
`image`/`photo`/`ad`/`postcard`/`mockup` or an image extension.

The prod Arc runner (Claude on Cloud Run) emits an illustrative/example image URL inside its draft
or reasoning. That URL gets collected and rendered as the email's hero image. No real BSR media is
behind it — a direct violation of the CLAUDE.md rule: *prefer approved real BSR media; never
fabricate creative; generated assets must carry provenance.*

### Secondary damage

`hasMedia` gates email assets between two renderers
([campaign-package-workspace.tsx:191](../../../src/app/campaigns/_components/campaign-package-workspace.tsx)):

- `MediaReview` — big hero image (used when `media.length > 0`)
- `MessageReviewPane` — proper subject / preview / formatted-body **email layout**

Because the scavenged URL makes `hasMedia` true, the email is rendered by `MediaReview` with the fake
hero and the real email layout is bypassed entirely. So removing scavenged media **also restores the
correct email rendering** for free.

## Approach A — Origin-tagged media (chosen)

Tag every collected media asset with where it came from, then only render genuinely-real media as
creative. Rejected alternatives: host allowlist (brittle, multi-tenant-hostile), and dropping prose
scraping entirely (loses provenance nuance — Approach A already gives us its safety).

### 1. Add an origin to the media type

In `read-model.ts`:

```ts
export type CampaignMediaOrigin = "attached" | "generated" | "referenced";

export type CampaignMediaAsset = {
  id: string;
  type: "image" | "video" | "embed" | "file" | "link";
  origin: CampaignMediaOrigin;   // NEW
  title: string;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string | null;
  description: string | null;
  source: string;
};
```

- `attached` — from an **explicit creative structure**: collection keys
  (`media`, `creative_assets`, `attachments`, …) or creative object/url keys
  (`image_url`, `creative`, …). Handled by `collectMediaAssetsFromObject` /
  `mapMediaAsset`. These are intentional references.
- `generated` — an attached object that also carries generation provenance
  (`job_id` / `generation_id` / `model` / `prompt`), or lives under a
  `generated_assets` collection.
- `referenced` — a **bare URL pulled from free text** (the string branch of
  `buildMediaAssets`, i.e. body / prose). This is the fake-image source.

`createMediaAsset` gains an `origin` param. Thread it through `mapMediaAsset`,
`collectMediaAssetsFromObject`, and the string branch of `buildMediaAssets`.

### 2. Only render real media as creative

Renderable creative = origin `attached` or `generated`. `referenced` media is **not** rendered as an
image/hero.

Implementation: a single helper `renderableMedia(media)` filters to `attached | generated`. Apply it
where the asset's `media` array is assembled for `CampaignWorkspaceAsset` and campaign-level media so
the rest of the UI (which reads `asset.media`) needs no change in logic — `hasMedia` becomes true
only for real creative, so email assets fall through to `MessageReviewPane` correctly.

`referenced` URLs are not lost: they already feed the campaign `sources`/evidence path, so they
remain visible as source links — just never as fabricated creative.

### 3. Provenance on every rendered tile

`MediaTile` and `MediaReview` show a small origin badge derived from `origin` + `source`:
- `attached` → "Approved media" (with `source`, e.g. "Approved BSR media")
- `generated` → "AI-generated" (with `source` / job hint)

This satisfies the CLAUDE.md asset-provenance requirement (source type visible on the card).

### 4. Robust images — `SafeImage`

Add a small client component `SafeImage` that wraps `<img>` with an `onError` handler. On load
failure it collapses to a neutral "Image unavailable" tile instead of a broken-image icon. Use it in
`MediaTile` and `MediaReview`, replacing the raw `<img>` tags. This also protects local demo mode
(picsum) when the network blocks those URLs.

### 5. Honest empty state

When a media-type asset has no renderable media, show an intentional empty slot rather than nothing
or filler: *"No approved media attached yet — attach from Library, or Arc can generate (gated)."*
No fabricated image is ever shown. (Wiring the actual attach-from-Library action is a fast-follow,
not part of this pass.)

## Out of scope (separate pass)

- Wiring the attach-from-Library / Arc-generate actions (this pass shows the empty state + CTA only).
- Deploy/launch/approval-flow QA sweep.

## Testing

- **Domain/read-model unit tests** (`src/lib/campaigns/__tests__` or co-located): given an asset whose
  body/reasoning contains an image-like URL, the produced `media` for rendering excludes it
  (`referenced` filtered out); given an explicit `media`/`creative_assets` collection, those survive
  as `attached`; given a generated payload with `job_id`, it is tagged `generated`.
- **Regression:** an email asset with only a prose-scraped URL now reports `hasMedia === false`
  (→ renders as `MessageReviewPane`).
- `pnpm test` for the campaigns read-model, plus `pnpm build` (tsc) since `CampaignMediaAsset` is a
  typed shape used across the UI — every construction site must set `origin`.

## Risk / rollout

- `CampaignMediaAsset` is constructed in several places (real collectors + `demoMedia`). Adding a
  required `origin` field is caught at compile time — run `pnpm build`, not just `pnpm lint`
  (lint does not typecheck).
- Behavior change is conservative: it only *removes* fabricated creative and *restores* the email
  layout. No outbound behavior, no schema/migration changes.
