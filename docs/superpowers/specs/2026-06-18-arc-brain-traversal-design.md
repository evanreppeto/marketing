# Arc Brain Graph Traversal → Recall Enrichment — Design

**Date:** 2026-06-18
**Status:** Approved (design) — pending spec review
**Sub-project of:** Arc "second brain" (3a of 3 — graph depth, traversal half)

## Problem

Arc writes `knowledge_edges` (`proves`, `governs`, `targets`, `relates_to`, …) via
`link_brain_nodes`, but nothing ever **reads** them for reasoning. The only graph
reads are `getNode` (1-hop neighbors for the node page) and `getBrainGraph` (bulk
export for the visualization). The SP2 recall memory block surfaces *isolated*
facts/learnings with no sense of how they connect. The edges are effectively
write-only data.

This sub-project makes the edges **drive Arc's context**: each top recalled node
brings its strongest multi-hop connections into the memory block, so Arc reasons
over relationships, not just isolated nodes.

## Decomposition (context)

The "second brain" effort:
1. **Brand Learning & Brand-Kit wiring** — shipped (merged 2026-06-18).
2. **Cross-Chat Recall** — shipped (merged 2026-06-18). Established the recall
   memory block this sub-project enriches.
3. **Brain Graph Depth** — two independent subsystems:
   - **3a. Multi-hop traversal → recall enrichment** *(this spec)* — read the
     edges, enrich recall. Existing schema, no new infra.
   - **3b. Semantic / embedding retrieval** — pgvector + embeddings (net-new
     infra). Separate future project; out of scope here.

## Goal & success criteria

- The SP2 recall memory block gains relationship context: the top recalled nodes
  each show their strongest connections as relation lines.
- Success: a recalled learning renders e.g. `—proves→ 24/7 response (proof_point)`
  beneath it, so Arc sees how recalled facts connect.
- Genuine multi-hop (depth 2 default), beyond the 1-hop `getNode` already does,
  but tightly bounded for prompt fit.

## What's reused (do NOT rebuild)

- `getBrainGraph(filters, client?, orgId?)` (`src/lib/knowledge-graph/graph.ts`) —
  returns `{ status, nodes: BrainNode[], edges: BrainEdge[], truncated }`, bounded
  (≤2000 nodes / 5000 edges). Accepts `trustTiers` filter (passing it dodges the
  empty-brain demo fallback). `BrainEdge` = `{ id, fromNodeId, toNodeId, relation,
  weight, trustTier }`.
- SP2: `src/domain/brain-recall.ts` (`rankRecall`, `RecallCandidate`, `RecallItem`),
  `src/lib/knowledge-graph/recall.ts` (`getRecallMemory`), runner `recall.ts` +
  `memoryBlock` in `context.ts`, `POST /api/v1/arc/brain/recall`.

## Substrate decision

In-memory BFS over `getBrainGraph`, not recursive SQL. The brain is small (the
viz already loads the full graph), one bounded fetch yields nodes + edges, and
pure traversal is fully unit-testable with no prod-migration/SQL risk.
`getRecallMemory` switches its fetch from per-tier `listNodes` to
`getBrainGraph({ trustTiers: ["trusted", "observed"] })` — same trust filtering
and demo-safety, but now with edges.

## Architecture

### a. Pure domain — `src/domain/brain-recall.ts` (extended)

- **Extract `selectRecall(candidates, message, opts): RecallCandidate[]`** — the
  existing SP2 core + keyword selection logic, returning the selected *candidates*
  (with ids) rather than mapped items. `rankRecall` is redefined as a thin wrapper
  — `selectRecall(...).map(toRecallItem)` — so its existing tests and contract
  (`RecallItem[]`) keep passing unchanged.
- **`traverseFrom(seedIds, edges, opts): Map<string, Connection[]>`** — true
  multi-hop BFS from each seed over the edge list. Undirected reachability
  (follows an edge regardless of direction) with a visited-set (cycle-safe).
  Bounded by `depth` (default 2) and `maxPerSeed` (default 4). `Connection =
  { nodeId: string; relation: string; direction: "out" | "in"; hops: number }`
  where `direction` records whether the seed was the edge's `from` (out) or `to`
  (in) on the first hop, so the rendered relation reads correctly.
- **`enrichRecall(selected, graph, opts): RecallItem[]`** — for the top
  `enrichLimit` (default 5) selected candidates, look up traversal connections,
  resolve neighbor node ids to labels/kinds via the graph's node map, and build
  `related: string[]` lines (`"—{relation}→ {label} ({kind})"` for `out`,
  `"←{relation}— {label} ({kind})"` for `in`), capped at `relationsPerNode`
  (default 3). Returns `RecallItem[]`. `RecallItem` gains optional
  `related?: string[]`.

### b. I/O — `src/lib/knowledge-graph/recall.ts` (rewired)

`getRecallMemory(orgId, message, client?)`:
1. `getBrainGraph({ trustTiers: ["trusted", "observed"] }, client, orgId)`; if
   `status !== "live"` → `[]`.
2. Map `nodes` → `RecallCandidate[]` (trusted-first ordering preserved by sorting
   trusted before observed, since `getBrainGraph` mixes tiers).
3. `selected = selectRecall(candidates, message)`.
4. `return enrichRecall(selected, { nodes, edges }, {})`.

### c. Runner — `apps/arc-runner/src/context.ts` (memoryBlock extended)

`memoryBlock` renders each item's `related` as indented sub-lines under its main
line:
```
- <label> — <summary> · <kind>
    <related[0]>
    <related[1]>
```
Absent/empty `related` → just the main line (SP2 behavior unchanged). The route,
`resolveRecallMemory`, and the runner's `RecallItem` type gain the optional
`related?: string[]` field (additive, backward-compatible).

## Data flow

```
Recall turn → getRecallMemory
  → getBrainGraph({trustTiers:[trusted,observed]})  (nodes + edges, demo-safe)
  → selectRecall(candidates, message)               (SP2 core + keyword)
  → enrichRecall(selected, {nodes,edges})           (BFS depth-2, bounded, relation lines)
  → RecallItem[] with `related`
  → memoryBlock renders nodes + connection sub-lines
```

## Safety & bounds

- **Trusted + observed only** — proposed/rejected/archived are never fetched or
  traversed (consistent with recall's approval gate).
- Depth, per-seed, enrich-limit, and per-node caps → bounded prompt size; visited
  set → cycle-safe.
- Demo-safe via the `trustTiers` filter on `getBrainGraph`.
- Traversal failure / empty edges → plain recall with no `related` lines; a turn
  never breaks (`getRecallMemory` already `[]`-falls-back on unavailable;
  `resolveRecallMemory` `[]`-falls-back on fetch error).
- Read-only context, not a tool; available in all modes.

## Testing

- **Domain:** `traverseFrom` — 2-hop reachability, cycle safety, `depth` and
  `maxPerSeed` caps, direction labels (out/in); `enrichRecall` — only top
  `enrichLimit` seeds enriched, relation-line formatting, `relationsPerNode` cap,
  nodes with no edges get no `related`; `selectRecall`/`rankRecall` parity (SP2
  tests stay green).
- **Lib:** `getRecallMemory` uses `getBrainGraph` (not `listNodes`), attaches
  `related` from edges, stays trusted+observed, `[]` on unavailable.
- **Runner:** `memoryBlock` renders `related` sub-lines and omits cleanly when
  absent; existing `context` tests stay green.

## Out of scope (fast-follows)

- On-demand `explore_graph` Arc tool (deliberate traversal during reasoning).
- Semantic / embedding retrieval (**SP3b**).
- Edge-`weight`-based ranking of which connections to surface.
- Multi-relation path explanations (we surface one relation hop label per
  connection, not full path narratives).
