# Arc Reads Brand Documents (SP2) — Design

**Date:** 2026-06-19
**Status:** Approved (design) — pending spec review
**Scope:** Let Arc read the **uploaded brand source documents** — the inventory plus the knowledge extracted from each (structured facts + ~700-char preview), including not-yet-approved nodes — beyond the 24 trusted facts it already receives in its business context.

> Part of the "make `/brand` the hub Arc references" effort. **SP1 (brand identity → Arc)** is in PR #148. **SP2 (this)** = read the uploaded documents. **SP3** = read-only persona panel on `/brand`. **SP2b (deferred)** = full document text.

## Problem

Uploaded brand files become `media_assets`; the Gemini sync extracts their text *transiently* and persists only (a) structured `knowledge_nodes` and (b) a ~700-char `extractedTextPreview` in each node's `props`. The full text is not stored. Arc's business context only surfaces the **24 trusted** brand facts (`listTrustedBrainFacts`), so Arc can neither enumerate the source documents nor read what was pulled from a specific one (especially **proposed**, not-yet-approved knowledge). We give Arc on-demand read access to the brand document inventory + per-document extracted knowledge.

## What exists (reuse, no rebuild)

- `getMediaLibraryData()` (`src/lib/media-library/read-model.ts`) → `{status:"live", assets: MediaAssetView[], …} | {status:"unavailable", message}`. `MediaAssetView` has `id, fileName, kind, source, tags, riskFlags, availableToArc, …`.
- `classifyBrandSource(asset)` + `brandSourceSortScore` (`src/lib/brand-knowledge/source-classifier.ts`) → `{category, label, confidence, reason}`. The `/brand` page already uses these to pick "knowledge sources" (`kind==="document" || source==="google_drive" || classification.confidence==="high"`).
- `listNodes(query?, client?, orgId?)` (`src/lib/knowledge-graph/read-model.ts`) → `{status:"live", nodes: BrainNode[]} | …`. `BrainNode` has `kind, trustTier, label, summary, body, source, refTable, refId, props`. Nodes from docs have `refTable="media_assets"`, `refId=<assetId>`.
- Arc read pattern: `apps/arc-runner/src/tools/intelligence.ts` (`intelligenceTools`) registered in `readTools()`; route helpers `arcGuard`/`ok`/`fail` (`src/app/api/v1/arc/_lib/http.ts`); `ArcClient.apiGet(path, params?)`.

## Behavior

Arc fetches, on demand:
- **The inventory** of brand source documents the operator marked **available to Arc**, each with name, kind, source, classification, and knowledge stats (total / approved / proposed node counts).
- **One document's detail**: its metadata + the knowledge nodes extracted from it (label, summary, preview/body, kind, trust tier, source), **including proposed** ones.

## Architecture (uniform with the intelligence reads)

### a. Read-model — `src/lib/brand-knowledge/sources-read-model.ts` (new)
- `listBrandSources(): Promise<BrandSourceSummary[]>` — calls `getMediaLibraryData()`; if not live, returns `[]`. Filters assets to **brand sources** (`kind==="document" || source==="google_drive" || classifyBrandSource(asset).confidence==="high"`) **AND `availableToArc`**. For each, attaches `classification` + node stats by reading `listNodes({}, …)` once and grouping nodes where `refTable==="media_assets"` (counts: `total`, `trusted`, `proposed`). Returns a compact list: `{ id, fileName, kind, source, tags, classification:{category,label,confidence}, brain:{total,trusted,proposed} }`.
- `getBrandSource(assetId): Promise<BrandSourceDetail | null>` — finds the asset in `getMediaLibraryData()` (must be a brand source **and `availableToArc`**, else `null`); returns `{ ...summary, nodes: BrandSourceNode[] }` where `nodes` are the `knowledge_nodes` with `refTable==="media_assets" && refId===assetId`, mapped to `{ kind, trustTier, label, summary, preview, source }` (`preview` = `node.summary || node.body || props.extractedTextPreview`), **including proposed**. Bounded to a sane cap (e.g. first 40 nodes).
- Org resolution follows the existing read-models (internal, via the same client path as `listNodes`/library). Graceful `[]`/`null` when Supabase is unconfigured.

### b. App routes
- `GET /api/v1/arc/brand/sources` → `arcGuard` → `listBrandSources()` → `ok({ documents })`; `fail(…,502)` on error.
- `GET /api/v1/arc/brand/sources?id=<assetId>` → `getBrandSource(id)`; `null` → `fail("not_found", …, 404)`, else `ok({ document })`.
- New file `src/app/api/v1/arc/brand/sources/route.ts` (sibling of the existing `brand/context`, `brand/profile` routes).

### c. Runner tools — extend `apps/arc-runner/src/tools/intelligence.ts`
- `list_brand_documents` → `apiGet("/api/v1/arc/brand/sources")`. "List the uploaded brand source documents Arc can use, with what's been learned from each."
- `read_brand_document` (`{ id }`) → `apiGet("/api/v1/arc/brand/sources", { id })`. "Read one brand document's details + the knowledge extracted from it (including items still pending approval)."
- Both via the shared `runTool` helper (bounded, never-throws); added to `readTools()` so they're in **every mode**; add the two names to `index.test.ts`'s READ set; one-line prompt mention in `prompt.ts`.

## Data flow

```
Arc turn → list_brand_documents → GET /api/v1/arc/brand/sources
  → listBrandSources(): library assets ∩ brand-source ∩ availableToArc, + per-doc node stats → ok({ documents })
Arc → read_brand_document{id} → GET /api/v1/arc/brand/sources?id=…
  → getBrandSource(id): asset + its knowledge_nodes (incl. proposed) → ok({ document })
  → Arc reasons over / cites the source document's extracted knowledge
```

## Safety & scope

- **Read-only**, bearer-gated (`arcGuard`), org-scoped, bounded (8000-char `runTool` cap + node cap). No writes, no approvals, no outbound.
- **Scoped to `availableToArc` documents** — honors the operator's "Arc can use this" gate (and the sync pipeline only proposes nodes for those).
- Surfacing **proposed** (unapproved) knowledge to Arc is for *reading/reasoning only*; outbound still requires human approval, so this changes nothing about the approval posture.
- **No schema change**, no migration. App routes → Vercel; runner tools → Cloud Build trigger.

## Testing

- **Read-model:** `listBrandSources` filters to brand-source + `availableToArc`, attaches node stats; `getBrandSource` returns linked nodes incl. proposed, returns `null` for a non-brand / non-available / missing id; both return `[]`/`null` gracefully when the library/Supabase is unavailable. (Mock `getMediaLibraryData` + `listNodes`.)
- **Routes:** 401 without token; list returns `documents`; `?id=` returns `document`; missing id → 404; read-model error → 502. (Mirror `opportunities/route.test.ts`.)
- **Runner tools:** each calls the expected route; `read_brand_document` passes `{ id }`; `index.test.ts` READ set includes the two new names.
- Full runner suite + `pnpm build`.

## Out of scope

- **SP2b:** persisting + serving full document text (this ships the inventory + extracted gist; revisit if the gist proves thin).
- Approving / editing / re-extracting knowledge from Arc (read-only).
- **SP3:** the persona panel on `/brand`.
