# Marketing Brain — Knowledge Graph (v1)

**Date:** 2026-06-12
**Status:** Approved design, ready for implementation plan
**Feature dir:** `knowledge-graph`

## Summary

A property-graph overlay that serves as Arc's durable **marketing brain**: a
store where *anything* is a node (brand fact, persona, segment, proof point, asset,
learning, signal) and *any* relationship is a typed edge. It holds brand knowledge,
marketing information, and the relationships connecting everything — and it links to,
rather than duplicates, the existing CRM/campaign records.

It sits alongside the planned in-app CRM. The CRM (and existing typed tables) remain the
system of record for their entities; the brain *references* those rows and adds the
brand/marketing knowledge and cross-cutting relationships that have no home today.

### Why a generic overlay (not typed tables per kind)

The app already has many typed tables with foreign-key links (6-object CRM,
`persona_snapshots`, `engagement_events`, `persona_knowledge_entries`, campaigns). What's
missing is a single, writable, "anything links to anything" memory with one clean
read/write surface for Arc and native support for a trust/approval lifecycle. A generic
`knowledge_nodes` + `knowledge_edges` overlay gives exactly that, keeps the Arc write
API from fragmenting across many types, and makes a future graph-view UI trivial. Nodes
reference existing typed rows via `ref_table` + `ref_id`, so we get linkage without
copying or losing the typed tables' integrity.

## Core principle alignment

Honors the non-negotiable "agent does the work, human approves decisions" rule via a
**tiered trust model**. Arc thinks and records freely; knowledge that governs *outbound*
voice is gated behind operator approval before it is "trusted." Nothing here sends,
publishes, or contacts anyone — it is internal memory.

## Trust model

`trust_tier` lifecycle (DB enum): `observed` → `proposed` → `trusted`, with terminal
`rejected` and `archived`.

- The domain owns `GATED_NODE_KINDS`. **v1 set:** `brand_fact`, `messaging_angle`, `cta`,
  `proof_point` — the kinds whose content can govern outbound copy.
- **Operator-created** nodes/edges enter at `trusted`.
- **Arc + non-gated kind** (e.g. `persona`, `segment`, `service`, `learning`, `signal`,
  CRM-link edges) enters at `observed` — usable internally, flagged as Arc-asserted and
  not operator-verified.
- **Arc + gated kind** enters at `proposed` — lands in the operator approval queue. The
  **server forces this tier**; Arc cannot self-approve a gated node.
- **Approve**: `proposed` → `trusted`, stamps `approved_by` / `approved_at`.
  **Reject**: `proposed` → `rejected`.

Only `trusted` gated nodes should be surfaced to outbound-governing contexts (campaign
briefs, approval cards). `observed`/`proposed` are visible to Arc's internal reasoning but
must be labeled as unverified.

## Schema (new timestamped migration under `supabase/migrations/`)

### `knowledge_nodes`

| column | type | notes |
| --- | --- | --- |
| `id` | uuid pk | `gen_random_uuid()` |
| `org_id` | uuid | tenancy, consistent with `crm_tenancy_and_interactions`; set via `getCurrentOrgId()` |
| `kind` | text not null | validated by app-layer allowlist (see Domain) |
| `key` | text null | optional stable slug for upsert/dedupe; unique per `(org_id, kind, key)` when present |
| `label` | text not null | display name / title; non-empty |
| `body` | text null | the fact/content |
| `summary` | text null | short form |
| `persona` | `public.persona_mapping` null | set when the node is persona-specific; `<> 'unassigned_persona'` |
| `trust_tier` | `public.knowledge_trust_tier` not null default `'observed'` | enum |
| `confidence` | integer null | `between 0 and 100` |
| `ref_table` | text null | e.g. `companies`, `contacts`, `leads`, `campaigns`, `campaign_assets`; allowlisted in app |
| `ref_id` | uuid null | the referenced typed row |
| `source` | text null | `arc` / `operator` / `import` / `performance` |
| `source_reference` | text null | url / run id / event id |
| `created_by` | text null | `arc` / `operator` |
| `approved_by` | text null | |
| `approved_at` | timestamptz null | |
| `tags` | text[] not null default `'{}'` | |
| `props` | jsonb not null default `'{}'` | |
| `created_at` / `updated_at` | timestamptz not null default `now()` | `updated_at` trigger |

Constraints:
- `ref` pair both-or-neither: `(ref_table is null) = (ref_id is null)`.
- Gated-trust check: a `trusted` node whose `kind` is in the gated set must have
  `approved_by is not null`. (Gated set is small + stable enough to encode in SQL; keep it
  in sync with the domain constant — documented in the migration.)
- `persona <> 'unassigned_persona'` when `persona` is not null.

### `knowledge_edges`

| column | type | notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `org_id` | uuid | tenancy |
| `from_node_id` | uuid not null | FK → `knowledge_nodes(id)` on delete cascade |
| `to_node_id` | uuid not null | FK → `knowledge_nodes(id)` on delete cascade |
| `relation` | text not null | typed relation label, app-allowlisted |
| `weight` | real null | strength/confidence of the link |
| `trust_tier` | `public.knowledge_trust_tier` not null default `'observed'` | |
| `source` | text null | |
| `created_by` | text null | |
| `approved_by` / `approved_at` | text / timestamptz null | |
| `props` | jsonb not null default `'{}'` | |
| `created_at` / `updated_at` | timestamptz | `updated_at` trigger |

Constraints: `from_node_id <> to_node_id`; unique `(from_node_id, relation, to_node_id)`.

### Enum, indexes, RLS

- New enum `public.knowledge_trust_tier` as `('observed','proposed','trusted','rejected','archived')`.
- Indexes: `knowledge_nodes(kind)`, `(trust_tier)`, `(persona)`, `(org_id)`,
  `(ref_table, ref_id)` where `ref_id is not null`, gin on `tags`; partial unique on
  `(org_id, kind, key)` where `key is not null`. `knowledge_edges(from_node_id)`,
  `(to_node_id)`, `(relation)`, `(org_id)`.
- `enable row level security` on both tables (service-role pattern, matching existing
  tables — no policies; the admin client bypasses RLS).
- `set_updated_at` triggers on both.

**Decision — `kind` and `relation` are text + app-layer allowlists, not DB enums.** This
matches the codebase philosophy that deterministic, vocabulary-defining logic is
app-owned and unit-testable rather than pushed into Postgres (cf. routing/scoring), and
lets Arc's vocabulary grow without an `ALTER TYPE` migration each time. `trust_tier` *is*
a DB enum: it is a small, stable lifecycle that earns the check-constraint integrity.

## Domain module — `src/domain/knowledge-graph.ts` (pure, no I/O)

Exports (re-exported through `src/domain/index.ts`):

- Types: `NodeKind`, `EdgeRelation`, `TrustTier`, `KnowledgeNodeInput`, `KnowledgeEdgeInput`.
- Allowlists: `NODE_KINDS`, `EDGE_RELATIONS` (each relation may carry from/to kind hints),
  `GATED_NODE_KINDS`, `REFERENCEABLE_TABLES`.
- `isGatedKind(kind): boolean`.
- `resolveInitialTrustTier({ kind, createdBy }): TrustTier` — operator ⇒ `trusted`;
  arc + gated ⇒ `proposed`; arc + non-gated ⇒ `observed`.
- `validateNodeInput(input): { ok: true; value } | { ok: false; code; message }` — kind in
  allowlist, label non-empty, `ref_table`/`ref_id` both-or-neither and table allowlisted,
  persona present-or-absent as the kind requires, confidence in range.
- `validateEdgeInput(input, fromKind?, toKind?)` — relation allowlisted, `from <> to`,
  optional kind-compatibility against the relation's hints.
- `applyApproval(node, approver)` / `applyRejection(node, decider)` — guards that the node
  is currently `proposed`; returns the transitioned node (sets tier + approval stamps).

`NODE_KINDS` (v1): `brand_fact`, `persona`, `segment`, `service`, `proof_point`,
`messaging_angle`, `cta`, `asset_ref`, `learning`, `signal`, `crm_ref`, `campaign_ref`,
`other`.

`EDGE_RELATIONS` (v1, starter): `responds_to`, `governs`, `proves`, `targets`, `relates_to`,
`learned_from`, `used_in`, `belongs_to`, `competes_with`. (Extensible.)

Unit tests in `src/domain/__tests__/knowledge-graph.test.ts` covering validation, trust
resolution per (kind, createdBy), and approval/rejection transitions including the
self-approve guard.

## Persistence + read-model — `src/lib/knowledge-graph/`

Follows the vault/campaigns reference shape. All write paths run domain validation first,
guard on `isSupabaseAdminConfigured()`, and are org-scoped via `getCurrentOrgId()`
(`src/lib/auth/org.ts`). Reads use the `supabaseFetch` AbortError fallback so an
unreachable Supabase degrades to an "unavailable" result instead of hanging
(per the known slow-load fix).

- `persistence.ts`: `createNode`, `upsertNodeByKey`, `updateNode`, `approveNode`,
  `rejectNode`, `archiveNode`, `createEdge`, `approveEdge`, `archiveEdge`. The Arc-facing
  create paths set the initial tier via `resolveInitialTrustTier` and never accept a
  caller-supplied `trusted` for gated kinds.
- `read-model.ts`: `listNodes(filters: { kind?, trustTier?, persona?, refTable?, refId?, search? })`,
  `getNode(id)` returning the node plus its edges and neighbor nodes, `listProposed()`
  (the approval queue), `brainSummary()` (counts by kind and by tier), and
  `graphForNode(id, depth)` (neighbor expansion — used now for the node-detail view and
  later for the visual graph / Arc context payloads).

## Arc API (bearer-gated)

New routes under `src/app/api/v1/arc/brain/`, mirroring the existing
`src/lib/arc-api/` (`drafts.ts`, `approvals.ts`) + route pattern. Logic lives in
`src/lib/arc-api/brain.ts`, contract-tested in `src/lib/arc-api/__tests__/brain.test.ts`.

- `POST /api/v1/arc/brain/nodes` — create/upsert a node. Gated kinds are forced to
  `proposed`; Arc cannot self-approve.
- `POST /api/v1/arc/brain/edges` — link two nodes.
- `POST /api/v1/arc/brain/query` — read the brain by kind/persona/ref/search for
  reasoning context (returns nodes + edges; can filter by tier).

All gated by `checkBearerToken(request, "ARC_AGENT_API_TOKEN")`. Response codes:
`503 not_configured` when Supabase admin is unset, `400` on validation failure, `201` on
persisted, `200` on query. Writes use the server-side admin client, so no PostgREST data-API
role grant is required.

## Operator UI — `/brain` (v1: curation list + approval; no visual graph)

- Add a top-level nav entry **Brain → `/brain`** in `src/app/_data/growth-engine.ts`
  `navItems`. (Arc stays at `/agent-operations`.)
- Server component page built from existing primitives in
  `src/app/_components/page-header.tsx` (`PageHeader`, `Panel`, `StatusPill`,
  `EmptyState`, `OperatorBar`), DESIGN.md-compliant (Command Charcoal / Canvas White /
  Restoration Red; no emojis; no equal 3-column rows).
- Sections:
  1. **Approval queue** — Arc's `proposed` nodes/edges. Each card shows kind, label, body,
     persona, source, and any linked CRM/campaign refs, with **Approve** / **Reject**
     (and edit-body-before-approve) controls.
  2. **Brain browser** — filter nodes by kind / trust tier / persona / free-text search;
     a node-detail view lists the node's edges and neighbors (textual, not a visual
     graph). Operator can add/edit nodes and draw edges manually.
  3. **Summary strip** — counts by kind and by trust tier.
- `src/app/brain/actions.ts` (`"use server"`): `approveNodeAction`, `rejectNodeAction`,
  `createNodeAction`, `updateNodeAction`, `archiveNodeAction`, `createEdgeAction` — each
  gated by `requireOperator()` + `isSupabaseAdminConfigured()`, persisting through
  `src/lib/knowledge-graph/` and calling `revalidatePath('/brain')`.
- Colocated `src/app/brain/_components/` for the queue card, node list/filters, and node
  detail.

## Seed — `pnpm seed:brain`

A script (registered in `package.json`, matching `seed:arc-demo` / `seed:test-campaign`)
that loads the 12 official personas as `persona` nodes plus a small starter set of BSR
`brand_fact` nodes at `trusted`, and a few illustrative edges (e.g. a brand fact
`governs` a persona's `cta`). Keeps the page and Arc's memory non-empty for first run.

## Testing

- Domain: exhaustive pure unit tests (validation, trust resolution, transitions).
- Lib: persistence + read-model tests using the existing Supabase client test-helper
  pattern (cf. `src/lib/persona-intelligence/__tests__`).
- API: contract tests for the three brain routes (auth, status codes, forced `proposed`
  on gated kinds).

## Out of scope for v1 (YAGNI)

- Visual node-link graph view (zoom/pan/click) — phase 2; the read-model's
  `graphForNode` is built now to make it cheap later.
- Vector/embedding semantic search (pgvector) — v1 uses text/`ilike` + kind/persona filters.
- Auto-deriving edges from existing foreign keys — a later importer.
- Any Higgsfield / external asset enrichment — stays operationally off.

## Deployment notes

- New migration is timestamped and additive; it must be applied to the production Supabase
  DB manually (prod migrations are not auto-applied by the Vercel deploy).
- No data-API role grant needed: Arc writes go through the bearer-gated route using the
  service-role admin client.
