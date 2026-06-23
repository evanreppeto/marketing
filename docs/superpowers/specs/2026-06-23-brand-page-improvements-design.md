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

## Non-goals

- No new outbound/automatic behavior. The human-approval gate is preserved.
- No new top-level route (`/knowledge`). The brand page stays the single surface.
- No change to the Gemini extraction prompt/model or the Brain persistence layer.
- Higgsfield remains operationally off.

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
- Existing `brain-sync` / `gemini-parser` tests stay green (no signature changes).

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

## Out of scope / future

- A dedicated `/knowledge` route or document-summary viewer.
- Color-palette auto-extraction from uploaded logos (Gemini already returns visual
  cues; surfacing a one-click "apply palette" is a separate follow-up).
- Bulk re-sync of already-uploaded sources after the type widening.
