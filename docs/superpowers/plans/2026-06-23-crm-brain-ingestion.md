# CRM → Brain Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creating, editing, or backfilling any of the six CRM objects creates/updates one embedded, semantically-searchable Brain node, so Arc can recall CRM content.

**Architecture:** A pure domain layer builds a `KnowledgeNodeInput` (kind/key/label/summary/ref) from a raw CRM row. A persistence helper `upsertReferenceNode` makes writes idempotent on the existing `(org_id, kind, key)` unique index and re-embeds only when the text hash changes. A thin `src/lib/brain-ingestion/` orchestrates read-row → upsert. Existing CRM write paths call it best-effort; an operator-gated `resyncCrmIntoBrain` action backfills everything already in the CRM.

**Tech Stack:** Next.js 16 server actions, Supabase service-role client, Gemini `text-embedding-004` via `embedText`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-23-crm-brain-ingestion-design.md`

**Decisions locked since the spec:**
- Backfill is an **operator-gated server action + Brain UI button**, not a `.mjs` script (the repo's `.mjs` scripts are self-contained plain JS and would force duplicating the summary logic untyped). This supersedes spec open-question 2.
- The ingestion path reads **raw CRM rows** (`from(objectKey).select("*")`) rather than the Zod repos, so field names are the exact DB columns.
- Node kinds are **prefixed**: `crm_company`, `crm_contact`, `crm_lead`, `crm_property`, `crm_job`, `crm_outcome` (spec open-question 1).

---

## File Structure

- **Create** `src/domain/brain-ingestion.ts` — pure: `CRM_NODE_KINDS` map, `crmNodeKey`, `embedHash`, per-object `describe*` builders, `buildNodeInputForCrmRow`.
- **Create** `src/domain/__tests__/brain-ingestion.test.ts` — unit tests for the above.
- **Modify** `src/domain/index.ts` — re-export `./brain-ingestion`.
- **Modify** `src/lib/knowledge-graph/persistence.ts` — add `upsertReferenceNode` + shared `embedNodeBestEffort` reuse.
- **Modify** `src/lib/knowledge-graph/persistence.test.ts` — tests for `upsertReferenceNode` (insert/update/no-dupe/tier-untouched).
- **Create** `src/lib/knowledge-graph/persistence.upsert-embeddings.test.ts` — re-embed-only-on-change tests.
- **Create** `src/lib/brain-ingestion/sync.ts` — `syncCrmRowToBrain`, `syncRecordToBrain`, `resyncCrmIntoBrain`, `CRM_INGEST_TABLES`.
- **Create** `src/lib/brain-ingestion/sync.test.ts` — orchestration tests.
- **Modify** `src/app/crm/actions.ts` — call `syncRecordToBrain` after create/update (best-effort).
- **Modify** `src/lib/lead-ingestion/persistence.ts` — call `syncCrmRowToBrain` for the new lead (best-effort).
- **Modify** `src/app/brain/actions.ts` — add `resyncCrmIntoBrainAction`.
- **Modify** `src/app/brain/_components/brain-shell.tsx` (or its operator bar) — add a "Sync CRM into Brain" button.

---

## Task 1: Domain — node-input builders

**Files:**
- Create: `src/domain/brain-ingestion.ts`
- Test: `src/domain/__tests__/brain-ingestion.test.ts`
- Modify: `src/domain/index.ts`

Reference types (already in repo): `KnowledgeNodeInput` (`src/domain/knowledge-graph.ts:66`) has fields `kind, label, body?, summary?, persona?, confidence?, key?, refTable?, refId?, source?, sourceReference?, tags?, props?`. `resolveInitialTrustTier({kind, createdBy})` returns `observed` for a non-gated kind authored by `arc`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/__tests__/brain-ingestion.test.ts
import { describe, expect, it } from "vitest";
import { buildNodeInputForCrmRow, crmNodeKey, embedHash, CRM_NODE_KINDS } from "../brain-ingestion";

describe("crmNodeKey / CRM_NODE_KINDS", () => {
  it("builds a stable per-record key and prefixed kind", () => {
    expect(crmNodeKey("companies", "abc")).toBe("crm:companies:abc");
    expect(CRM_NODE_KINDS.companies).toBe("crm_company");
    expect(CRM_NODE_KINDS.outcomes).toBe("crm_outcome");
  });
});

describe("embedHash", () => {
  it("is stable for the same text and differs when text changes", () => {
    expect(embedHash("a\nb")).toBe(embedHash("a\nb"));
    expect(embedHash("a\nb")).not.toBe(embedHash("a\nc"));
  });
});

describe("buildNodeInputForCrmRow — companies", () => {
  it("maps a company row to a node input with summary, key, ref, persona", () => {
    const input = buildNodeInputForCrmRow("companies", {
      id: "c1", name: "Acme Property Group", persona: "property_manager",
      status: "active", partner_tier: "gold", website_url: "https://acme.test",
      phone: "555-1000", email: "ops@acme.test",
    });
    expect(input.kind).toBe("crm_company");
    expect(input.key).toBe("crm:companies:c1");
    expect(input.label).toBe("Acme Property Group");
    expect(input.refTable).toBe("companies");
    expect(input.refId).toBe("c1");
    expect(input.persona).toBe("property_manager");
    expect(input.summary).toContain("Acme Property Group");
    expect(input.summary).toContain("gold");
    expect(input.tags).toContain("crm");
  });

  it("drops unassigned_persona to null (ingest rejects it)", () => {
    const input = buildNodeInputForCrmRow("companies", { id: "c2", name: "NoPersona Co", persona: "unassigned_persona" });
    expect(input.persona).toBeNull();
  });
});

describe("buildNodeInputForCrmRow — contacts/properties/leads", () => {
  it("labels a contact by full_name, falling back to email", () => {
    expect(buildNodeInputForCrmRow("contacts", { id: "k1", full_name: "Dana Reyes" }).label).toBe("Dana Reyes");
    expect(buildNodeInputForCrmRow("contacts", { id: "k2", full_name: null, email: "dana@x.test" }).label).toBe("dana@x.test");
  });
  it("labels a property by address", () => {
    expect(buildNodeInputForCrmRow("properties", {
      id: "p1", street_line_1: "12 Oak St", city: "Oak Park", state: "IL", postal_code: "60301",
    }).label).toBe("12 Oak St, Oak Park, IL");
  });
  it("includes lead score and source in the lead summary", () => {
    const input = buildNodeInputForCrmRow("leads", { id: "l1", source: "website", lead_score: 87, loss_summary: "flood damage" });
    expect(input.kind).toBe("crm_lead");
    expect(input.summary).toContain("website");
    expect(input.summary).toContain("87");
    expect(input.summary).toContain("flood damage");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/brain-ingestion.test.ts`
Expected: FAIL — `Cannot find module '../brain-ingestion'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/brain-ingestion.ts
import { type KnowledgeNodeInput } from "./knowledge-graph";

/** The six CRM objects that ingest into the Brain. */
export type CrmIngestTable =
  | "companies" | "contacts" | "leads" | "properties" | "jobs" | "outcomes";

/** Prefixed, non-gated node kinds — keeps CRM reference nodes grouped. */
export const CRM_NODE_KINDS: Record<CrmIngestTable, string> = {
  companies: "crm_company",
  contacts: "crm_contact",
  leads: "crm_lead",
  properties: "crm_property",
  jobs: "crm_job",
  outcomes: "crm_outcome",
};

/** Idempotency handle: unique per (org, kind, key). */
export function crmNodeKey(table: CrmIngestTable, id: string): string {
  return `crm:${table}:${id}`;
}

/** Small deterministic FNV-1a hash (hex) of the embed text — pure, runtime-free. */
export function embedHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Join non-empty `Label: value` fragments into one summary line group. */
function lines(parts: Array<[string, unknown]>): string {
  return parts
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim().length > 0)
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("\n");
}

function persona(row: { persona?: unknown }): string | null {
  const p = typeof row.persona === "string" ? row.persona : null;
  return p && p !== "unassigned_persona" ? p : null;
}

function dollars(cents: unknown): string | null {
  return typeof cents === "number" ? `$${(cents / 100).toLocaleString("en-US")}` : null;
}

/** Build a Brain node input from a raw CRM row. `row` is the DB Row of `table`. */
export function buildNodeInputForCrmRow(
  table: CrmIngestTable,
  row: Record<string, any>,
): KnowledgeNodeInput {
  const base = {
    kind: CRM_NODE_KINDS[table],
    key: crmNodeKey(table, row.id as string),
    refTable: table as never,
    refId: row.id as string,
    persona: persona(row),
    source: "crm-sync",
    tags: ["crm", table],
  };

  if (table === "companies") {
    return {
      ...base,
      label: (row.name as string) ?? "Company",
      summary: lines([
        ["Company", row.name], ["Partner tier", row.partner_tier], ["Persona", persona(row)],
        ["Status", row.status], ["Website", row.website_url], ["Phone", row.phone], ["Email", row.email],
      ]),
    };
  }
  if (table === "contacts") {
    const label = (row.full_name as string) || (row.email as string) || "Contact";
    return {
      ...base,
      label,
      summary: lines([
        ["Contact", row.full_name], ["Title", row.title], ["Persona", persona(row)],
        ["Status", row.status], ["Email", row.email], ["Phone", row.phone],
      ]),
    };
  }
  if (table === "properties") {
    const label = [row.street_line_1, row.city, row.state].filter(Boolean).join(", ") || "Property";
    return {
      ...base,
      label,
      summary: lines([
        ["Property", label], ["Type", row.property_type], ["Postal code", row.postal_code], ["Persona", persona(row)],
      ]),
    };
  }
  if (table === "leads") {
    return {
      ...base,
      label: `Lead: ${row.source ?? "unknown source"}`,
      summary: lines([
        ["Lead source", row.source], ["Persona", persona(row)], ["Status", row.status],
        ["Score", row.lead_score], ["Routing", row.routing_recommendation],
        ["Loss summary", row.loss_summary],
        ["Loss signals", Array.isArray(row.loss_signals) ? (row.loss_signals as string[]).join(", ") : null],
      ]),
    };
  }
  if (table === "jobs") {
    const label = row.job_number ? `Job ${row.job_number}` : `Job ${String(row.id).slice(0, 8)}`;
    return {
      ...base,
      label,
      summary: lines([
        ["Job", row.job_number], ["Persona", persona(row)], ["Status", row.status],
        ["Estimated revenue", dollars(row.estimated_revenue_cents)],
        ["Scheduled", row.scheduled_at], ["Completed", row.completed_at],
      ]),
    };
  }
  // outcomes
  return {
    ...base,
    label: `Outcome ${String(row.id).slice(0, 8)}`,
    summary: lines([
      ["Outcome", row.status], ["Persona", persona(row)],
      ["Gross revenue", dollars(row.gross_revenue_cents)], ["Gross margin", dollars(row.gross_margin_cents)],
      ["Closed", row.closed_at],
    ]),
  };
}
```

- [ ] **Step 4: Verify `refTable: "companies"` is accepted by `validateNodeInput`**

Open `src/domain/knowledge-graph.ts` and confirm the `ReferenceableTable` type (used by `validateNodeInput`) includes all six CRM tables (`companies, contacts, leads, properties, jobs, outcomes`). It is the same set `brain-provenance.ts` treats as CRM refs, so this should already hold. If any are missing, add them to `ReferenceableTable`.

Run: `pnpm test src/domain/__tests__/brain-ingestion.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-export from the domain barrel**

In `src/domain/index.ts`, add alongside the other `export *` lines:

```ts
export * from "./brain-ingestion";
```

- [ ] **Step 6: Commit**

```bash
git add src/domain/brain-ingestion.ts src/domain/__tests__/brain-ingestion.test.ts src/domain/index.ts
git commit -m "feat(brain): CRM-row → node-input builders (domain)"
```

---

## Task 2: Persistence — `upsertReferenceNode`

**Files:**
- Modify: `src/lib/knowledge-graph/persistence.ts`
- Test: `src/lib/knowledge-graph/persistence.test.ts`
- Test: `src/lib/knowledge-graph/persistence.upsert-embeddings.test.ts` (create)

`createNode` already exists with `resolveDeps`, `embedNodeBestEffort`, and uses `validateNodeInput` + `resolveInitialTrustTier`. We add an upsert that keys on `(org_id, kind, key)`.

- [ ] **Step 1: Write the failing test (insert + update, no duplicate, tier untouched)**

```ts
// add to src/lib/knowledge-graph/persistence.test.ts
import { upsertReferenceNode } from "./persistence";

describe("upsertReferenceNode", () => {
  it("inserts when no node exists for (org, kind, key)", async () => {
    // 1st from(): lookup → no row; 2nd: insert → id; 3rd: embedding update → id
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: [
        { data: null, error: null },
        { data: { id: "n-new" }, error: null },
        { data: { id: "n-new" }, error: null },
      ],
    });
    const result = await upsertReferenceNode(
      { kind: "crm_company", key: "crm:companies:c1", label: "Acme", summary: "Company: Acme", refTable: "companies" as never, refId: "c1" },
      { client: supabase as never, orgId: ORG },
    );
    expect(result).toEqual({ ok: true, id: "n-new" });
    const insert = supabase.calls.find(([m]) => m === "insert") as [string, Record<string, unknown>];
    expect(insert[1].trust_tier).toBe("observed");
    expect(insert[1].created_by).toBe("arc");
    expect(insert[1].key).toBe("crm:companies:c1");
  });

  it("updates the existing node instead of inserting a duplicate", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: [
        { data: { id: "n-1", props: { embed_hash: "deadbeef" } }, error: null }, // lookup → existing
        { data: { id: "n-1" }, error: null }, // update
        { data: { id: "n-1" }, error: null }, // embedding update (text changed)
      ],
    });
    const result = await upsertReferenceNode(
      { kind: "crm_company", key: "crm:companies:c1", label: "Acme Renamed", summary: "Company: Acme Renamed", refTable: "companies" as never, refId: "c1" },
      { client: supabase as never, orgId: ORG },
    );
    expect(result).toEqual({ ok: true, id: "n-1" });
    expect(supabase.calls.some(([m]) => m === "insert")).toBe(false);
    const update = supabase.calls.find(([m]) => m === "update") as [string, Record<string, unknown>];
    expect(update[1]).not.toHaveProperty("trust_tier"); // tier untouched on update
    expect(update[1].label).toBe("Acme Renamed");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/knowledge-graph/persistence.test.ts`
Expected: FAIL — `upsertReferenceNode` is not exported.

- [ ] **Step 3: Implement `upsertReferenceNode`**

Add to `src/lib/knowledge-graph/persistence.ts` (imports: add `embedHash` to the `@/domain` import; `embedText` is already imported):

```ts
import { /* …existing… */ embedHash } from "@/domain";

/**
 * Insert-or-update a reference node keyed on (org_id, kind, key). Used by CRM →
 * Brain ingestion: an edit updates the same row instead of duplicating. Always
 * authored "arc" (non-gated kinds resolve to "observed"). Re-embeds only when the
 * embed text hash changed. Trust tier is left untouched on update.
 */
export async function upsertReferenceNode(input: KnowledgeNodeInput, deps: WriteDeps = {}): Promise<WriteResult> {
  const parsed = validateNodeInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (!parsed.value.key) return { ok: false, error: "upsertReferenceNode requires a key." };

  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;
  const value = parsed.value;

  const embedText_ = [value.label, value.summary, value.body].filter(Boolean).join("\n").trim();
  const hash = embedHash(embedText_);

  const existing = await client
    .from("knowledge_nodes")
    .select("id, props")
    .eq("org_id", orgId)
    .eq("kind", value.kind)
    .eq("key", value.key)
    .maybeSingle<{ id: string; props: Record<string, unknown> | null }>();
  if (existing.error) return { ok: false, error: existing.error.message };

  if (existing.data) {
    const id = existing.data.id;
    const prevHash = (existing.data.props as { embed_hash?: string } | null)?.embed_hash;
    const { error } = await client
      .from("knowledge_nodes")
      .update({
        label: value.label,
        summary: value.summary,
        body: value.body,
        persona: value.persona as never,
        ref_table: value.refTable,
        ref_id: value.refId,
        source: value.source ?? "crm-sync",
        tags: value.tags ?? [],
        props: { ...(existing.data.props ?? {}), embed_hash: hash } as never,
      })
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) return { ok: false, error: error.message };
    if (prevHash !== hash) await embedReferenceBestEffort(client, orgId, id, embedText_);
    return { ok: true, id };
  }

  const trustTier = resolveInitialTrustTier({ kind: value.kind, createdBy: "arc" });
  const { data, error } = await client
    .from("knowledge_nodes")
    .insert({
      org_id: orgId,
      kind: value.kind,
      key: value.key,
      label: value.label,
      body: value.body,
      summary: value.summary,
      persona: value.persona as never,
      trust_tier: trustTier,
      confidence: value.confidence,
      ref_table: value.refTable,
      ref_id: value.refId,
      source: value.source ?? "crm-sync",
      source_reference: value.sourceReference,
      created_by: "arc",
      approved_by: null,
      approved_at: null,
      tags: value.tags ?? [],
      props: { ...(value.props ?? {}), embed_hash: hash } as never,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: MISSING_WRITE_ID };
  await embedReferenceBestEffort(client, orgId, data.id, embedText_);
  return { ok: true, id: data.id };
}

/** Embed pre-joined text; never throws (recall degrades to keyword/graph). */
async function embedReferenceBestEffort(client: TypedSupabaseClient, orgId: string, id: string, text: string): Promise<void> {
  try {
    const embedding = await embedText(text);
    if (!embedding) return;
    await client.from("knowledge_nodes").update({ embedding: JSON.stringify(embedding) } as never).eq("id", id).eq("org_id", orgId);
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/lib/knowledge-graph/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the re-embed-only-on-change test**

```ts
// src/lib/knowledge-graph/persistence.upsert-embeddings.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/embeddings/gemini-embeddings", () => ({ embedText: vi.fn() }));
import { embedText } from "@/lib/embeddings/gemini-embeddings";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";
import { embedHash } from "@/domain";
import { upsertReferenceNode } from "./persistence";

const embedMock = vi.mocked(embedText);
const ORG = "org-u-1";
const FAKE_VEC = Array.from({ length: 768 }, (_, i) => i / 768);
beforeEach(() => embedMock.mockReset());
afterEach(() => vi.restoreAllMocks());

const NODE = { kind: "crm_company", key: "crm:companies:c1", label: "Acme", summary: "Company: Acme", refTable: "companies" as never, refId: "c1" };

it("skips re-embed when the stored hash matches the new text", async () => {
  const hash = embedHash(["Acme", "Company: Acme"].join("\n").trim());
  const supabase = createSupabaseQueryMock({
    knowledge_nodes: [
      { data: { id: "n-1", props: { embed_hash: hash } }, error: null }, // lookup
      { data: { id: "n-1" }, error: null }, // update (no embed follows)
    ],
  });
  const result = await upsertReferenceNode(NODE, { client: supabase as never, orgId: ORG });
  expect(result).toEqual({ ok: true, id: "n-1" });
  expect(embedMock).not.toHaveBeenCalled();
});

it("re-embeds when the text changed", async () => {
  embedMock.mockResolvedValue(FAKE_VEC);
  const supabase = createSupabaseQueryMock({
    knowledge_nodes: [
      { data: { id: "n-1", props: { embed_hash: "stale" } }, error: null },
      { data: { id: "n-1" }, error: null },
      { data: { id: "n-1" }, error: null },
    ],
  });
  await upsertReferenceNode(NODE, { client: supabase as never, orgId: ORG });
  expect(embedMock).toHaveBeenCalledOnce();
});
```

- [ ] **Step 6: Run and commit**

Run: `pnpm test src/lib/knowledge-graph/persistence.upsert-embeddings.test.ts`
Expected: PASS.

```bash
git add src/lib/knowledge-graph/persistence.ts src/lib/knowledge-graph/persistence.test.ts src/lib/knowledge-graph/persistence.upsert-embeddings.test.ts
git commit -m "feat(brain): upsertReferenceNode (idempotent, re-embed on change)"
```

---

## Task 3: Ingestion orchestration — `src/lib/brain-ingestion/sync.ts`

**Files:**
- Create: `src/lib/brain-ingestion/sync.ts`
- Test: `src/lib/brain-ingestion/sync.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/brain-ingestion/sync.test.ts
import { describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/knowledge-graph/persistence", () => ({ upsertReferenceNode: vi.fn() }));
import { upsertReferenceNode } from "@/lib/knowledge-graph/persistence";
import { syncRecordToBrain, syncCrmRowToBrain } from "./sync";

const upsertMock = vi.mocked(upsertReferenceNode);
const ORG = "org-s-1";

describe("syncCrmRowToBrain", () => {
  it("builds a node input from the row and upserts it as arc", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "n-1" });
    const res = await syncCrmRowToBrain("companies", { id: "c1", name: "Acme" }, { client: {} as never, orgId: ORG });
    expect(res).toEqual({ ok: true, id: "n-1" });
    const [input, deps] = upsertMock.mock.calls[0];
    expect(input.kind).toBe("crm_company");
    expect(input.key).toBe("crm:companies:c1");
    expect(deps).toMatchObject({ orgId: ORG });
  });
});

describe("syncRecordToBrain", () => {
  it("reads the raw row org-scoped then upserts", async () => {
    upsertMock.mockResolvedValue({ ok: true, id: "n-2" });
    const supabase = createSupabaseQueryMock({ companies: { data: { id: "c2", name: "Beta" }, error: null } });
    const res = await syncRecordToBrain("companies", "c2", { client: supabase as never, orgId: ORG });
    expect(res).toEqual({ ok: true, id: "n-2" });
    expect(upsertMock.mock.calls.at(-1)![0].refId).toBe("c2");
  });

  it("returns a soft error (does not throw) when the row is missing", async () => {
    const supabase = createSupabaseQueryMock({ companies: { data: null, error: null } });
    const res = await syncRecordToBrain("companies", "missing", { client: supabase as never, orgId: ORG });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/brain-ingestion/sync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/brain-ingestion/sync.ts
import { buildNodeInputForCrmRow, type CrmIngestTable } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { upsertReferenceNode } from "@/lib/knowledge-graph/persistence";
import { type TypedSupabaseClient, getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { type WriteResult } from "@/lib/knowledge-graph/persistence";

export const CRM_INGEST_TABLES: CrmIngestTable[] = ["companies", "contacts", "leads", "properties", "jobs", "outcomes"];

type SyncDeps = { client?: TypedSupabaseClient; orgId?: string };

async function resolve(deps: SyncDeps): Promise<{ client: TypedSupabaseClient; orgId: string } | null> {
  if (deps.client && deps.orgId) return { client: deps.client, orgId: deps.orgId };
  if (!isSupabaseAdminConfigured()) return null;
  return { client: deps.client ?? getSupabaseAdminClient(), orgId: deps.orgId ?? (await getCurrentOrgId()) };
}

/** Upsert a Brain node from an already-read CRM row. Used by backfill + lead ingest. */
export async function syncCrmRowToBrain(
  table: CrmIngestTable,
  row: Record<string, unknown>,
  deps: SyncDeps = {},
): Promise<WriteResult> {
  return upsertReferenceNode(buildNodeInputForCrmRow(table, row as never), deps);
}

/** Read a CRM record (org-scoped, raw row) by id, then upsert its Brain node. */
export async function syncRecordToBrain(table: CrmIngestTable, recordId: string, deps: SyncDeps = {}): Promise<WriteResult> {
  const resolved = await resolve(deps);
  if (!resolved) return { ok: false, error: "Supabase is not configured." };
  const { client, orgId } = resolved;
  const { data, error } = await client
    .from(table)
    .select("*")
    .eq("id", recordId)
    .eq("org_id", orgId)
    .maybeSingle<Record<string, unknown>>();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: `${table} ${recordId} not found.` };
  return syncCrmRowToBrain(table, data, { client, orgId });
}

/** Backfill: upsert a Brain node for every CRM row in the org. Returns per-table counts. */
export async function resyncCrmIntoBrain(deps: SyncDeps = {}): Promise<{ ok: boolean; synced: number; errors: number }> {
  const resolved = await resolve(deps);
  if (!resolved) return { ok: false, synced: 0, errors: 0 };
  const { client, orgId } = resolved;
  let synced = 0;
  let errors = 0;
  for (const table of CRM_INGEST_TABLES) {
    const { data, error } = await client.from(table).select("*").eq("org_id", orgId).limit(2000);
    if (error || !Array.isArray(data)) { errors++; continue; }
    for (const row of data as Array<Record<string, unknown>>) {
      const res = await syncCrmRowToBrain(table, row, { client, orgId });
      if (res.ok) synced++; else errors++;
    }
  }
  return { ok: true, synced, errors };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/lib/brain-ingestion/sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brain-ingestion/
git commit -m "feat(brain): CRM ingestion orchestration (sync/record/resync)"
```

---

## Task 4: Hook the live write paths

**Files:**
- Modify: `src/app/crm/actions.ts`
- Modify: `src/lib/lead-ingestion/persistence.ts`

CRM create/update is fire-and-forget into the Brain — a Brain failure must NOT break the CRM save or change the redirect.

- [ ] **Step 1: Hook `createCrmRecordAction`**

In `src/app/crm/actions.ts`, add the import:

```ts
import { syncRecordToBrain } from "@/lib/brain-ingestion/sync";
```

In `createCrmRecordAction`, after the successful insert and before `revalidatePath`/redirect (i.e. right after the `if ("error" in inserted)` block, around line 39):

```ts
  // Best-effort: mirror the new record into the Brain. Never block the CRM save.
  try { await syncRecordToBrain(objectKey, inserted.id, { orgId }); } catch { /* ignore */ }
```

- [ ] **Step 2: Hook `updateCrmRecordAction`**

In `updateCrmRecordAction`, after the successful `update` (right after the `if (error) {…}` block, around line 73):

```ts
  try { await syncRecordToBrain(objectKey, recordId, { orgId }); } catch { /* ignore */ }
```

- [ ] **Step 3: Hook lead ingestion**

In `src/lib/lead-ingestion/persistence.ts`, at the end of `persistLeadIngestion`, after `leadId` is known and before returning `PersistedLeadIngestion`:

```ts
  // Best-effort Brain mirror of the new lead (recall degrades gracefully without it).
  try {
    const { syncRecordToBrain } = await import("@/lib/brain-ingestion/sync");
    await syncRecordToBrain("leads", leadId, { client: supabase, orgId });
  } catch { /* ignore */ }
```

(The dynamic `import()` avoids a static import cycle between lead-ingestion and brain-ingestion; if no cycle exists, a top-of-file import is fine.)

- [ ] **Step 4: Verify build + lint (no unit test — these paths redirect/throw-on-failure and are covered manually in Task 6)**

Run: `pnpm exec tsc --noEmit --pretty false`
Expected: no errors.
Run: `pnpm exec eslint src/app/crm/actions.ts src/lib/lead-ingestion/persistence.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/crm/actions.ts src/lib/lead-ingestion/persistence.ts
git commit -m "feat(brain): mirror CRM + lead writes into the Brain (best-effort)"
```

---

## Task 5: Operator backfill — action + Brain UI button

**Files:**
- Modify: `src/app/brain/actions.ts`
- Modify: `src/app/brain/_components/brain-shell.tsx`

- [ ] **Step 1: Add the server action**

In `src/app/brain/actions.ts` (follow the file's existing `"use server"` + `requireOperator()` pattern), add:

```ts
import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/auth/operator";
import { resyncCrmIntoBrain } from "@/lib/brain-ingestion/sync";

export async function resyncCrmIntoBrainAction(): Promise<{ ok: boolean; message: string }> {
  await requireOperator();
  const result = await resyncCrmIntoBrain();
  if (!result.ok) return { ok: false, message: "Supabase isn't configured." };
  revalidatePath("/brain");
  return { ok: true, message: `Synced ${result.synced} CRM records into the Brain${result.errors ? ` (${result.errors} skipped)` : ""}.` };
}
```

- [ ] **Step 2: Add the button**

In the Brain operator controls (within `brain-shell.tsx` or the operator bar it renders), add a client button that calls `resyncCrmIntoBrainAction` and surfaces the returned message via the existing `ActionFeedback`/toast pattern used on the page. Label: **"Sync CRM into Brain"**. Match the existing button styling (`page-header.tsx` primitives / `DESIGN.md`) — no new component if an existing button primitive fits.

- [ ] **Step 3: Verify build + lint**

Run: `pnpm exec tsc --noEmit --pretty false`
Expected: no errors.
Run: `pnpm exec eslint src/app/brain/actions.ts src/app/brain/_components/brain-shell.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/brain/actions.ts src/app/brain/_components/brain-shell.tsx
git commit -m "feat(brain): operator 'Sync CRM into Brain' backfill action + button"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS (including the new domain, persistence, and sync tests).

- [ ] **Step 2: Typecheck + lint changed files**

Run: `pnpm exec tsc --noEmit --pretty false`
Run: `pnpm exec eslint src/domain/brain-ingestion.ts src/lib/brain-ingestion/sync.ts src/lib/knowledge-graph/persistence.ts src/app/crm/actions.ts src/app/brain/actions.ts`
Expected: no errors. (Note: `pnpm lint` unscoped scans vendored files — scope to changed files.)

- [ ] **Step 3: Manual smoke (requires Supabase env vars + a signed-in operator)**

1. `pnpm dev`.
2. Go to `/crm/companies`, create a company. Open `/brain` → a `crm_company` node for it appears (label = company name).
3. Edit the company's name in CRM → the SAME Brain node updates (no duplicate).
4. Click **Sync CRM into Brain** → message reports the count; pre-existing CRM rows now have nodes.
5. In Arc chat, ask about a company you just added → Arc's recall surfaces it (semantic match), confirming the embedding path.

- [ ] **Step 4: Final commit (if any docs/notes changed)**

```bash
git add -A
git commit -m "chore(brain): CRM → Brain ingestion slice 1 complete"
```

---

## Self-review notes

- **Spec coverage:** ingestion module → Tasks 1+3; idempotent upsert (no migration) → Task 2; re-embed-on-change → Tasks 1 (hash) + 2; hook write paths → Task 4; backfill → Task 5 (action+button, superseding the `.mjs` script); pure/tested summary builders → Task 1; org-scoping → every read/write carries `orgId`. Workspace bug intentionally excluded.
- **Jobs/outcomes:** no in-app single-record write path and no `getJob`/`getOutcome` repo, so they are ingested only via `resyncCrmIntoBrain` (Task 5), which reads them with `listX`-equivalent raw selects. `syncRecordToBrain` supports them too (raw select by id) if a write path lands later.
- **Type consistency:** `CrmIngestTable`, `CRM_NODE_KINDS`, `crmNodeKey`, `embedHash`, `buildNodeInputForCrmRow`, `upsertReferenceNode`, `syncCrmRowToBrain`, `syncRecordToBrain`, `resyncCrmIntoBrain` names are used identically across tasks.
- **Verify before claiming done:** Task 6 gates on `pnpm test` + tsc + a real browser smoke, per verification-before-completion.
