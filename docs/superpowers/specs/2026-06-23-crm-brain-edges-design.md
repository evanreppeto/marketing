# CRM → Brain Edges (Slice 2)

**Date:** 2026-06-23
**Status:** Draft for review
**Builds on:** Slice 1 (`docs/superpowers/specs/2026-06-23-crm-brain-ingestion-design.md`, PR #218). Stacked on branch `claude/crm-brain-ingestion`.

## Problem

Slice 1 mirrors each CRM record into a Brain **node**, but the nodes are
disconnected. The Brain's value (and Arc's graph-traversal recall in
`getRecallMemory`) comes from edges. The CRM already encodes the relationships as
foreign keys (a lead's `company_id`, a job's `lead_id`, …). This slice turns those
FKs into `knowledge_edges` between the reference nodes.

## Goal

When a CRM record syncs to the Brain, also create edges from its node to the nodes
of the records it references via FK. Backfill connects everything already ingested.
Idempotent; no duplicate edges; best-effort (never breaks a CRM save).

**Out of scope:** `targets → persona` edges (needs persona *nodes*, slice 3),
edge embeddings, and any new edge relations beyond the existing `EDGE_RELATIONS`.

## Design

### 1. Pure domain — `buildEdgeIntentsForCrmRow(table, row)` (extends `src/domain/brain-ingestion.ts`)

Returns `EdgeIntent[]` where `EdgeIntent = { toTable: ReferenceableTable; toId: string; relation: EdgeRelation }`,
derived from the row's FK columns. Only emits an intent when the FK is a non-empty
string. Mapping (relations chosen from the existing `EDGE_RELATIONS`):

| from row | FK column | → toTable | relation |
|---|---|---|---|
| contacts | `company_id` | companies | `belongs_to` |
| properties | `company_id` | companies | `belongs_to` |
| properties | `contact_id` | contacts | `relates_to` |
| leads | `company_id` | companies | `belongs_to` |
| leads | `contact_id` | contacts | `belongs_to` |
| leads | `property_id` | properties | `relates_to` |
| leads | `attributed_campaign_id` | campaigns | `responds_to` |
| jobs | `lead_id` | leads | `relates_to` |
| jobs | `company_id` | companies | `belongs_to` |
| jobs | `property_id` | properties | `relates_to` |
| outcomes | `job_id` | jobs | `relates_to` |
| outcomes | `lead_id` | leads | `relates_to` |
| companies | — | — | (root; no outgoing edges) |

Pure and unit-tested (correct intents per table, empty/missing FKs omitted, no
intent for a self/blank id).

### 2. Endpoint resolution by ref (not key)

An edge needs two `knowledge_nodes` ids. The *from* node id is the node slice-1's
`upsertReferenceNode` just returned. The *to* node id is resolved by **`(org_id,
ref_table, ref_id)`** — using `ref_table = toTable`, `ref_id = toId` — against the
existing `knowledge_nodes_ref_idx`. Resolving by ref (not by `key`) means it also
finds `campaign_ref` nodes (whose key scheme differs), so the lead→campaign edge
works when a campaign node exists. If no node is found, the edge is **skipped**
(best-effort) — the backfill's second pass and future re-syncs backstop it.

### 3. Idempotent edge write — `createEdgeIfAbsent` (in `knowledge-graph/persistence.ts`)

No migration. Before inserting, select any existing edge with the same
`(org_id, from_node_id, to_node_id, relation)`; if present, return it; else call the
existing `createEdge` (authored `arc` → trust tier `observed`). This keeps re-syncs
duplicate-free without a `knowledge_edges` unique index (which would require a manual
prod migration — see `[[vercel-deploy]]`).

### 4. Lib orchestration — extends `src/lib/brain-ingestion/sync.ts`

- `syncEdgesForCrmRow(table, fromNodeId, row, deps)`: for each `buildEdgeIntentsForCrmRow`
  intent, resolve the to-node by ref; if found, `createEdgeIfAbsent`. Tally created/skipped.
- `syncCrmRowToBrain` now: upsert the node (slice 1) → then `syncEdgesForCrmRow` with the
  returned node id. Edge failures never fail the node write.
- `resyncCrmIntoBrain` becomes **two passes**: pass 1 upserts all nodes (so every endpoint
  exists), pass 2 builds edges for every row. Return shape extends to
  `{ ok, syncedNodes, syncedEdges, errors, truncated }`. The operator button message
  reflects both counts.

### 5. Data flow

```
sync a CRM row
  ├─ upsertReferenceNode(node)               → fromNodeId        [slice 1]
  └─ for intent of buildEdgeIntentsForCrmRow(table,row):
       toNodeId = node where (org_id, ref_table=intent.toTable, ref_id=intent.toId)
       if toNodeId: createEdgeIfAbsent(fromNodeId → toNodeId, intent.relation)   [best-effort]

backfill: pass 1 all nodes → pass 2 all edges (endpoints guaranteed to exist)
recall (getRecallMemory): graph traversal now follows the new edges
```

## Testing

- **Domain:** `buildEdgeIntentsForCrmRow` — correct intents/relations per table; missing/blank
  FKs omitted; companies → no intents; a lead with all FKs → 4 intents.
- **Persistence:** `createEdgeIfAbsent` — inserts when absent, no-ops (returns existing) when the
  `(org,from,to,relation)` 4-tuple already exists; mocked Supabase mirror of `persistence.test.ts`.
- **Lib:** `syncEdgesForCrmRow` resolves to-node by ref and skips when the endpoint node is
  missing; `resyncCrmIntoBrain` two-pass tallies nodes then edges. Mocked client + mocked
  `buildEdgeIntentsForCrmRow`/resolution.
- `pnpm test`, scoped eslint, `tsc --noEmit`.

## Notes / risks

- **Org scoping:** every node-resolution and edge write carries `org_id`; an edge can only
  connect two nodes in the same org (resolution is org-scoped, and `createEdge` stamps `org_id`).
- **Ordering in live sync:** FKs point to parents created earlier (a lead's company exists before
  the lead), so most edges resolve on first sync; the backfill's pass-2 guarantees completeness.
- **Edge direction:** child → parent (`lead belongs_to company`), matching how `getRecallMemory`
  enriches with relationship lines. Traversal is direction-aware; if recall needs the inverse, that's
  a recall concern, not an ingestion one.
- **No new relations / no migration:** uses only existing `EDGE_RELATIONS` and the existing schema.

## Open questions for review
1. Edge breadth: the table above links **direct FKs only** (e.g. `outcome → job` and `outcome → lead`,
   but not `outcome → company`). Assumed: direct FKs only — traversal handles transitivity. Flag if
   you want the fuller fan-out.
2. `relates_to` vs `belongs_to` for lineage (job→lead, outcome→job): assumed `relates_to` (lineage,
   not ownership). Easy to flip.
