# Campaign Media Gallery — "Restoration Reel"

**Date:** 2026-06-17
**Status:** Design approved (visual direction); pending spec review
**Author:** Arc / Evan

## Summary

A new top-level **Gallery** tab that surfaces every piece of campaign media produced
across all campaigns in one scrollable, deliberately "alive" feed. It is a fun,
showcase-grade view of the creative work — a hero reel of recent approved media on
top of a kinetic masonry feed of everything else, with a click-to-open lightbox that
exposes full provenance and links back to the owning campaign.

It is **read-only and approval-safe**: it displays and navigates, it never mutates,
sends, publishes, or approves. All approve/decline decisions stay on the existing
campaign approval cards. This is a presentation layer over media that the campaign
read-model already assembles.

## Goals

- Give the operator a single delightful place to browse all produced campaign media.
- Make provenance (real BSR media vs. AI-generated) and approval state obvious on
  every tile — reinforcing the product's "evidence + approval state obvious" priority.
- Reuse existing data and UI primitives; add no database schema.

## Non-Goals (YAGNI)

- No in-gallery approve/decline/revise (decisions stay on campaign cards).
- No download / zip / export.
- No album/collection editing or tagging.
- No infinite-scroll pagination in v1 (the read-model's existing 100-campaign cap is
  sufficient; documented as a follow-up if media volume grows).
- No Higgsfield or any outbound/production action (stays operationally off).
- The "living wall" marquee (option A) is **not** in v1 — noted as a possible future
  "ambient mode" toggle to avoid stacking two competing auto-animations.

## Design Direction (validated visually)

Composition, blending the strongest elements explored in the visual companion:

1. **Spotlight reel hero** — a large featured panel at the top that auto-cycles
   through the most recent **approved** media (image/video). The "wow" on load.
2. **Kinetic masonry feed** — the main scroll surface below the hero. CSS
   `columns`-based masonry preserving each image's aspect ratio; tiles have a slow
   idle float.
3. **Tactile tilt hover** — each tile lifts and tilts in 3D toward the cursor with a
   light glare sweep on hover.
4. **Lightbox** — clicking a tile opens a centered overlay: media large on the left,
   provenance/status metadata sidebar on the right, plus an "Open campaign →" link
   and a "View full size" link to the raw asset URL.

### Visual system

- Palette and rules per `DESIGN.md`: Command Charcoal / Canvas White / Restoration
  Red; no emojis; no purple/neon AI aesthetic. "Fun" comes from **motion and rhythm**
  (hero cycle, float, tilt, lightbox), not from loud color.
- This is a deliberate "alive" surface — an intentional exception to DESIGN.md's calm
  defaults, in the same spirit as the `/mark` chat exception zone. The exception is
  scoped to the gallery's motion; colors/typography stay on-system.

### Accessibility / safety rails

- **`prefers-reduced-motion`**: when set (OS/user), all auto-motion (hero auto-cycle,
  idle float) is disabled and tilt is reduced to a simple elevation change. The hero
  becomes a static "latest approved" panel with manual prev/next.
- **Empty / degraded states**: with Supabase unconfigured or zero media, render a
  clean `EmptyState` (never a broken hero). The read-model returns the same
  `{ status: "live" | "unavailable" }` discriminated shape as sibling read-models.

## Architecture

Follows the project layering: `domain` (none needed here — pure presentation of
existing records) → `lib/<feature>` (read-model) → `app/<route>` (server component +
colocated client components).

### 1. Read-model — `getMediaGallery()`

**File:** `src/lib/campaigns/read-model.ts` (extend; reuse existing helpers).

- Reuses the existing campaign + asset + approval + output load already performed by
  `getCampaignWorkspaceList()` and the `buildMediaByCampaign` / `buildWorkspaceAssets`
  helpers. Factor the shared load into a small internal helper if it reduces
  duplication; otherwise call the existing path and flatten its output.
- **Flattens** every `CampaignMediaAsset` across all campaigns into a flat
  `GalleryItem[]`. Each `GalleryItem` carries:
  - `media: CampaignMediaAsset` (existing type: `id`, `type` image|video|embed|file|link,
    `title`, `url`, `thumbnailUrl`, `mimeType`, `description`, `source`)
  - `campaignId: string`, `campaignName: string`
  - `assetType: string` (e.g. `social_ad`, `image_prompt`)
  - `approvalStatus` — normalized to a small UI set: `approved` | `pending` |
    `rejected` | `draft` (mapped from the existing `approval_status` enum)
  - `sourceType` — `real` | `ai` | `composite` | `stock` | `external` (derived from the
    media `source` / asset `tool_source` / `source_system`, same logic already used to
    label provenance elsewhere)
  - `format: string | null` (aspect ratio / channel hint where available)
  - `updatedAtIso: string` (for sorting; newest first)
- **De-dupes by URL**: identical media reused across campaigns appears once, with a
  `usedInCount` and the list of campaign refs retained for the lightbox.
- **Return shape:**
  ```ts
  type MediaGallery =
    | { status: "unavailable"; message: string }
    | {
        status: "live";
        items: GalleryItem[];
        hero: GalleryItem[];            // recent approved media for the reel (e.g. up to 6)
        totals: { media: number; campaigns: number; approved: number; ai: number };
      };
  ```
- Guarded by `isSupabaseAdminConfigured()`; returns `unavailable` (not a throw) when
  env is absent, matching sibling read-models.

### 2. Route + nav

- **Page:** `src/app/gallery/page.tsx` — async server component. Calls
  `getMediaGallery()`, renders `PageHeader` + the gallery, or `EmptyState` when
  `unavailable`/empty. Static (no dynamic params).
- **Nav:** add `{ label: "Gallery", href: "/gallery", icon: "gallery" }` to `navItems`
  in `src/app/_data/growth-engine.ts`. The `gallery` icon already exists in
  `nav-icons.tsx` — no icon work needed. Placement: after Campaigns (Arc, Campaigns,
  Gallery, Opportunities) — adjacent to the work it showcases.

### 3. Components — `src/app/gallery/_components/`

- **`gallery-view.tsx`** (client) — top-level interactive wrapper. Holds filter state
  and the selected-lightbox state; receives the server-loaded `GalleryItem[]` and
  `hero` as props (serializable data only — no function props across the RSC boundary,
  per project convention). Renders hero + filter bar + masonry + lightbox.
- **`spotlight-reel.tsx`** (client) — the auto-cycling hero. Uses `hero` items.
  Respects `prefers-reduced-motion` (manual prev/next, no auto-advance).
- **`gallery-filter-bar.tsx`** (client) — type (All / Images / Video / Docs),
  provenance (Real BSR / AI), status (Approved / Pending). Pure client-side filtering
  over already-loaded items; no refetch. Shows live counts.
- **`media-tile.tsx`** — a single tile: thumbnail, provenance badge, approval dot,
  tilt/float interaction, click → opens lightbox. Reuses `StatusPill` tone mapping.
- **`media-lightbox.tsx`** (client) — overlay with large media + provenance sidebar +
  "Open campaign →" (`/campaigns/[campaignId]`) and "View full size" (raw URL). Closes
  on Esc / backdrop click; focus-trapped for accessibility.

Reuse `PageHeader`, `Panel`, `StatusPill`, `EmptyState` from
`src/app/_components/page-header.tsx`. Motion is CSS-driven (keyframes + transitions)
per the project's "inline SVG / CSS over heavy libs" lessons — no animation library.

## Data Flow

```
getMediaGallery()  (server, src/lib/campaigns/read-model.ts)
  └─ reuse existing campaigns+assets+approvals+outputs load
  └─ buildMediaByCampaign / buildWorkspaceAssets  (existing helpers)
  └─ flatten → GalleryItem[]  (+ de-dupe by URL, derive sourceType/status, sort)
        │
        ▼
src/app/gallery/page.tsx  (server component)
  └─ status === "unavailable" | items empty → <EmptyState/>
  └─ else → <GalleryView items=… hero=… totals=… />   (serializable props only)
        │
        ▼
GalleryView (client)
  ├─ <SpotlightReel hero/>
  ├─ <GalleryFilterBar/>  → filters items in client state
  ├─ masonry of <MediaTile/>
  └─ <MediaLightbox/>  (links to /campaigns/[id]; no mutations)
```

## Error Handling & Edge Cases

- Supabase unconfigured / read error → `status: "unavailable"` → `EmptyState` with the
  message. No throw, no broken hero. (Consistent with `supabase-unreachable` handling;
  do not introduce new long-retry read paths.)
- Zero media but live → `EmptyState` ("No campaign media yet").
- Media with a missing/broken `thumbnailUrl` → tile falls back to a typed placeholder
  tile (type label + provenance), never a broken `<img>`.
- Video items → tile shows a poster/placeholder with a play affordance; lightbox uses a
  `<video>` element.
- All props crossing the RSC→client boundary are plain data (no formatter functions),
  per the prior `/analytics` RSC crash lesson.

## Testing

- **Read-model unit tests** (`src/lib/campaigns/__tests__/` or alongside existing
  read-model tests): given fixture campaigns/assets/approvals, `getMediaGallery()`
  - flattens media across campaigns,
  - de-dupes identical URLs and counts `usedInCount`,
  - maps `approval_status` → the normalized UI status set,
  - derives `sourceType` (real vs ai) correctly,
  - sorts newest-first,
  - selects only approved media into `hero`,
  - returns `unavailable` when Supabase is not configured.
- **Type/build check:** `pnpm build` (lint does not typecheck) — Supabase enum literals
  must stay valid unions.
- **Manual smoke:** `pnpm seed:test-campaign` (or `pnpm seed:arc-demo`) then load
  `/gallery`; verify hero cycles, tiles tilt/float, lightbox opens and links to the
  campaign, filters narrow the set, reduced-motion disables auto-animation.

## Files Touched

- `src/lib/campaigns/read-model.ts` — add `getMediaGallery()`, `GalleryItem`,
  `MediaGallery` types (+ optional shared-load refactor).
- `src/app/_data/growth-engine.ts` — add Gallery nav item.
- `src/app/gallery/page.tsx` — new server component page.
- `src/app/gallery/_components/{gallery-view,spotlight-reel,gallery-filter-bar,media-tile,media-lightbox}.tsx`
  — new client/presentation components.
- Tests under the campaigns read-model test directory.

No migration. No new API route. No new env var.

## Open Questions

- Hero source: "recent approved media" is the v1 rule. Confirm we don't also want to
  feature pending/AI media in the hero (kept approved-only for a clean showcase).
- Nav order: placed Gallery right after Campaigns; confirm that position.
