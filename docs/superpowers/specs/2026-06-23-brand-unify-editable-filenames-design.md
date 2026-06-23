# Unify Library under "Brand" + editable filenames — design

Date: 2026-06-23
Status: approved (design), pending implementation plan

## Problem

Two user requests, both touching the media/brand area:

1. **Edit file names in the Library.** Today the detail drawer shows an asset's
   filename as static text — there's no way to rename it from the UI.
2. **Combine the Library and Brand pages into a single "Brand" destination.**
   The two pages (`/library` asset grid, `/library/brand` brand-knowledge
   dashboard) are already joined by a shared `Assets | Brand` tab switcher, but
   the sidebar still presents them as two separate top-level nav items.

## Context (current state)

- **`/library`** ([src/app/library/page.tsx](../../../src/app/library/page.tsx)) — media/asset grid + folder rail, `LibraryTabs active="assets"`.
- **`/library/brand`** ([src/app/library/brand/page.tsx](../../../src/app/library/brand/page.tsx)) — brand-knowledge dashboard (profile, knowledge sources, facts, personas, profile editor), `LibraryTabs active="brand"`.
- **[LibraryTabs](../../../src/app/library/_components/library-tabs.tsx)** — segmented control: `Assets` (`/library`) and `Brand` (`/library/brand`).
- **Sidebar nav** ([console-frame.tsx](../../../src/app/_components/console-frame.tsx), `assetNavItems`) — separate `Library` (`/library`, `exact`) and `Brand` (`/library/brand`) entries.
- **Rename is already wired end-to-end**: `renameAssetAction` ([actions.ts](../../../src/app/library/actions.ts)) → `renameAsset` ([persistence.ts](../../../src/lib/media-library/persistence.ts)). The detail drawer simply never surfaces it.

## Decision

Chosen approach (user-selected): **one nav item, keep the tabbed views.** Lowest
risk — preserves both rich views and only unifies the entry point + naming. No
inline page merge, no schema/route restructure.

## Changes

### 1. Sidebar nav — one "Brand" entry
In `assetNavItems`, replace the two entries (`Library` + `Brand`) with one:

```ts
{ label: "Brand", href: "/library/brand", icon: "brand", matches: ["/library"] }
```

- Lands on the brand-knowledge view (`/library/brand`).
- `matches: ["/library"]` (non-exact) keeps the entry highlighted on both
  `/library/brand` and `/library` (the Files tab), since `/library/brand`
  starts with `/library`.
- Mobile nav (`MobileNavDock`) and the active-label lookup derive from the same
  `navItems` array, so both update automatically.

### 2. Tab switcher — Brand-led, "Files" rename
In `LibraryTabs`, since the section *is* "Brand":
- Order/label as **`Brand kit` (`/library/brand`) | `Files` (`/library`)**.
- The `active` prop keys stay `"assets" | "brand"`; only labels/order change.
- `/library` page: header title and `metadata.title` change from "Library" to
  "Files" to match the tab.

### 3. Editable filename in the detail drawer
In [detail-drawer.tsx](../../../src/app/library/_components/detail-drawer.tsx),
make the filename (currently a static `<div>`) an inline-editable field, mirroring
the existing tag-input pattern in the same component:
- Click the name (or a small pencil affordance) → editable input.
- Save on blur / Enter via the existing `renameAssetAction`; Escape cancels.
- Local draft state resets on asset change (component is already keyed on
  `asset.id`, so no sync effect needed).
- **Preserve the extension**: split `fileName` into stem + extension; the user
  edits the stem and the extension is re-appended on save, so a rename can't
  silently drop `.jpg`/`.pdf`/etc. Assets with no extension edit the whole name.
- Empty/whitespace-only names are rejected (no-op), matching `renameAssetAction`'s
  existing `if (id && name)` guard.

### 4. Revalidation tweak
`renameAssetAction` currently revalidates only `/library`. Add
`revalidatePath("/library/brand")` so the brand page's filename list (FileRow)
reflects renames — consistent with `setTagsAction`/`toggleAvailableToArcAction`.

## Out of scope

- Inline rename from the asset grid / right-click menu (drawer only for v1).
- Merging the asset grid inline into the brand page (tabs retained by choice).
- The separate `Gallery` nav item (unrelated feature).
- Any change to `renameAsset` persistence or the DB.

## Testing / verification

- `renameAsset` persistence already has coverage in
  [persistence.test.ts](../../../src/lib/media-library/persistence.test.ts); add
  a unit test for the extension-preserving stem/extension split helper (pure
  function, put it in `domain/` or colocated and unit-test it).
- `tsc --noEmit` + scoped `eslint` clean.
- Manual: rename an asset in the drawer (with and without an extension), confirm
  it persists and the extension is intact; confirm the single "Brand" nav entry
  highlights on both tabs and the mobile nav shows one entry.

## Risk

Low. UI + nav-array + one revalidate line; no new backend, routes, or schema.
The filename stem/extension split is the only new logic — isolated and unit-tested.
