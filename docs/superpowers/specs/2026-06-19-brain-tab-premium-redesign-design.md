# Brain Tab — Premium "Second Brain" Redesign

**Date:** 2026-06-19
**Status:** Approved design, ready for implementation plan
**Scope:** Direction A — premium redesign of `/brain` with deep source connections and Obsidian-style second-brain mechanics. Single page; no changes to other routes except one small additive query-param on `/library`.

## Context

The Brain tab (`src/app/brain/`) is Arc's durable marketing memory: a graph of `knowledge_nodes` + `knowledge_edges`. The backend is already well-connected:

- **Brand → Brain:** `learnBrandKnowledgeFromAsset` (`src/lib/brand-knowledge/brain-sync.ts`) creates nodes from approved brand assets (`ref_table: "media_assets"`), gated through the approval queue.
- **Arc → Brain:** `src/lib/arc-api/brain.ts` + the Cloud Run runner's brain tools read/write/query/export the graph. Recall is real: `getRecallMemory` (`src/lib/knowledge-graph/recall.ts`) pulls trusted/observed nodes each turn, enriched with relationship lines via `traverseFrom`/`enrichRecall` (`src/domain/brain-recall.ts`).
- **CRM/Library/Campaigns → Brain:** nodes carry `ref_table`/`ref_id`; edges connect facts to campaign/persona/segment nodes.

The gap is **presentation**: the page shows "Source" as plain text, has no provenance, no deep-links to the originating record, no backlinks UI, and reads visually flat. The user's north star: **feel premium like Obsidian, and operate as a genuine second brain for Arc.**

## Goals

1. Make every fact **traceable** — provenance badge + a deep-link to its real source (Brand asset, CRM record, Library media, Campaign, or the Arc run that learned it).
2. Make the connections **visible and filterable** — a source-filter bar (Brand / CRM / Library / Campaigns / Arc inference) with live counts.
3. **Obsidian-grade feel** — graph-view hero with local-neighborhood focus, an explorer rail, ⌘K quick switcher, and a "note" panel with **linked references (backlinks)** and outgoing links.
4. **Second-brain layer** — a live "What Arc recalls here" preview (from the real recall engine) on the selected fact.
5. Premium polish consistent with `DESIGN.md` (obsidian + gold, serif fact titles, calm/dense, no neon).

## Non-Goals (explicitly out of scope for this spec)

- **Direction B** (embedding "what the Brain knows" panels on Brand/CRM/Library pages) — a fast-follow.
- **Per-reply node-level usage logging** ("Arc used these 4 facts in this draft"). There is no table that records which `knowledge_nodes` a given Arc reply recalled (`cite_sources` logs CRM/campaign records, not brain nodes, and `getRecallMemory` is computed live, not persisted). This is documented below as a future addition; we will **not fake it** in the UI.

## Current State (files)

- `src/app/brain/page.tsx` — server component; loads graph/proposed/all/summary; renders `PageHeader`, `StatStrip`, `BrainWorkspace`, `RecentlyLearned`, `ApprovalQueue`, `BrainBrowser`.
- `src/app/brain/_components/brain-workspace.tsx` — client; category rail · Cytoscape graph · selected-node detail. **This is the primary file changed.**
- `src/app/brain/_components/brain-graph-cytoscape.tsx` — Cytoscape renderer (takes `selectedId`/`onSelect`).
- `src/app/brain/_components/{recently-learned,approval-queue,brain-browser}.tsx` — supporting panels.
- `src/lib/knowledge-graph/{read-model,graph}.ts` — `BrainNode`/`BrainEdge` types and reads. `BrainNode` already exposes `source`, `createdBy`, `refTable`, `refId`, `confidence`, `tags`, `persona`, `summary`, `body`.

## Design

### 1. Source + provenance model (pure helper)

Add a pure module `src/domain/brain-provenance.ts` (re-exported via `src/domain/index.ts`), unit-tested, that derives two things from an existing `BrainNode` — **no new DB columns**:

```ts
type BrainSourceSystem = "brand" | "crm" | "library" | "campaign" | "arc" | "human";

type NodeProvenance = {
  system: BrainSourceSystem;     // for the filter bar + dot color
  label: string;                  // e.g. "Library asset", "CRM · Lead", "Arc inference"
  learnedBy: "arc" | "brand_sync" | "human";
  deepLink: { href: string; label: string } | null; // resolved target route
};
```

Derivation rules (from real fields):
- `ref_table` in the CRM set (`companies|contacts|leads|properties|jobs|outcomes`) → `system: "crm"`, `href: /crm/{table}/{id}`.
- `ref_table === "campaigns"` → `system: "campaign"`, `href: /campaigns/{id}`.
- `ref_table === "media_assets"` → `system: "library"` (label "Brand asset" when `tags` include `brand-source`), `href: /library?asset={id}`.
- else (`ref_table` null) → `system: "arc"` if `created_by === "arc"`, else `"human"`; `deepLink: null`.
- `learnedBy`: `brand_sync` when `source === "brand_source_ingestion"`; else `arc` when `created_by === "arc"`; else `human`.

A single source-of-truth color map (`SOURCE_DOT`) keyed by `BrainSourceSystem`, shared across the filter bar, graph legend, node dots, and recently-learned list (kills the current duplicate ad-hoc color maps).

### 2. Source-filter bar

New `src/app/brain/_components/brain-source-filter.tsx` (client). A horizontal row of pill toggles: `All`, then one per `BrainSourceSystem` with a color dot + live count (derived from the loaded nodes via the provenance helper). Selecting a pill filters the graph, explorer, recently-learned, and browser to that source. State lives in `BrainWorkspace` (lifted) so all child panels react. Built from the `StatusPill`/`TabNav` vocabulary, not hand-rolled.

### 3. The "note" panel (centerpiece) — `brain-note-panel.tsx`

Replaces the right-hand detail column in `brain-workspace.tsx`. For the selected node:

- **Header:** kind eyebrow + trust pill (with confidence %), serif fact title.
- **Properties block (provenance):** Source (dot + `provenance.label`), Learned by (`Arc · run #… · {ago}` / `Brand sync` / `Human`), Confidence. Run reference shown as text; link to the run only if a run route exists, else plain text.
- **Deep-link CTA:** when `provenance.deepLink` is set, a gold-hairline button "Open in {Library|CRM|Campaign} ↗" → `href`. Hidden for Arc-inference/human nodes.
- **↩ Linked references (backlinks):** incoming edges (`toNodeId === selected.id`), each row = neighbor label + relation, color-dotted by neighbor's source, click to select. Count in the header.
- **→ Links:** outgoing edges (`fromNodeId === selected.id`), same treatment. (Current code merges both; split them.)
- **⟡ What Arc recalls here:** compute client-side from the in-memory graph using `traverseFrom`/`enrichRecall` (pure domain fns) seeded on the selected node; render the relationship lines Arc would pull. Subtle gold radial wash, monospace lines. Empty-safe.
- **Tags** row.

### 4. Graph hero — local-neighborhood focus

In `brain-graph-cytoscape.tsx`: on selection, add a `faded` class to non-neighbor nodes/edges (1–2 hop neighborhood stays full-opacity), Obsidian-style. Selected node gets a trust-toned halo. Keep token theming; respect `prefers-reduced-motion` (opacity only, short transition). Legend stays in the panel header but switches to the shared `SOURCE_DOT` semantics alongside trust tiers.

### 5. Explorer rail — file-tree feel

Enhance the existing category rail in `brain-workspace.tsx` into a calm explorer: "All knowledge" at top, then kind groups with counts, collapsible, active state. Selecting a group focuses the graph on that kind (filter) rather than jumping to one representative node (current behavior is a bit arbitrary). Honor the source filter.

### 6. Quick switcher (⌘K)

New `brain-quick-switcher.tsx` using the app's `cmdk` (per `DESIGN.md` §4.1, cmdk owns command/search). ⌘K / Ctrl+K opens a fuzzy "jump to any fact" over loaded node labels; Enter selects it in the workspace. Keyboard-first, reduced-motion safe.

### 7. Supporting panels

- `recently-learned.tsx`: adopt the shared `SOURCE_DOT` + show a small provenance chip per row; respect the source filter.
- `approval-queue.tsx`: keep behavior; light polish to match.
- `brain-browser.tsx`: convert the list to the shared `DataTable` with a source column + provenance chip and the deep-link; respect the source filter.

### 8. `/library?asset=<id>` deep-link target (small additive change)

The library detail drawer is client-state only (`selectedId` in `asset-grid.tsx`). Add read of a `?asset=<id>` search param on mount to open the drawer for that asset, so Brain's Library deep-links land precisely. Purely additive; no behavior change when the param is absent.

## Data / API

- **No new tables or columns** required for the in-scope work. Everything derives from existing `BrainNode`/`BrainEdge` fields and the existing recall domain fns.
- **Future (documented, not built):** node-level recall logging to power "Arc used these N facts in this reply." Sketch: a `knowledge_recall_log` table (`org_id, run_id, node_id, message_hash, created_at`) written by the runner when `getRecallMemory` selects nodes, read back as a "Used by Arc" facet. Out of scope here.

## Components — add / change summary

**Add:** `src/domain/brain-provenance.ts` (+ `__tests__/brain-provenance.test.ts`); `brain-source-filter.tsx`, `brain-note-panel.tsx`, `brain-quick-switcher.tsx` under `src/app/brain/_components/`.
**Change:** `brain-workspace.tsx` (lift source-filter state, swap in note panel, explorer rail, neighborhood focus wiring, quick switcher), `brain-graph-cytoscape.tsx` (neighborhood fade + halo + shared colors), `recently-learned.tsx`, `brain-browser.tsx`, `page.tsx` (pass edges to panels that need recall/backlinks; shared color import), `src/domain/index.ts` (re-export), `src/app/library/_components/asset-grid.tsx` (read `?asset=`).

## Testing

- Unit: `brain-provenance.ts` — every derivation branch (each CRM table, campaigns, media_assets w/ + w/o `brand-source` tag, arc-inference, human; `learnedBy` branches; deep-link hrefs).
- Unit: recall-preview helper wiring (selected seed → expected related lines) reusing existing `traverseFrom`/`enrichRecall` tests as the base.
- Component/interaction: source-filter toggles filter all panels; selecting a node populates backlinks/outgoing correctly from edges; deep-link hidden for arc/human nodes.
- Lint scoped to changed files; `pnpm build`/tsc for the typed Supabase enums and RSC server→client prop boundaries (no functions passed to client components).
- Graceful degradation: Supabase-unconfigured demo brain still renders (provenance derives from demo nodes); empty states intact.

## Risks / Notes

- **Demo data:** `src/lib/knowledge-graph/demo.ts` nodes should exercise multiple source systems so the filter bar and provenance read well locally; extend demo nodes/edges if coverage is thin.
- **RSC boundary:** `page.tsx` is a server component; the note panel's recall preview uses pure domain fns imported into a client component — fine (no I/O), but don't pass server-only functions across the boundary.
- **Color discipline:** introduce exactly one `SOURCE_DOT` map; do not reintroduce per-file color maps (current `recently-learned` vs `brain-workspace` divergence is the bug to fix).
- Keep all outbound-safe: this is read/inspect UI plus the existing approve/reject queue; no new outbound actions.
