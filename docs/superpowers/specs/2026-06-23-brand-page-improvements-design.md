# Brand Page Improvements — Design

**Date:** 2026-06-23
**Author:** Evan + Arc
**Status:** Approved for planning

## Problem

The brand page (`/library/brand`, aliased at `/brand`) is where an operator gives
Arc everything it needs to write on-brand: logo, palette, voice, offerings, proof,
rules, and reference media. Three problems undercut it today:

1. **You cannot upload a knowledge-base document.** Uploads only accept PDF,
   images, and SVG/ICO. A Word doc, Google Doc export, `.txt`, `.md`, or `.csv` —
   exactly "a document with lots of information" — is rejected at the domain layer
   (`DOC_TYPES = ["application/pdf"]` in `src/domain/media-library.ts`).
2. **The page is overwhelming.** It renders 8 stacked sections (identity, media,
   Arc chat, upload, review queue, brand details, source list, personas), which
   fights the goal of a calm, simple page.
3. **It is not obvious what Arc learned from a document.** Extracted facts land in
   a flat review queue, not visibly tied back to the document they came from.

**What already works (do not rebuild):** the parse → learn → approve loop. Uploads,
URLs, website imports, and chat notes already become Library assets, get read by
Gemini (`src/lib/brand-knowledge/gemini-parser.ts`, which reads PDFs/images/text
natively), and propose brand facts + profile updates into a human review queue.
Approved facts govern Arc's copy. Nothing reaches the outside world without
approval. Higgsfield stays off.

## Goals

- Accept real knowledge-base documents (`.txt`, `.md`, `.csv`, `.docx`) in addition
  to the current PDF/image/SVG.
- Simplify the page to four calm zones; relocate media + sources into the Library
  tab where assets already live.
- Make "what Arc learned from this document" visible at the point of review.
- Give humans a **professional, working editor** for everything Arc learns — one
  canonical editor, no drift between brand page and settings, with inline
  validation and live state.
- Ensure brand edits **propagate everywhere brand data is consumed** — masthead,
  app chrome, analytics, and the Arc runner — and document those consumers so the
  guarantee is explicit, not incidental.

## Non-goals

- No new outbound/automatic behavior. The human-approval gate is preserved.
- No new top-level route (`/knowledge`). The brand page stays the single surface.
- No change to the Gemini extraction prompt/model or the Brain persistence layer.
- Higgsfield remains operationally off.
- No new wiring of the brand profile into campaign/landing-page *generation* beyond
  what already consumes it (that flows through Arc, tracked separately). "Reflected
  across the app" here means the existing consumers stay correct and fresh.

## Pillar 1 — Accept real documents

### Domain (`src/domain/media-library.ts`)

Widen the accepted content types:

```
DOC_TYPES = [
  "application/pdf",
  "text/plain",                 // .txt
  "text/markdown",              // .md
  "text/csv",                   // .csv
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]
```

- `validateUpload` accepts the widened list (50 MB cap unchanged).
- `classifyKind` continues to return `"document"` for all of these (the catch-all
  already does; add explicit cases only if a test reads cleaner). SVG/ICO still
  classify as `"logo"`.
- Unit tests in `src/domain/__tests__/media-library.test.ts` cover each new type
  (accepted) and a still-rejected type (e.g. `text/html`, `application/zip`).

### Text extraction (`src/lib/brand-knowledge/asset-text.ts` — new)

A thin I/O helper (not in `domain/`, because `.docx` parsing touches a library)
that turns uploaded bytes into `extractedText` before the Gemini step:

```
extractAssetText({ bytes, contentType, fileName }): Promise<string | null>
```

- `text/plain`, `text/markdown`, `text/csv` → decode UTF-8, return trimmed text.
  Zero new dependencies.
- `.docx` (the wordprocessing mime) → `mammoth.extractRawText({ buffer })`. **New
  dependency: `mammoth`** (small, well-established docx→text).
- PDF and images → return `null`; Gemini already reads these natively from the
  inline file bytes, so we keep that path untouched.
- Failures (corrupt docx, decode error) → return `null` and let the caller fall
  back to the existing behavior; never throw out of the upload action.

### Wiring (`src/app/library/brand/actions.ts`)

In `uploadAndAnalyzeBrandSourcesAction`, after `insertAsset`, call
`extractAssetText` and pass the result as `extractedText` to
`learnBrandKnowledgeFromAsset` (alongside the existing `fileBytes`/`contentType`).
For PDFs/images `extractedText` stays null and Gemini uses the inline bytes exactly
as today. No change to `gemini-parser.ts`.

### Upload UI (`src/app/library/brand/_components/brand-source-upload.tsx`)

Widen the `accept` attribute to include the new types
(`.txt,.md,.csv,.docx,text/plain,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
and keep the existing PDF/image/SVG entries. Update the helper copy to mention
"Word docs, text, PDFs, images."

## Pillar 2 — Four calm zones

Restructure `src/app/library/brand/page.tsx` to render, top to bottom:

1. **Identity** — `BrandIdentity` (logo, palette, fonts, name, tagline, edit).
   Unchanged.
2. **Teach Arc** — one intake panel. Merge the Arc chat (`BrandArcChat`) and the
   file/URL/website upload (`BrandSourceUpload`) under a single heading with a
   simple two-state toggle: **Upload & links** | **Chat**. One obvious place to add
   knowledge. (Components keep their internal logic; a small client wrapper holds
   the toggle state.)
3. **What Arc learned — needs review** — `BrandReviewQueue`, grouped by source
   document (Pillar 3).
4. **Brand at a glance** — `BrandDetails` (approved facts + profile editor).
   Unchanged.

### Relocate media + sources to the Library tab

- Remove `BrandMedia` and `BrandSourceList` from the brand page. Their content
  (assets, brand-source documents) already lives in the Library tab — brand
  sources are Library assets tagged `brandSource`.
- Add a **"Documents"** filter chip to `src/app/library/_components/filter-chips.tsx`
  (`kind === "document"`), so brand-source docs (PDFs, Word, notes, URL imports)
  stay easily findable in the Library. Update `AssetGrid`'s filter logic to honor
  it.
- `BrandPersonas` is replaced on the brand page by a single compact summary card
  linking to `/personas` (the personas page already exists). The full
  `BrandPersonas` component is removed from the brand page (not deleted from the
  repo if still used elsewhere; confirm during planning).

Net: the brand page drops from 8 sections to 4 + a small personas link.

## Pillar 3 — Per-document review

Group the flat review list by the document it came from.

- **Pure helper** (testable): `groupReviewItemsBySource(items): SourceGroup[]`,
  where `SourceGroup = { sourceLabel, sourceRef, items, count }`. Lives in
  `src/lib/brand-knowledge/source-control.ts` (or a sibling) with unit tests.
  `SourceControlReviewItem` already carries `sourceLabel`.
- **UI** (`brand-review-queue.tsx`): render one card per source document —
  header "From `<sourceLabel>` — Arc found N facts" — with the facts beneath and
  per-item Approve/Reject (existing actions) plus an optional "Approve all from
  this document" convenience button. Empty state unchanged ("You're all caught up").

This makes the loop legible: upload a knowledge doc → immediately see the grouped
card of what Arc pulled from *that* document → approve.

## Pillar 4 — Professional, working editors (one source of truth)

Humans must be able to edit everything Arc learns, and those editors must look
professional and behave correctly. Today there are **two** editors writing the same
`business_profiles` record, and they have drifted.

### Unify on one editor

- The brand-page editor (`brand-profile-editor.tsx`) is the complete one: tabbed
  (Company / Voice / Palette / Offerings & proof / Rules), with logo + favicon
  upload, color pickers, fonts, industry templates, and a live preview. It is the
  **canonical** editor.
- The settings editor (`src/app/settings/brand-kit-form.tsx`) is a subset — it does
  **not** edit the palette/fonts at all. Resolve the drift: Settings → "Brand Kit"
  becomes a **compact read-only summary** (name, logo, palette swatches, status)
  with an "Edit on the Brand page" link. Remove `brand-kit-form.tsx` as a second
  editing surface so there is a single place to change brand. (Both already submit
  to the same `saveBrandKitAction`, so no persistence change is needed.)
- *Decision flagged for review:* fully replace the settings form with a
  summary+link (recommended, simplest, kills drift) vs. extract one shared editor
  component rendered in both places. Recommendation: summary+link.

### Make the editor professional + correct

- **Remove `signal-eyebrow` kickers** ("Editor", "Editing", "Preview") from the
  editor and any new brand-page sections — they violate the established no-eyebrow
  rule and the calm DESIGN.md direction. Use plain section titles.
- **State sync:** the editor seeds form state once via `useState(() => toValues(profile))`.
  It is fine on open (it remounts), but if Arc updates the profile while the editor
  is open (a chat/upload refresh), the form goes stale. Key the editor on a profile
  version (e.g. `updatedAt`) so an external change re-seeds it; the user's unsaved
  in-progress edits for the *currently focused* field are preserved where feasible.
- **Inline validation:** surface per-field errors (invalid hex, malformed URL,
  required name) next to the field, not only as a single status pill. Reuse
  `validateBusinessProfile` from `@/domain`; map its errors to fields. Keep the
  top-level save pill as a summary.
- **Decompose for reliability:** the editor is ~760 lines in one file. Split each
  tab's body into a small colocated section component (`_components/brand-editor/`)
  so each unit is independently readable and testable. No behavior change — purely
  structural, in service of the change we are making here.
- **Save affordance:** keep the single explicit "Save brand" action (no silent
  autosave for brand-governing data); show saving / saved / error states clearly.

## Pillar 5 — Propagation across the app

Brand edits must be reflected everywhere brand data is used. The consumers today:

| Consumer | Reads | Refresh mechanism |
| --- | --- | --- |
| Brand masthead (`brand-identity.tsx`) | name, tagline, logo, palette, fonts | server component + `revalidatePath` |
| App chrome (`src/app/layout.tsx` via `resolveBrandIdentity`) | display name, logo, favicon | `revalidatePath("/", "layout")` |
| Analytics page (`brandPalette`) | palette | `revalidatePath("/", "layout")` |
| Arc runner (`apps/arc-runner/src/business-context.ts`) | full profile incl. palette/voice/rules | live read of `/api/v1/arc/brand/profile` (no Next cache) |
| Brain / Arc copy | approved brand facts | `createNode` + `/brain` revalidate |

Work in this pillar:

- **Verify and lock the revalidation set.** `saveBrandKitAction` already calls
  `revalidatePath("/", "layout")` + `/library/brand` + `/settings` + `/arc`. Confirm
  this covers the consumers above after the layout changes (the new Settings summary
  and the relocated Library views). Add `/analytics` if it is not covered by the
  layout revalidation in practice.
- **Confirm the Arc API stays fresh.** `/api/v1/arc/brand/profile` is an API route
  reading live persistence; add/maintain a test asserting it returns updated fields
  after a save (the route already has a test file).
- **Approved facts → Arc.** Unchanged: approving a review item writes a trusted
  Brain node that the runner reads. Add a test confirming an approved
  brand-source node is retrievable by the brand-profile/brain read path.
- **No silent staleness.** Any new brand-page surface (per-document review cards,
  Teach Arc panel) reads from the same read-models and is covered by the existing
  `revalidatePath` calls; do not introduce a parallel cache.

## Data flow (unchanged spine)

```
upload/url/website/chat
  → insertAsset (Library, tagged brandSource)
  → extractAssetText (NEW: txt/md/csv/docx → text; pdf/img → null)
  → learnBrandKnowledgeFromAsset
      → Gemini parse (text or inline bytes)  [unchanged]
      → propose brand_fact/messaging/proof/cta nodes (untrusted)  [unchanged]
  → BrandReviewQueue (NEW: grouped by source)
  → operator approves → trusted → governs Arc copy  [unchanged]
```

## Testing

- `media-library.test.ts`: new accepted types + a still-rejected type.
- `asset-text.test.ts`: txt/md/csv decode; docx via a small fixture; pdf/image →
  null; corrupt input → null (no throw).
- `source-control` grouping test: items from two documents group into two cards
  with correct counts; single-source and empty cases.
- Editor field-error mapping: `validateBusinessProfile` errors map to the right
  fields (pure helper, unit-tested); invalid hex / URL surface inline.
- `/api/v1/arc/brand/profile` route test: returns updated fields after a save
  (extend the existing route test).
- Propagation: approving a brand-source review item yields a trusted node
  retrievable by the brand/brain read path (extend `brain-sync`/source-control
  tests).
- Existing `brain-sync` / `gemini-parser` / `brand-kit/form` tests stay green
  (no persistence or form-contract signature changes).

## Risks & mitigations

- **`mammoth` dependency / bundle:** server-only (used in a server action); import
  dynamically inside `extractAssetText` so it never reaches the client bundle.
- **Large docs:** Gemini prompt already truncates document text to 16k chars; keep
  that. The 50 MB upload cap is unchanged.
- **Feature relocation regressions:** moving media/sources to Library must keep
  brand sources findable — the new Documents filter covers this. Verify the
  Library tab still surfaces all previously-visible assets before removing the
  brand-page sections.
- **`force-dynamic` + revalidate paths:** keep the existing `revalidatePath`
  calls; add none beyond `/library` (already revalidated) and `/library/brand`.
- **Removing the settings editor:** `brand-kit-form.tsx` is imported by
  `brand-kit-settings.tsx` and may be referenced by first-run/start flows
  (`src/app/start/`). Audit references before removing; the summary card must keep
  the same `saveBrandKitAction` reachable from at least one place (the brand page).
- **Two editors during transition:** until the settings form is replaced, both
  write the same record via the same action — safe, just redundant. Ship the
  canonical editor changes first, then swap settings to the summary, so brand
  editing is never broken mid-change.
- **Editor decomposition regressions:** splitting the 760-line editor must preserve
  every form-field `name` (the server action reads them positionally from
  `FormData`). Snapshot the emitted field names before/after.

## Out of scope / future

- A dedicated `/knowledge` route or document-summary viewer.
- Color-palette auto-extraction from uploaded logos (Gemini already returns visual
  cues; surfacing a one-click "apply palette" is a separate follow-up).
- Bulk re-sync of already-uploaded sources after the type widening.
