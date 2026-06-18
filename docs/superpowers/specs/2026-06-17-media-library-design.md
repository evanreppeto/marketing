# Media Library — Design Spec

**Date:** 2026-06-17
**Status:** Approved design, pending implementation plan
**Author:** Arc-assisted brainstorm (Evan)

## Summary

A new top-level **Library** tab where an operator uploads, organizes, and previews
their own media (photos, video, logos), and hands specific assets to Arc to use in
ads and campaigns. It is the canonical home for the "approved real media" the rest
of the product already references but has nowhere to store.

This is an **org-agnostic product surface**, not BSR-specific. Every record is
scoped by `getCurrentOrgId()` so it works for any tenant.

### Goals (from brainstorm)

1. See uploaded images in an organized, scannable grid.
2. Add and remove media easily (upload, rename, move, delete).
3. Tell Arc to use specific assets ("Send to Arc" / "Use in Arc chat").

### Non-goals (YAGNI for v1)

- No image editing / resizing / generation in this tab (Higgsfield stays off; Arc's
  existing `generate-image` route is unchanged).
- No tag-based taxonomy engine — tags exist on assets as a flat `text[]` filter only.
- No nested folders in the UI (schema reserves `parent_id` but v1 ships flat folders).
- No approval workflow on the library itself — uploading is not an outbound action,
  so it needs no approval gate. (Outbound still happens only through Campaigns.)

## User-facing design (validated visually, v4 mockup)

A standard three-region layout in the app's dark/gold theme (`DESIGN.md`):

- **Folder rail (left)** — "All media" + operator-created folders, each with an asset
  count, and a "New folder" action. Flat list in v1.
- **Asset grid (center)** — responsive thumbnail cards. Each card shows the filename,
  dimensions/size, a type badge (PHOTO / VIDEO / LOGO / AI), a "Used in N" marker when
  referenced by a campaign, and on hover a quick-action toolbar (rename, move,
  download, delete). Filter chips above the grid: All types · Photos · Video ·
  Available to Arc · Unused.
- **Detail drawer (right)** — opens on card click: large preview, provenance (source
  type, uploaded by + date, dimensions, size; model/job/prompt for AI assets),
  editable tags, a "Used in" list linking to campaigns, and an Arc panel with an
  **"Available to Arc"** toggle + **"Use in new Arc chat."**
- **Lightbox** — click-to-expand fullscreen preview with prev/next across the library
  and the same action bar.

All icons are inline-SVG line icons (no emoji), consistent with the app.

Mockups: `.superpowers/brainstorm/.../layout-v4.html`.

## Architecture

Follows the wired-feature reference shape (vault / campaigns / interactions):
`src/domain/` (pure) → `src/lib/media-library/` (I/O) → `src/app/library/` (views +
`actions.ts`). Every mutation is gated by `requireOperator()` +
`isSupabaseAdminConfigured()` and scoped by `getCurrentOrgId()`.

### 1. Storage

Reuse the existing public **`campaign-media`** Supabase Storage bucket (already
public, already granted, already where operator photos + Arc-generated images land),
under a `library/<orgId>/<assetId>-<filename>` prefix. Reusing it keeps one public
bucket and keeps generated media + library media coherent for provenance. No new
bucket or grant needed.

Uploads go through a server action using the service-role client (mirrors
`insertPhotoAsset` in `src/lib/campaigns/create.ts`) — the anon key never writes.

### 2. Database (new migration `supabase/migrations/20260617160000_media_library.sql`)

```
media_folders
  id uuid pk, org_id uuid -> organizations (not null),
  name text not null, parent_id uuid null -> media_folders (reserved; flat in v1),
  sort_order int default 0, created_at, updated_at

media_assets
  id uuid pk, org_id uuid -> organizations (not null),
  folder_id uuid null -> media_folders (on delete set null),
  file_name text not null, storage_path text not null, public_url text not null,
  content_type text not null,
  kind text not null check (kind in ('image','video','logo','document')),
  width int null, height int null, byte_size bigint null, duration_seconds numeric null,
  source text not null default 'uploaded'
    check (source in ('uploaded','ai_generated','composite','stock','external')),
  provenance jsonb not null default '{}'::jsonb,   -- model, job_id, prompt, etc.
  risk_flags text[] not null default '{}',
  tags text[] not null default '{}',
  available_to_arc boolean not null default true,
  uploaded_by text, created_at, updated_at
```

RLS enabled as defense-in-depth; `service_role` granted full DML; `anon/authenticated`
granted `select` — matching the brand-kit migration pattern. Isolation enforced in the
app layer via `getCurrentOrgId()`.

### 3. Domain (`src/domain/media-library.ts`, pure + unit-tested)

- `classifyKind(contentType, fileName)` → image | video | logo | document.
- `validateUpload({ contentType, byteSize })` → allowed types + max size; deterministic.
- `formatByteSize`, badge/label derivation, risk-flag typing.
- Re-export through `src/domain/index.ts`.

### 4. Lib (`src/lib/media-library/`)

- `read-model.ts` — org-scoped list of folders (+ counts) and assets, filter/sort, and
  the **"Used in"** join (see §6). Degrades to an `unavailable` status when Supabase is
  not configured (same shape as `getGalleryData`).
- `persistence.ts` — folder + asset CRUD via service-role client; Storage upload helper.

### 5. App (`src/app/library/`)

- `page.tsx` — server component; `await connection()`, reads the read-model, renders
  `PageHeader` + the three-region layout. Empty state via `EmptyState`.
- `_components/` — `folder-rail`, `asset-grid`, `asset-card`, `detail-drawer`,
  `lightbox`, `upload-button` (client where interactivity is needed).
- `actions.ts` (`"use server"`, each `requireOperator()`-gated):
  `createFolder`, `renameFolder`, `deleteFolder`,
  `uploadAssets`, `renameAsset`, `moveAsset`, `deleteAsset`, `setAssetTags`,
  `toggleAvailableToArc`, `sendAssetsToArc`. Each `revalidatePath("/library")`.

### 6. Connecting to the rest of the app

This is the core of "make sure everything needed to connect it is included."

**a. Navigation.**
- Add to `navItems` in `src/app/_components/console-frame.tsx`:
  `{ label: "Library", href: "/library", icon: "library", matches: ["/library"] }`.
- Add `"library"` to the `NavIconName` union and a path entry in
  `src/app/_components/nav-icons.tsx` (a stacked-photos / image-frame line icon).
- `src/proxy.ts` already gates page routes, so `/library` is operator-gated with no
  matcher change.

**b. "Send to Arc" → reuse the existing attachment path.** Arc chat already accepts
`attachments: ArcAttachment[]` (`{ url, objectPath, contentType, name }`) via
`enqueueArcChatTask` (`src/lib/arc-chat/enqueue.ts`), and the runner already reads them
from `agent_task` metadata + `agent_task_inputs`. `sendAssetsToArc(assetIds)` maps each
selected `media_asset` to an `ArcAttachment` (its permanent `public_url` as `url`,
`storage_path` as `objectPath`) and starts a new Arc conversation seeded with those
attachments — no new upload, no GCS signing (library media is already a public URL,
unlike composer uploads which sign through GCS). Per-card "Use in Arc" is the same
action with one asset.

**c. Arc can browse the whole library (read API).** New bearer-gated route
`GET /api/v1/arc/media` (validates `ARC_AGENT_API_TOKEN` via `checkBearerToken`, returns
`503 not_configured` without Supabase) returning `available_to_arc` assets for the org
with provenance + URLs. This is what lets Arc *reference* approved media when drafting
ads, beyond the assets an operator explicitly hands over. Mirrors the existing
`/api/v1/arc/*` route conventions.

**d. "Used in" linkage.** Campaign assets persist media as
`campaign_assets.audit_payload.media_assets = [{ url, path, ... }]`
(`src/lib/campaigns/create.ts`). The read-model derives "Used in N" by matching a
library asset's `storage_path`/`public_url` against those entries. Going forward,
`promoteAssetToCampaign` / `insertPhotoAsset` also stamp `library_asset_id` into the
media-asset provenance object so the join is exact, not URL-based.

**e. AI-generated media flows into the library.** When Arc generates an image
(`POST /api/v1/arc/media/generate-image` → `storeGeneratedImage`, bucket `arc-generated/`),
also insert a `media_assets` row with `source='ai_generated'` and provenance
(model/job_id/prompt), so generated assets appear in an "AI-generated" view and carry
their risk flags. (Small additive change to the generate route; can land in v1.1 if
descoped — the library still functions without it.)

## Error handling & edge cases

- No Supabase → page renders an `unavailable` empty state (like Gallery); actions no-op
  safely behind `isSupabaseAdminConfigured()`.
- Upload validation (type/size) is deterministic in `domain/`; rejected files surface an
  inline error, no partial rows.
- `filename` is sanitized before interpolation into the storage path (same caution noted
  in `insertPhotoAsset`).
- Deleting an asset that is "Used in" a campaign warns first; the storage object and row
  are removed but campaign references already copied media at promote-time, so campaigns
  do not break.
- Deleting a folder sets contained assets' `folder_id` to null (they move to "All media"),
  not a cascade delete.

## Testing

- `src/domain/__tests__/media-library.test.ts` — classify, validate, format (pure).
- `src/lib/media-library/read-model.test.ts` — folder/asset shaping, "Used in" join,
  unavailable degradation (mocked Supabase).
- `src/lib/media-library/persistence.test.ts` — CRUD + upload with an injected uploader
  (like `ImageUploader` in campaigns).
- `sendAssetsToArc` test — asserts correct `ArcAttachment` mapping into the enqueue path.
- Type/lint: run `pnpm build` (tsc) + scoped eslint on changed files (lint ≠ typecheck).

## Open questions

None blocking. Deferred by choice: nested folders, AI-generated auto-ingest (§6e) may
land in v1.1, and exact-match `library_asset_id` backfill for pre-existing campaign media.
