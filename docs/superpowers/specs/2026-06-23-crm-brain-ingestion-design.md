# CRM → Brain Ingestion (Slice 1)

**Date:** 2026-06-23
**Status:** Draft for review

## Problem

Adding a CRM record (company, contact, lead, property, job, outcome) does not put
anything into the Brain. The Brain (`knowledge_nodes` / `knowledge_edges`) is only
ever written by Arc inference (`markCreateNode`), brand-knowledge sync
(`learnBrandKnowledgeFromAsset`), and manual operator notes (`brain/actions.ts`).
CRM writes touch only the CRM tables, so the Brain stays empty of CRM content and
Arc cannot recall it.

This is the first slice of a larger vision: the Brain as Arc's working memory — a
single linked, vectorized knowledge layer over everything in the app, which Arc
searches semantically and uses to synthesize personas/audiences. The retrieval half
already exists (`embedding` column + HNSW index + `match_knowledge_nodes` RPC +
`getRecallMemory`). What is missing is the data flowing in. This slice fills the
Brain from the CRM.

## Goal

Creating or editing any of the six CRM objects creates/updates one matching Brain
node — embedded and semantically searchable. Records that already exist are
backfilled so the Brain fills immediately.

Explicitly **out of scope** (later slices):
- Auto-linking edges between nodes (lead→company, outcome→campaign) — Slice 2.
- Arc synthesizing personas/audiences as derived nodes — Slice 3.
- The "new workspace isn't empty" tenancy bug — separate fix (see Notes).
- Ingesting campaigns, brand, media, performance — later slices.

## Design

### 1. Ingestion module — `src/lib/brain-ingestion/`

A single entry point:

```ts
syncRecordToBrain(
  objectKey: CrmEntityKey,   // "companies" | "contacts" | "leads" | "properties" | "jobs" | "outcomes"
  recordId: string,
  deps?: { client?: TypedSupabaseClient; orgId?: string },
): Promise<WriteResult>
```

Responsibilities:
1. Read the record (org-scoped) for `objectKey`/`recordId`.
2. Build a deterministic **summary string** from its salient fields — the natural-
   language text that gets embedded. Example for a company:
   `"Company: Acme Property Group. Partner tier: gold. Persona: property_manager. Phone: …. Website: …"`.
   A per-object `describe<Object>()` pure function owns this. Empty/null fields are
   omitted.
3. Upsert a reference node (see §2) keyed to the record.
4. Re-embed only if the embed text changed (see §3).

The summary builders are pure and live in `src/domain/` (e.g.
`src/domain/brain-ingestion.ts`) so they are unit-testable without I/O. The I/O
(`syncRecordToBrain`) lives in `src/lib/brain-ingestion/`. This follows the
domain → lib → app layering.

**Node shape (one node per record):**
- `kind`: `crm_company` | `crm_contact` | `crm_lead` | `crm_property` | `crm_job` | `crm_outcome`
  (non-gated custom kinds; pass through `normalizeKind`).
- `key`: `"crm:" + objectKey + ":" + recordId` — the idempotency handle.
- `label`: human title (company name, contact full name/email, lead label, property address, …).
- `summary`: the embed text from step 2.
- `persona`: copied from the record when present (CRM objects carry `persona`).
- `ref_table` / `ref_id`: `objectKey` / `recordId` — provenance + Brain deeplinks
  (already understood by `brain-provenance.ts`, which deeplinks CRM refs to `/crm/<table>/<id>`).
- `source`: `"crm-sync"`. `created_by`: `"arc"` (system-authored, non-gated).
- `trust_tier`: resolves to `observed` for these non-gated, arc-authored kinds via the
  existing `resolveInitialTrustTier`. `observed` is included in `getRecallMemory` and the
  graph view, so Arc sees them. They are **not** approval-gated — they mirror data a
  human already entered; this is bookkeeping, not an Arc decision, so we stay
  approval-safe.

### 2. Idempotent upsert — `upsertReferenceNode()` in `knowledge-graph/persistence.ts`

No schema migration required. `knowledge_nodes` already has:

```sql
create unique index knowledge_nodes_org_kind_key_unique_idx
  on public.knowledge_nodes (org_id, kind, key) where key is not null;
```

`upsertReferenceNode(input, deps)`:
1. Look up the existing node by `(org_id, kind, key)`.
2. If absent → insert (reuse the `createNode` insert shape) and embed.
3. If present → update the mutable fields (`label`, `summary`, `persona`, `tags`,
   `props`, `ref_table`, `ref_id`); re-embed only when the embed text changed (§3).
   Trust tier is left untouched on update (an edit does not re-gate).

Implemented as an explicit select-then-insert/update rather than PostgREST
`upsert(onConflict)` so we can compute the "did embed text change?" decision and keep
the embedding write best-effort (a Gemini failure must never fail the CRM write).

### 3. Re-embed only when text changed

Store a short hash (e.g. of `label + "\n" + summary`) in `props.embed_hash` when
embedding. On update, compute the new hash; if it equals the stored one, skip the
Gemini call and the embedding write. New nodes always embed. This makes edits cheap
and avoids needless Gemini calls with no downside (text unchanged ⇒ embedding
unchanged).

### 4. Hook the existing write paths (one call each)

- **companies / contacts / properties** → `createCrmRecordAction` and
  `updateCrmRecordAction` in `src/app/crm/actions.ts`, after the successful
  insert/update, before the redirect. Best-effort: a Brain failure must not break the
  CRM save (log + continue).
- **leads** → `persistLeadIngestion` (`src/lib/lead-ingestion/persistence.ts`), after
  the row is written.
- **jobs / outcomes** → whichever path writes them today; if none is wired in-app yet,
  the backfill (§5) still covers existing rows and the hook is added when a write path
  lands. (To confirm during planning.)

Each hook calls `syncRecordToBrain(objectKey, id)` and swallows/logs errors so
ingestion is strictly additive to the existing behavior.

### 5. Backfill script — `scripts/backfill-brain-crm.mjs`

Mirrors `scripts/backfill-embeddings.mjs`. For each org (or a `--org` arg), iterate
all rows of the six CRM tables and call the same summary builders + upsert, so the
Brain reflects everything already in the CRM. This is what fixes the *currently*
empty Brain. Idempotent (re-runnable) thanks to §2.

## Data flow

```
CRM write (action / ingest / Arc)
  └─ syncRecordToBrain(objectKey, recordId)
       ├─ read record (org-scoped)
       ├─ describe<Object>(record) → summary text        [pure, src/domain]
       ├─ upsertReferenceNode({ kind, key, label, summary, persona, ref_* })
       │     ├─ insert OR update by (org_id, kind, key)
       │     └─ embed via embedText() iff embed_hash changed  [best-effort]
       └─ WriteResult (errors logged, never thrown to caller)

Backfill script → same syncRecordToBrain path over all existing rows.

Arc recall (already built): getRecallMemory → graph + match_knowledge_nodes(vector)
  now returns CRM nodes too.
```

## Testing

- **Domain (pure, no I/O):** `describe<Object>()` builders — correct summary text,
  null/empty fields omitted, stable ordering; `embed_hash` stability (same input ⇒
  same hash, changed field ⇒ changed hash).
- **Persistence:** `upsertReferenceNode` inserts when absent, updates the same row
  when present (no duplicate), leaves trust tier untouched on update, skips re-embed
  when text unchanged, embeds when changed — with a mocked Supabase client and a
  mocked `embedText`, mirroring `persistence.test.ts` / `persistence.embeddings.test.ts`.
- **Integration-ish:** `syncRecordToBrain` maps each `objectKey` to the right
  read + kind + label; a Brain failure does not propagate to the caller.
- Run `pnpm lint` scoped to changed files and `pnpm build`/`tsc` (lint does not
  typecheck; typed Supabase enums need literal unions).

## Notes / risks

- **Service-role bypasses RLS.** All reads/writes here go through the app layer and
  must carry `org_id` (resolved via `getCurrentOrgId()` or the passed `deps.orgId`).
  Every query is org-scoped; no cross-org leakage.
- **Embedding cost / latency.** Best-effort and off the critical path of the CRM
  save; `embed_hash` avoids redundant calls. If `embedText` returns null (no Gemini
  key), the node is still created and recall degrades to keyword/graph — same as today.
- **`describe` drift.** If a CRM object gains fields, its `describe` builder should be
  updated; otherwise the node summary just omits them (no breakage).
- **Workspace bug is separate.** "New workspace isn't empty" is the onboarding no-op +
  active-workspace-cookie-never-set issue (`createWorkspaceForUser` short-circuits for
  existing members; `createWorkspaceAction` never sets `signal_active_workspace`).
  Tracked and fixed independently of this slice.

## Open questions for review

1. Node `kind` naming: `crm_company` etc. (prefixed) vs bare `company`. Prefixed keeps
   CRM reference nodes visually grouped and avoids colliding with any future semantic
   "company" concept. Spec assumes **prefixed**.
2. Backfill trigger: ship as a manual `pnpm` script (assumed) vs also exposing an
   operator "Re-sync CRM into Brain" button in the Brain UI. Spec assumes **script only**
   for slice 1.
