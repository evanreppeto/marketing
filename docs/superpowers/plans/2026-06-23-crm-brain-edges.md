# CRM → Brain Edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn CRM foreign keys into `knowledge_edges` between the reference nodes from slice 1, so the Brain is a connected, traversable graph.

**Architecture:** Pure domain `buildEdgeIntentsForCrmRow` maps a row's FK columns to `{toTable, toId, relation}` intents. A lib layer resolves each to-endpoint to its node id by `(org_id, ref_table, ref_id)` and writes the edge idempotently (check-before-insert, no migration). `syncCrmRowToBrain` creates the node then its edges; `resyncCrmIntoBrain` runs two passes (all nodes, then all edges).

**Tech Stack:** TypeScript, Supabase service-role client, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-23-crm-brain-edges-design.md`
**Builds on:** slice 1 (branch `claude/crm-brain-ingestion`); this branch is `claude/crm-brain-edges`.

**Existing infra (confirmed):**
- `createEdge(input, deps): Promise<WriteResult>` in `src/lib/knowledge-graph/persistence.ts`. `KnowledgeEdgeInput = { fromNodeId, toNodeId, relation, weight?, source?, props? }`. Authored `arc` → trust tier `observed`.
- `EDGE_RELATIONS` includes `belongs_to`, `relates_to`, `responds_to` (`src/domain/knowledge-graph.ts:33`).
- `knowledge_nodes_ref_idx on (ref_table, ref_id)` — index for ref resolution.
- Slice-1: `buildNodeInputForCrmRow`, `CrmIngestTable`, `upsertReferenceNode`, `syncCrmRowToBrain`, `syncRecordToBrain`, `resyncCrmIntoBrain` (currently returns `{ ok, synced, errors, truncated }`), `resyncCrmIntoBrainAction`.

---

## File Structure
- **Modify** `src/domain/brain-ingestion.ts` — add `EdgeIntent` type + `buildEdgeIntentsForCrmRow`.
- **Modify** `src/domain/__tests__/brain-ingestion.test.ts` — edge-intent tests.
- **Modify** `src/lib/knowledge-graph/persistence.ts` — add `createEdgeIfAbsent`.
- **Modify** `src/lib/knowledge-graph/persistence.test.ts` — `createEdgeIfAbsent` tests.
- **Modify** `src/lib/brain-ingestion/sync.ts` — `syncEdgesForCrmRow`; node→edges in `syncCrmRowToBrain`; two-pass `resyncCrmIntoBrain` (new return shape).
- **Modify** `src/lib/brain-ingestion/sync.test.ts` — edge-sync + two-pass tests; update existing resync tests to the new shape.
- **Modify** `src/app/brain/actions.ts` — update the message for `{ syncedNodes, syncedEdges }`.

---

## Task 1: Domain — `buildEdgeIntentsForCrmRow`

**Files:** Modify `src/domain/brain-ingestion.ts`; Test `src/domain/__tests__/brain-ingestion.test.ts`.

- [ ] **Step 1: Write the failing test** (append to the test file):

```ts
import { buildEdgeIntentsForCrmRow } from "../brain-ingestion";

describe("buildEdgeIntentsForCrmRow", () => {
  it("links a contact to its company (belongs_to)", () => {
    expect(buildEdgeIntentsForCrmRow("contacts", { id: "k1", company_id: "co1" })).toEqual([
      { toTable: "companies", toId: "co1", relation: "belongs_to" },
    ]);
  });
  it("emits no edges for a company (root) or when FKs are absent", () => {
    expect(buildEdgeIntentsForCrmRow("companies", { id: "co1", name: "Acme" })).toEqual([]);
    expect(buildEdgeIntentsForCrmRow("contacts", { id: "k1", company_id: null })).toEqual([]);
  });
  it("links a lead to company/contact/property/campaign with the right relations", () => {
    const intents = buildEdgeIntentsForCrmRow("leads", {
      id: "l1", company_id: "co1", contact_id: "k1", property_id: "p1", attributed_campaign_id: "cam1",
    });
    expect(intents).toEqual([
      { toTable: "companies", toId: "co1", relation: "belongs_to" },
      { toTable: "contacts", toId: "k1", relation: "belongs_to" },
      { toTable: "properties", toId: "p1", relation: "relates_to" },
      { toTable: "campaigns", toId: "cam1", relation: "responds_to" },
    ]);
  });
  it("links job and outcome lineage with relates_to", () => {
    expect(buildEdgeIntentsForCrmRow("jobs", { id: "j1", lead_id: "l1" })).toContainEqual(
      { toTable: "leads", toId: "l1", relation: "relates_to" },
    );
    expect(buildEdgeIntentsForCrmRow("outcomes", { id: "o1", job_id: "j1" })).toContainEqual(
      { toTable: "jobs", toId: "j1", relation: "relates_to" },
    );
  });
});
```

- [ ] **Step 2: Run, verify it fails.** `pnpm test src/domain/__tests__/brain-ingestion.test.ts` → FAIL (not exported).

- [ ] **Step 3: Implement** (add to `src/domain/brain-ingestion.ts`; import `EdgeRelation` + `ReferenceableTable` from `./knowledge-graph` — check the exact exported names and reuse them):

```ts
import { type KnowledgeNodeInput, type EdgeRelation, type ReferenceableTable } from "./knowledge-graph";

export type EdgeIntent = { toTable: ReferenceableTable; toId: string; relation: EdgeRelation };

/** FK → (target table, relation) wiring per CRM table. Only direct FKs. */
const EDGE_FK_MAP: Partial<Record<CrmIngestTable, Array<{ column: string; toTable: ReferenceableTable; relation: EdgeRelation }>>> = {
  contacts: [{ column: "company_id", toTable: "companies", relation: "belongs_to" }],
  properties: [
    { column: "company_id", toTable: "companies", relation: "belongs_to" },
    { column: "contact_id", toTable: "contacts", relation: "relates_to" },
  ],
  leads: [
    { column: "company_id", toTable: "companies", relation: "belongs_to" },
    { column: "contact_id", toTable: "contacts", relation: "belongs_to" },
    { column: "property_id", toTable: "properties", relation: "relates_to" },
    { column: "attributed_campaign_id", toTable: "campaigns", relation: "responds_to" },
  ],
  jobs: [
    { column: "lead_id", toTable: "leads", relation: "relates_to" },
    { column: "company_id", toTable: "companies", relation: "belongs_to" },
    { column: "property_id", toTable: "properties", relation: "relates_to" },
  ],
  outcomes: [
    { column: "job_id", toTable: "jobs", relation: "relates_to" },
    { column: "lead_id", toTable: "leads", relation: "relates_to" },
  ],
};

/** Build child→parent edge intents from a CRM row's FK columns. Blank/missing FKs omitted. */
export function buildEdgeIntentsForCrmRow(table: CrmIngestTable, row: Record<string, unknown>): EdgeIntent[] {
  const rules = EDGE_FK_MAP[table] ?? [];
  const out: EdgeIntent[] = [];
  for (const rule of rules) {
    const toId = row[rule.column];
    if (typeof toId === "string" && toId.length > 0) {
      out.push({ toTable: rule.toTable, toId, relation: rule.relation });
    }
  }
  return out;
}
```

Note: confirm `ReferenceableTable` includes `campaigns` (it does — slice-1 Task 1 verified the CRM tables; `campaigns` is also in `REFERENCEABLE_TABLES`). If `EdgeRelation`/`ReferenceableTable` aren't already imported in this file, add them to the existing `./knowledge-graph` import.

- [ ] **Step 4: Run, verify pass.** Then `pnpm exec eslint src/domain/brain-ingestion.ts src/domain/__tests__/brain-ingestion.test.ts` clean; `tsc --noEmit` no new errors.

- [ ] **Step 5: Commit.**
```bash
git add src/domain/brain-ingestion.ts src/domain/__tests__/brain-ingestion.test.ts
git commit -m "feat(brain): CRM-row → edge-intent builder (domain)"
```

---

## Task 2: Persistence — `createEdgeIfAbsent`

**Files:** Modify `src/lib/knowledge-graph/persistence.ts`; Test `src/lib/knowledge-graph/persistence.test.ts`.

- [ ] **Step 1: Write the failing test** (append to `persistence.test.ts`; it already has `createSupabaseQueryMock` + `ORG`):

```ts
import { createEdgeIfAbsent } from "./persistence";

describe("createEdgeIfAbsent", () => {
  const EDGE = { fromNodeId: "n-from", toNodeId: "n-to", relation: "belongs_to" as const };

  it("inserts when no matching edge exists", async () => {
    // 1st from(knowledge_edges): lookup → none; 2nd: createEdge insert → id
    const supabase = createSupabaseQueryMock({
      knowledge_edges: [
        { data: null, error: null },
        { data: { id: "e-1" }, error: null },
      ],
    });
    const result = await createEdgeIfAbsent(EDGE, { client: supabase as never, orgId: ORG });
    expect(result).toEqual({ ok: true, id: "e-1" });
    expect(supabase.calls.some(([m]) => m === "insert")).toBe(true);
  });

  it("returns the existing edge without inserting a duplicate", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_edges: [{ data: { id: "e-existing" }, error: null }], // lookup → found
    });
    const result = await createEdgeIfAbsent(EDGE, { client: supabase as never, orgId: ORG });
    expect(result).toEqual({ ok: true, id: "e-existing" });
    expect(supabase.calls.some(([m]) => m === "insert")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify it fails** (not exported).

- [ ] **Step 3: Implement** in `persistence.ts` (reuses the existing `createEdge` + `resolveDeps`; `KnowledgeEdgeInput` is already imported):

```ts
/**
 * Idempotent edge write for CRM ingestion: insert only if no edge with the same
 * (org_id, from_node_id, to_node_id, relation) exists. No unique index needed.
 */
export async function createEdgeIfAbsent(input: KnowledgeEdgeInput, deps: WriteDeps = {}): Promise<WriteResult> {
  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;

  const existing = await client
    .from("knowledge_edges")
    .select("id")
    .eq("org_id", orgId)
    .eq("from_node_id", input.fromNodeId)
    .eq("to_node_id", input.toNodeId)
    .eq("relation", input.relation)
    .maybeSingle<{ id: string }>();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (existing.data?.id) return { ok: true, id: existing.data.id };

  return createEdge(input, { client, orgId });
}
```

- [ ] **Step 4: Run, verify pass.** eslint + tsc clean.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/knowledge-graph/persistence.ts src/lib/knowledge-graph/persistence.test.ts
git commit -m "feat(brain): createEdgeIfAbsent (idempotent edge write)"
```

---

## Task 3: Orchestration — edges in sync + two-pass backfill

**Files:** Modify `src/lib/brain-ingestion/sync.ts`, `src/lib/brain-ingestion/sync.test.ts`, `src/app/brain/actions.ts`.

- [ ] **Step 1: Write/Update the failing tests** in `sync.test.ts`. Add a mock for the new persistence + domain calls and the edge-sync tests; UPDATE the existing `resyncCrmIntoBrain` tests to the new return shape.

At the top, extend the persistence mock and import:
```ts
vi.mock("@/lib/knowledge-graph/persistence", () => ({ upsertReferenceNode: vi.fn(), createEdgeIfAbsent: vi.fn() }));
import { upsertReferenceNode, createEdgeIfAbsent } from "@/lib/knowledge-graph/persistence";
const edgeMock = vi.mocked(createEdgeIfAbsent);
```

Add edge-sync tests:
```ts
describe("syncEdgesForCrmRow", () => {
  it("resolves each intent's to-node by ref and writes an edge", async () => {
    edgeMock.mockResolvedValue({ ok: true, id: "e1" });
    // node lookup by (org, ref_table, ref_id) → found id
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: { id: "n-co" }, error: null } });
    const { syncEdgesForCrmRow } = await import("./sync");
    const res = await syncEdgesForCrmRow("contacts", "n-from", { id: "k1", company_id: "co1" }, { client: supabase as never, orgId: ORG });
    expect(res.created).toBe(1);
    const [edgeArg] = edgeMock.mock.calls[0];
    expect(edgeArg).toMatchObject({ fromNodeId: "n-from", toNodeId: "n-co", relation: "belongs_to" });
  });

  it("skips an intent whose to-node does not exist yet", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: null, error: null } });
    const { syncEdgesForCrmRow } = await import("./sync");
    const res = await syncEdgesForCrmRow("contacts", "n-from", { id: "k1", company_id: "co1" }, { client: supabase as never, orgId: ORG });
    expect(res.created).toBe(0);
    expect(edgeMock).not.toHaveBeenCalled();
  });
});
```

Replace the existing `resyncCrmIntoBrain` describe block's assertions to the new shape (nodes pass + edges pass). Example for the tally test:
```ts
it("tallies nodes then edges across tables", async () => {
  upsertMock.mockResolvedValue({ ok: true, id: "n" });
  edgeMock.mockResolvedValue({ ok: true, id: "e" });
  const supabase = createSupabaseQueryMock({
    companies: { data: [{ id: "c1" }], error: null },
    leads: { data: [{ id: "l1", company_id: "c1" }], error: null },
    knowledge_nodes: { data: { id: "n-any" }, error: null }, // ref resolution in edge pass
  });
  const res = await resyncCrmIntoBrain({ client: supabase as never, orgId: ORG });
  expect(res.ok).toBe(true);
  expect(res.syncedNodes).toBe(2);
  expect(typeof res.syncedEdges).toBe("number");
  expect(res.truncated).toBe(false);
});
```
Keep the "table read error → ok:false" and "non-string id → error" tests, updating field names from `synced` to `syncedNodes`.

- [ ] **Step 2: Run, verify failures** (new functions/shape).

- [ ] **Step 3: Implement** in `sync.ts`:

Add imports:
```ts
import { buildNodeInputForCrmRow, buildEdgeIntentsForCrmRow, type CrmIngestTable } from "@/domain";
import { upsertReferenceNode, createEdgeIfAbsent, type WriteResult } from "@/lib/knowledge-graph/persistence";
```

Add the edge-sync function:
```ts
/** Resolve a CRM record's node id by ref (org-scoped). Null if not ingested yet. */
async function resolveNodeIdByRef(
  client: TypedSupabaseClient, orgId: string, refTable: string, refId: string,
): Promise<string | null> {
  const { data } = await client
    .from("knowledge_nodes").select("id")
    .eq("org_id", orgId).eq("ref_table", refTable).eq("ref_id", refId)
    .limit(1).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

/** Create child→parent edges from a row's FK intents. Skips intents whose target node is missing. */
export async function syncEdgesForCrmRow(
  table: CrmIngestTable, fromNodeId: string, row: Record<string, unknown>, deps: SyncDeps = {},
): Promise<{ created: number; skipped: number }> {
  const resolved = await resolve(deps).catch(() => null);
  if (!resolved) return { created: 0, skipped: 0 };
  const { client, orgId } = resolved;
  let created = 0, skipped = 0;
  for (const intent of buildEdgeIntentsForCrmRow(table, row)) {
    const toNodeId = await resolveNodeIdByRef(client, orgId, intent.toTable, intent.toId);
    if (!toNodeId) { skipped++; continue; }
    const res = await createEdgeIfAbsent({ fromNodeId, toNodeId, relation: intent.relation }, { client, orgId });
    if (res.ok) created++; else skipped++;
  }
  return { created, skipped };
}
```

Update `syncCrmRowToBrain` to create edges after the node (return the node result unchanged):
```ts
export async function syncCrmRowToBrain(
  table: CrmIngestTable, row: Record<string, unknown>, deps: SyncDeps = {},
): Promise<WriteResult> {
  const nodeResult = await upsertReferenceNode(buildNodeInputForCrmRow(table, row), deps);
  if (nodeResult.ok) {
    // Best-effort edges; failures never fail the node write.
    try { await syncEdgesForCrmRow(table, nodeResult.id, row, deps); } catch { /* ignore */ }
  }
  return nodeResult;
}
```

Rewrite `resyncCrmIntoBrain` as two passes with the new return shape:
```ts
export async function resyncCrmIntoBrain(
  deps: SyncDeps = {},
): Promise<{ ok: boolean; syncedNodes: number; syncedEdges: number; errors: number; truncated: boolean }> {
  let resolved;
  try { resolved = await resolve(deps); }
  catch { return { ok: false, syncedNodes: 0, syncedEdges: 0, errors: 0, truncated: false }; }
  if (!resolved) return { ok: false, syncedNodes: 0, syncedEdges: 0, errors: 0, truncated: false };
  const { client, orgId } = resolved;

  let syncedNodes = 0, syncedEdges = 0, errors = 0, truncated = false, tableReadFailed = false;
  const rowsByTable: Partial<Record<CrmIngestTable, Array<Record<string, unknown>>>> = {};

  // Pass 1: nodes (so every edge endpoint exists).
  for (const table of CRM_INGEST_TABLES) {
    const { data, error } = await client.from(table).select("*").eq("org_id", orgId).limit(RESYNC_TABLE_LIMIT);
    if (error || !Array.isArray(data)) { tableReadFailed = true; continue; }
    if (data.length >= RESYNC_TABLE_LIMIT) truncated = true;
    const rows = data as Array<Record<string, unknown>>;
    rowsByTable[table] = rows;
    for (const row of rows) {
      if (typeof row.id !== "string") { errors++; continue; }
      const res = await upsertReferenceNode(buildNodeInputForCrmRow(table, row), { client, orgId });
      if (res.ok) syncedNodes++; else errors++;
    }
  }

  // Pass 2: edges (endpoints now exist).
  for (const table of CRM_INGEST_TABLES) {
    for (const row of rowsByTable[table] ?? []) {
      if (typeof row.id !== "string") continue;
      const fromNodeId = await resolveNodeIdByRef(client, orgId, table, row.id);
      if (!fromNodeId) continue;
      const r = await syncEdgesForCrmRow(table, fromNodeId, row, { client, orgId });
      syncedEdges += r.created;
    }
  }

  return { ok: !tableReadFailed, syncedNodes, syncedEdges, errors, truncated };
}
```
(`buildNodeInputForCrmRow` is now used directly in `resyncCrmIntoBrain` pass 1 — that's fine; or call `upsertReferenceNode(buildNodeInputForCrmRow(...))` as shown. Keep `RESYNC_TABLE_LIMIT` and `resolve` as-is from slice 1.)

- [ ] **Step 4: Update the action message** in `src/app/brain/actions.ts` for the new shape:
```ts
  if (!result.syncedNodes && !result.errors) {
    return { ok: false, message: "Nothing to sync — Supabase isn't configured or there are no CRM records yet." };
  }
  const parts = [`Synced ${result.syncedNodes} CRM record${result.syncedNodes === 1 ? "" : "s"} and ${result.syncedEdges} link${result.syncedEdges === 1 ? "" : "s"} into the Brain`];
  if (result.errors) parts.push(`${result.errors} skipped`);
  if (result.truncated) parts.push("some tables hit the row limit — run again to finish");
  return { ok: result.ok, message: `${parts.join("; ")}.` };
```

- [ ] **Step 5: Run tests, verify pass.** `pnpm test src/lib/brain-ingestion/sync.test.ts src/domain/__tests__/brain-ingestion.test.ts`. eslint + tsc clean on changed files.

- [ ] **Step 6: Commit.**
```bash
git add src/lib/brain-ingestion/sync.ts src/lib/brain-ingestion/sync.test.ts src/app/brain/actions.ts
git commit -m "feat(brain): sync CRM FK edges + two-pass backfill"
```

---

## Task 4: Full verification

- [ ] **Step 1: Full suite.** `pnpm test` → all pass EXCEPT the two pre-existing `main` failures (`src/lib/brand-kit/read-model.test.ts` tsc fixture; `src/app/api/v1/arc/campaigns/draft-asset/route.test.ts` 5 tests) — confirm those are the ONLY failures and that they reproduce on the base branch (don't attribute them here).
- [ ] **Step 2: Typecheck + scoped lint.** `pnpm exec tsc --noEmit --pretty false` (only the pre-existing brand-kit error). `pnpm exec eslint` on every changed file → clean.
- [ ] **Step 3: Manual smoke (if Supabase env available).** Create a contact under a company in CRM, click "Sync CRM into Brain", confirm the message reports records AND links; on `/brain` the contact node connects to the company node. (The particle canvas can hang screenshot/eval — prefer a DOM/text check.)
- [ ] **Step 4: Commit any final notes.**

---

## Self-review notes
- **Spec coverage:** edge intents → Task 1; idempotent write → Task 2; ref resolution + node→edges + two-pass backfill + action message → Task 3; verification → Task 4. Deferred items (persona edges, edge embeddings) excluded.
- **Bundle gap (documented):** Arc's `createArcLead`/lead-ingest currently syncs only the lead node live (slice 1), so a freshly-bundled lead's company/contact/property nodes may not exist yet → those edges resolve on the next backfill, not instantly. Acceptable; backfill backstops. Not expanding slice-1 hooks here.
- **Return-shape change:** `resyncCrmIntoBrain` now returns `{ syncedNodes, syncedEdges, errors, truncated }`; the action message and the slice-1 resync tests are updated in Task 3 — verify no other caller references the old `synced` field (`grep`).
- **Type consistency:** `EdgeIntent`, `buildEdgeIntentsForCrmRow`, `createEdgeIfAbsent`, `syncEdgesForCrmRow`, `resolveNodeIdByRef` are used identically across tasks.
