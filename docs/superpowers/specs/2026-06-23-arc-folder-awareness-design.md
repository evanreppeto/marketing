# Arc folder awareness — design

**Date:** 2026-06-23
**Status:** Approved (pending spec review)

## Problem

Arc cannot see or understand how Library media is organized into folders, and cannot
organize it either:

- **Read:** `list_media` (runner) → `GET /api/v1/arc/media` → `listAvailableArcMedia`
  returns a flat list of `available_to_arc` assets as `ArcMediaSummary`
  (`id, fileName, url, kind, dimensions, tags, riskFlags`). It carries **no folder
  context** — Arc never learns which folder an asset is in, and there is no
  folder-listing tool at all.
- **Write:** `arcCreateFolder` / `arcFileAsset` (`src/lib/arc-api/media.ts`) and the
  `POST /api/v1/arc/media` route exist and are org-guarded, but **no runner tool is
  wired to them**, so Arc cannot create folders or file assets today.

The goal: make Arc folder-aware so an operator can sort media into purpose-named
folders (Logos, Team, Proof, etc.) and Arc *understands* what each folder is for and
picks the right media — and can organize the library itself.

## Non-goals

- Nested-folder UI. `media_folders.parent_id` stays reserved; the read-model already
  supports nesting, but we seed and operate flat in this iteration.
- Approval-gating folder operations. Organizing the library is internal and
  reversible — never outbound — so folder create/move are direct writes (consistent
  with the existing route comment and the core "no outbound without approval" rule,
  which these do not touch).
- Changing the `available_to_arc` opt-in model. Folder counts and folder-filtered
  listings continue to respect `available_to_arc`.

## How Arc understands a folder

Folder meaning is carried by **name + a free-form `description`** ("purpose"). Arc
reads both. This was chosen over name-only inference (too fragile) and fixed
folder-role enums (too constrained for a multi-tenant product). Seeded defaults ship
with descriptions; folders Arc creates can carry their own description.

## Changes

### 1. Migration — add folder description

New timestamped migration in `supabase/migrations/` (do not edit shipped files):

```sql
alter table public.media_folders
  add column description text;
```

Nullable. No backfill needed. Existing folders simply have a null description.

### 2. Types

`src/lib/media-library/types.ts`:
- `MediaFolderRow`: add `description: string | null`.
- `MediaFolderView`: add `description: string | null`.

`src/lib/media-library/arc-handoff.ts`:
- `ArcMediaSummary`: add `folderId: string | null` and `folderName: string | null`.

### 3. Read side — Arc can SEE + understand

**`listAvailableArcMedia`** (`src/lib/media-library/arc-handoff.ts`):
- Select `folder_id` on the asset query.
- Accept an optional `folderId` filter in `opts` (eq on `folder_id`).
- Resolve folder names: one extra org-scoped query against `media_folders`
  (`id, name`) for the org, build an `id → name` map, and set `folderName` on each
  summary. `toArcMediaSummary` becomes a pure function of
  `(rows, folderNameById)`.

**New read-model `listArcFolders`** (`src/lib/media-library/arc-handoff.ts`):
- Org-scoped query of `media_folders` (`id, name, description, parent_id`) plus a
  count of `available_to_arc` assets per folder.
- Returns `ArcFolderSummary[]`:
  `{ id, name, description, parentId, availableAssetCount }`.
- Returns **all** folders for the org (even those with zero available assets) so Arc
  can see structure and file into empty folders. Counts reflect only
  `available_to_arc` assets — Arc never sees counts for media it cannot use.

**Route** `GET /api/v1/arc/media` (`src/app/api/v1/arc/media/route.ts`):
- Read an optional `folder_id` query param and pass it through to
  `listAvailableArcMedia`.

**New route** `GET /api/v1/arc/folders` (`src/app/api/v1/arc/folders/route.ts`):
- `arcGuard` like the other Arc routes, returns `{ ok, folders: ArcFolderSummary[] }`,
  502 on failure. Mirrors the existing media GET handler.

**Runner tools** (`apps/arc-runner/src/tools/library.ts`):
- Add `folder_id` (optional) to `list_media`'s args and forward it.
- New `list_folders` read tool in `libraryReadTools(...)`: GETs
  `/api/v1/arc/folders`. Description tells Arc these are the operator's organized
  media folders and to use a folder's `description` to decide which media fits.

### 4. Write side — Arc can ORGANIZE

**`arcCreateFolder`** (`src/lib/arc-api/media.ts`):
- Accept an optional `description` string (trim; treat empty as null) and pass it to
  `createFolder`.

**`createFolder`** (`src/lib/media-library/persistence.ts`):
- `CreateFolderInput` gains `description?: string | null`; insert it into the row.

**`POST /api/v1/arc/media`**: no signature change — `create_folder` already passes the
whole payload to `arcCreateFolder`, which now reads `description`.

**Runner tools** (new write/act tier — NOT read):
- `create_folder` (args: `name`, optional `description`, optional `parent_id`) →
  `POST /api/v1/arc/media` `{ action: "create_folder", ... }`.
- `file_asset` (args: `asset_id`, optional `folder_id`) →
  `POST /api/v1/arc/media` `{ action: "file_asset", ... }`.
- These belong to Arc's write/act tier (alongside other direct writes), not the read
  tier. They emit a normal tool result (no approval card) since nothing goes outbound.
  Register them in the runner's write/act tool list (mirror where `create_lead` /
  `update_record`-style write tools are registered).

### 5. Seeded default folders

New helper `defaultMediaFolders()` returning the seed set (pure, unit-testable):

| name | description |
|---|---|
| Logos & Brand | Official logos, wordmarks, and brand marks — headers, watermarks, co-branding. |
| Team & People | Staff, crew, and leadership photos for trust-building and about/team pages. |
| Before & After / Proof | Before/after and proof-of-work photos that show real results. |
| Facilities & Equipment | Trucks, equipment, signage, and workspace shots. |
| General | Uncategorized media. |

Seed in `createWorkspaceDefaults` (`src/lib/auth/workspace-onboarding.ts`), org-scoped
(`media_folders` is keyed by `org_id`):
- **Idempotent:** only seed if the org has zero `media_folders` rows (count check).
  This prevents duplicates when onboarding re-runs for an existing org.
- Insert with `sort_order` ascending so the tree renders in the table's order.
- Names/descriptions are fully editable afterward; operators or Arc can add a literal
  "Damage" folder (or any other) at will. The set is generic by design (multi-tenant
  product), not BSR-specific.

### 6. Library UI (small)

`src/app/` Library folder tree (the component rendering `MediaFolderView`s):
- Show `description` as a folder subtitle/secondary line.
- Let operators edit the description, reusing the existing folder rename action path
  (add a `description` field to that server action + a `setFolderDescription`-style
  persistence call, or extend `renameFolder` to a `updateFolder({ name?, description? })`).
- Follow `DESIGN.md` and reuse `page-header.tsx` primitives; no new layout components.

## Approval safety

No outbound surface is touched. `list_media` / `list_folders` are reads;
`create_folder` / `file_asset` are internal, reversible, org-scoped writes guarded by
`arcGuard` + the per-row org-ownership checks already in `src/lib/arc-api/media.ts`
(cross-org ids rejected). The service-role client bypasses RLS, so every id in a
write payload (parent folder, asset, target folder) continues to be verified against
the token's org before any mutation.

## Testing

- `src/lib/arc-api/__tests__/media.test.ts`: `arcCreateFolder` persists a trimmed
  description; empty/whitespace description stored as null.
- `src/lib/media-library/arc-handoff.test.ts` (or sibling): `toArcMediaSummary`
  includes `folderId` + `folderName`; `listAvailableArcMedia` honors the `folderId`
  filter; `listArcFolders` returns all folders with available-only counts.
- Default-folder helper: `defaultMediaFolders()` shape; seeding is skipped when the
  org already has folders (idempotency).
- `apps/arc-runner/src/tools/library.test.ts`: `list_media` forwards `folder_id`;
  `list_folders` GETs `/api/v1/arc/folders`; `create_folder` / `file_asset` POST the
  right payloads to `/api/v1/arc/media`. Update `apps/arc-runner/src/tools/index.test.ts`
  tool-name expectations.
- `pnpm build` (tsc) after — typed Supabase enums/columns won't be caught by lint.

## Files touched

- `supabase/migrations/<new>_media_folder_description.sql` (new)
- `src/lib/media-library/types.ts`
- `src/lib/media-library/arc-handoff.ts`
- `src/lib/media-library/persistence.ts`
- `src/lib/media-library/read-model.ts` (folder view carries description; select it)
- `src/lib/arc-api/media.ts`
- `src/app/api/v1/arc/media/route.ts`
- `src/app/api/v1/arc/folders/route.ts` (new)
- `src/lib/auth/workspace-onboarding.ts` (seed defaults)
- `apps/arc-runner/src/tools/library.ts` + tests; runner write/act tool registration
- Library folder-tree UI component + its server action
- Tests as listed above
