# Marketing Brain — Graph View + graph.json Export (2A)

**Date:** 2026-06-14
**Status:** Approved design, ready for implementation plan
**Builds on:** `2026-06-12-marketing-brain-knowledge-graph-design.md` (the node/edge data layer, trust model, Hermes API, and `/brain` approval/browse UI already shipped).

## Summary

Add the Graphify-style **interactive visual graph** to the Marketing Brain, plus a
portable **`graph.json` export**. The data substrate (`knowledge_nodes` + `knowledge_edges`
with typed relations, trust tiers, CRM references) already exists; this project adds the
visualization and export on top. It does NOT add ingestion — auto-extraction is project 2B.

Reference: Graphify (graphify.net) renders a repo's knowledge graph as an interactive
`graph.html` (search, filter, community navigation) plus a `graph.json` artifact an agent
can reason over. We mirror that experience over Mark's marketing knowledge.

## Scope

- **Full-graph read-model** — one call returning all org nodes + edges for the canvas/export.
- **`graph.json` export** — bearer-gated agent endpoint + operator client-side download.
- **Interactive canvas** — `react-force-graph-2d`, color-by-kind, trust-tier ring, click-to-inspect, search, filter.
- **`/brain` page** — graph as the hero; the approval queue (the safety gate) stays prominent.

Out of scope (→ 2B): auto-extraction/ingestion. The graph only visualizes and exports
what is already in the brain. No change to the trust model, the write paths, or the
approval flow.

## 1. Full-graph read-model — `src/lib/knowledge-graph/graph.ts`

```ts
export type BrainGraph = { nodes: BrainNode[]; edges: BrainEdge[]; truncated: boolean };

export async function getBrainGraph(
  filters?: { kinds?: string[]; trustTiers?: TrustTier[] },
  client?: TypedSupabaseClient,
  orgId?: string,
): Promise<{ status: "live" } & BrainGraph | { status: "unavailable"; message: string }>;
```

- Reuses `BrainNode`/`BrainEdge`/`mapNode`/`mapEdge` from `read-model.ts` (export the mappers
  or co-locate). Org-scoped; graceful degradation (returns `unavailable` on error/no-config).
- Caps: `NODE_CAP = 2000`, `EDGE_CAP = 5000`. If a cap is hit, set `truncated: true` and
  `log`/comment the drop (no silent truncation).
- By default excludes `archived`/`rejected` nodes unless explicitly requested via `trustTiers`.
- Edges are filtered to those whose **both** endpoints are in the returned node set (no
  dangling links — important for the canvas).
- Optional `filters.kinds` / `filters.trustTiers` apply `.in(...)` on the node query.
- Unit-tested with `createSupabaseQueryMock` (live mapping; unavailable on error; dangling-edge
  pruning; truncated flag).

## 2. `graph.json` export

**Portable shape** (force-graph / Graphify convention — drop-in for graph tools):
```json
{ "nodes": [{ "id", "kind", "label", "trustTier", "persona", "refTable", "refId" }],
  "links": [{ "source": "<fromNodeId>", "target": "<toNodeId>", "relation", "weight" }] }
```

- **Agent endpoint:** `GET /api/v1/hermes/brain/graph` — bearer-gated via the shared `guard`,
  returns `{ ok, status, nodes, links }`. Logic in `src/lib/hermes-api/brain.ts` as
  `markGraphExport(deps)` (calls `getBrainGraph` and maps edges → `links`). `503` when Supabase
  is unconfigured; `200` live. Contract-tested.
- **Operator download:** a "Download graph.json" button in the graph view serializes the
  already-loaded graph to a Blob client-side and triggers a download. No new endpoint, no auth
  wrinkle (the page is already operator-gated and has the data).

## 3. Interactive canvas — `src/app/brain/_components/brain-graph.tsx`

`"use client"`. `react-force-graph-2d` (browser-only) is loaded via `next/dynamic` with
`ssr: false` to avoid SSR/`window` errors.

- **Data:** props `{ nodes: BrainNode[]; edges: BrainEdge[] }`; transforms to force-graph
  `{ nodes, links }` (link `source`/`target` = node ids; React-Force-Graph mutates the data, so
  pass a memoized deep copy).
- **Encoding:**
  - Node **color by kind** (a `KIND_COLOR` map using on-brand tokens; brand_fact, persona,
    proof_point, learning, signal, cta, messaging_angle, segment, service, asset_ref, crm_ref,
    campaign_ref, other).
  - Trust tier as a **ring/stroke**: `trusted` solid, `proposed` amber dashed, `observed` faded
    fill, `rejected`/`archived` dimmed (and off by default per the read-model).
  - `nodeCanvasObject` draws the dot + a label when zoomed in / for the selected node.
  - Edge `linkLabel` = relation; link width scales with `weight`.
- **Interactions:**
  - Click a node → selects it; a **detail side panel** shows kind, body, persona, refs, and
    neighbors, with **Approve / Reject** inline when the node is `proposed` (calls the existing
    `approveNodeAction`/`rejectNodeAction`; on success the node's tier updates locally).
  - **Search** input → highlights/zooms matching nodes (by label, case-insensitive).
  - **Filter chips** → toggle kinds and trust tiers (client-side filtering of the in-memory
    graph; no refetch).
  - **Download graph.json** button (operator export).
- **Styling:** DESIGN.md tokens (charcoal canvas background, restoration-red accents, the
  ThemeTone palette); no neon. Empty state when there are no nodes.
- The canvas sizes to its container; uses a `ResizeObserver`/ref for width/height.

## 4. `/brain` page — `src/app/brain/page.tsx`

- Fetch the full graph (`getBrainGraph()`) alongside the existing `listProposed()` /
  `brainSummary()`.
- Layout: the **graph canvas is the hero**; the **approval queue stays prominent** (the gate
  is not buried). The existing browse list remains reachable (a section or a simple toggle).
- Resilient when Supabase is unconfigured/unavailable: render the empty/unavailable states,
  never crash.

## 5. Dependency

`react-force-graph-2d` (pulls `force-graph` + `d3-force`). Confirmed installing cleanly
against React 19.2.4 / Next 16. Added to `package.json` + `pnpm-lock.yaml`.

## Testing

- `graph.ts` read-model: live mapping, unavailable on error, dangling-edge pruning, truncated
  flag, kind/tier filters.
- `markGraphExport` contract test (auth, shape `{ nodes, links }`, 503 when unconfigured).
- UI: the canvas is hard to unit-test; cover the data-transform helper (edges → links, filter
  application) as a pure function if extracted, and verify the page builds and renders an
  empty state. `pnpm build` must pass (the dynamic `ssr:false` import must not break SSR).

## Out of scope for 2A (→ 2B: auto-extraction)

Mark/job reading CRM records, campaign results, and docs to auto-propose nodes/edges into the
brain. 2A only visualizes and exports the existing graph; the trust gate is unchanged.
