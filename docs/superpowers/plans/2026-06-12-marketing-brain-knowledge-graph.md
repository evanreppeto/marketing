# Marketing Brain — Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a property-graph "marketing brain" (knowledge_nodes + knowledge_edges) that Hermes/Mark reads and writes as durable memory, with a tiered trust model gating outbound-governing knowledge behind operator approval.

**Architecture:** Generic node/edge overlay in Supabase that references existing CRM/campaign rows instead of copying them. Pure validation + trust logic in `src/domain/knowledge-graph.ts`; persistence + read-model in `src/lib/knowledge-graph/`; bearer-gated Hermes write/query API; an operator `/brain` page (curation list + approval queue). Follows the existing vault/campaigns/interactions reference shape exactly.

**Tech Stack:** Next.js 16 (App Router, server components + `"use server"` actions), React 19, Supabase (service-role admin client, RLS as defense-in-depth), TypeScript, Vitest. Package manager **pnpm**.

**Spec:** `docs/superpowers/specs/2026-06-12-marketing-brain-knowledge-graph-design.md`

**Conventions to honor (from CLAUDE.md + repo memory):**
- `src/domain/` is pure (no I/O), unit-tested in `src/domain/__tests__/`, re-exported via `src/domain/index.ts` — import from `@/domain`.
- Guard every persistence call with `isSupabaseAdminConfigured()`; org-scope writes via `getCurrentOrgId()` (`@/lib/auth/org`).
- `pnpm lint` is eslint-only and scans vendored files (~31k noise) — scope it to changed files; **only `pnpm build` catches type errors**, so the typed client requires `database.types.ts` updates.
- Run a single test file with `pnpm test path/to/file.test.ts`.
- DESIGN.md: Command Charcoal / Canvas White / Restoration Red; no emojis; no equal 3-column rows. `PageHeader` renders title-first (the `eyebrow` prop is ignored — don't add kickers).
- The new migration must be applied to prod Supabase **manually** (Vercel deploy does not run migrations).

---

## File Structure

**Create:**
- `supabase/migrations/20260612210000_marketing_brain_knowledge_graph.sql` — enum + 2 tables + indexes + RLS + grants + triggers.
- `src/domain/knowledge-graph.ts` — pure vocabulary, validation, trust logic.
- `src/domain/__tests__/knowledge-graph.test.ts` — domain unit tests.
- `src/lib/knowledge-graph/persistence.ts` — create/upsert/approve/reject/archive node & edge.
- `src/lib/knowledge-graph/persistence.test.ts` — persistence unit tests.
- `src/lib/knowledge-graph/read-model.ts` — list/get/queue/summary/graph reads.
- `src/lib/knowledge-graph/read-model.test.ts` — read-model unit tests.
- `src/lib/hermes-api/brain.ts` — Hermes-facing create-node / create-edge / query logic.
- `src/lib/hermes-api/__tests__/brain.test.ts` — Hermes API logic tests.
- `src/app/api/v1/hermes/brain/nodes/route.ts` — `POST` create/upsert node.
- `src/app/api/v1/hermes/brain/edges/route.ts` — `POST` create edge.
- `src/app/api/v1/hermes/brain/query/route.ts` — `POST` query the brain.
- `src/app/brain/page.tsx` — operator curation + approval page.
- `src/app/brain/actions.ts` — `"use server"` operator actions.
- `src/app/brain/_components/approval-queue.tsx` — proposed-node cards with approve/reject.
- `src/app/brain/_components/brain-browser.tsx` — filterable node list + detail.
- `scripts/seed-brain.mjs` — seed personas + starter brand facts.

**Modify:**
- `src/domain/index.ts` — re-export `./knowledge-graph`.
- `src/lib/supabase/database.types.ts` — add `knowledge_nodes`, `knowledge_edges` Row/Insert/Update + `knowledge_trust_tier` enum.
- `src/app/_data/growth-engine.ts` — add `{ label: "Brain", href: "/brain", icon: "agents" }` to `navItems`.
- `package.json` — add `"seed:brain": "node scripts/seed-brain.mjs"`.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260612210000_marketing_brain_knowledge_graph.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260612210000_marketing_brain_knowledge_graph.sql`:

```sql
-- Marketing Brain knowledge graph.
-- Generic property-graph overlay for Hermes/Mark's durable marketing memory:
-- knowledge_nodes (brand facts, personas, proof, learnings, signals) + typed
-- knowledge_edges. Nodes REFERENCE existing typed rows (ref_table/ref_id) rather
-- than copying them, so the CRM/campaign tables stay the system of record.
-- `kind` and `relation` are app-validated text (vocabulary owned by the app
-- layer, unit-tested) — only the small, stable trust lifecycle is a DB enum.
-- Isolation is enforced in the app layer (service_role bypasses RLS); the RLS
-- policies below are defense-in-depth, matching crm_notes/crm_tasks.

create type public.knowledge_trust_tier as enum (
  'observed', 'proposed', 'trusted', 'rejected', 'archived'
);

-- Gated kinds (kept in sync with GATED_NODE_KINDS in src/domain/knowledge-graph.ts):
--   brand_fact, messaging_angle, cta, proof_point
-- A trusted node of a gated kind must carry an approver.
create table public.knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (length(btrim(kind)) > 0),
  key text,
  label text not null check (length(btrim(label)) > 0),
  body text,
  summary text,
  persona public.persona_mapping,
  trust_tier public.knowledge_trust_tier not null default 'observed',
  confidence integer check (confidence is null or confidence between 0 and 100),
  ref_table text,
  ref_id uuid,
  source text,
  source_reference text,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  tags text[] not null default '{}'::text[],
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_nodes_persona_not_unassigned_check
    check (persona is null or persona <> 'unassigned_persona'),
  constraint knowledge_nodes_ref_pairing_check
    check ((ref_table is null) = (ref_id is null)),
  constraint knowledge_nodes_gated_trust_check check (
    not (
      trust_tier = 'trusted'
      and kind in ('brand_fact', 'messaging_angle', 'cta', 'proof_point')
      and approved_by is null
    )
  )
);

create unique index knowledge_nodes_org_kind_key_unique_idx
  on public.knowledge_nodes (org_id, kind, key)
  where key is not null;
create index knowledge_nodes_kind_idx on public.knowledge_nodes (org_id, kind);
create index knowledge_nodes_trust_tier_idx on public.knowledge_nodes (org_id, trust_tier);
create index knowledge_nodes_persona_idx on public.knowledge_nodes (org_id, persona);
create index knowledge_nodes_ref_idx on public.knowledge_nodes (ref_table, ref_id)
  where ref_id is not null;
create index knowledge_nodes_tags_idx on public.knowledge_nodes using gin (tags);

create trigger knowledge_nodes_set_updated_at
  before update on public.knowledge_nodes
  for each row execute function public.set_updated_at();

create table public.knowledge_edges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  to_node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  relation text not null check (length(btrim(relation)) > 0),
  weight real,
  trust_tier public.knowledge_trust_tier not null default 'observed',
  source text,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_edges_no_self_loop check (from_node_id <> to_node_id)
);

create unique index knowledge_edges_unique_idx
  on public.knowledge_edges (from_node_id, relation, to_node_id);
create index knowledge_edges_from_idx on public.knowledge_edges (from_node_id);
create index knowledge_edges_to_idx on public.knowledge_edges (to_node_id);
create index knowledge_edges_relation_idx on public.knowledge_edges (org_id, relation);

create trigger knowledge_edges_set_updated_at
  before update on public.knowledge_edges
  for each row execute function public.set_updated_at();

-- RLS (defense-in-depth; service_role bypasses).
alter table public.knowledge_nodes enable row level security;
alter table public.knowledge_edges enable row level security;

create policy knowledge_nodes_current_org on public.knowledge_nodes
  for all to authenticated
  using (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org', true), '')::uuid);

create policy knowledge_edges_current_org on public.knowledge_edges
  for all to authenticated
  using (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org', true), '')::uuid);

-- Grants (match existing data-API role grants).
grant select, insert, update, delete on public.knowledge_nodes to service_role;
grant select, insert, update, delete on public.knowledge_edges to service_role;
grant select on public.knowledge_nodes, public.knowledge_edges to anon, authenticated;
```

- [ ] **Step 2: Sanity-check the SQL is internally consistent**

Verify by reading: the gated-kind list in `knowledge_nodes_gated_trust_check` matches the four kinds the design names (`brand_fact`, `messaging_angle`, `cta`, `proof_point`); `set_updated_at` and `organizations` and `persona_mapping` already exist (they are referenced by earlier migrations — confirm with):

Run: `pnpm test --silent 2>$null; rg -n "function public.set_updated_at|create type public.persona_mapping|create table public.organizations" supabase/migrations`
Expected: each referenced object is defined in an earlier migration file.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612210000_marketing_brain_knowledge_graph.sql
git commit -m "feat(brain): knowledge-graph migration (nodes, edges, trust tiers)"
```

> NOTE: This migration must be applied to the production Supabase DB manually after merge — the Vercel deploy does not run migrations.

---

## Task 2: Add database types

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

The typed admin client (`getSupabaseAdminClient()` returns `SupabaseClient<Database>`) only allows `.from("knowledge_nodes")` if the table is declared here. `pnpm lint` will NOT catch a missing table — `pnpm build` will. Add the two tables and the enum.

- [ ] **Step 1: Add the two table types**

In `src/lib/supabase/database.types.ts`, inside `Database["public"]["Tables"]` (add alphabetically near other `k`/`knowledge`-style entries; placement is cosmetic), add:

```ts
      knowledge_nodes: {
        Row: {
          id: string;
          org_id: string;
          kind: string;
          key: string | null;
          label: string;
          body: string | null;
          summary: string | null;
          persona: Database["public"]["Enums"]["persona_mapping"] | null;
          trust_tier: Database["public"]["Enums"]["knowledge_trust_tier"];
          confidence: number | null;
          ref_table: string | null;
          ref_id: string | null;
          source: string | null;
          source_reference: string | null;
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          tags: string[];
          props: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          kind: string;
          key?: string | null;
          label: string;
          body?: string | null;
          summary?: string | null;
          persona?: Database["public"]["Enums"]["persona_mapping"] | null;
          trust_tier?: Database["public"]["Enums"]["knowledge_trust_tier"];
          confidence?: number | null;
          ref_table?: string | null;
          ref_id?: string | null;
          source?: string | null;
          source_reference?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          tags?: string[];
          props?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          kind?: string;
          key?: string | null;
          label?: string;
          body?: string | null;
          summary?: string | null;
          persona?: Database["public"]["Enums"]["persona_mapping"] | null;
          trust_tier?: Database["public"]["Enums"]["knowledge_trust_tier"];
          confidence?: number | null;
          ref_table?: string | null;
          ref_id?: string | null;
          source?: string | null;
          source_reference?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          tags?: string[];
          props?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      knowledge_edges: {
        Row: {
          id: string;
          org_id: string;
          from_node_id: string;
          to_node_id: string;
          relation: string;
          weight: number | null;
          trust_tier: Database["public"]["Enums"]["knowledge_trust_tier"];
          source: string | null;
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          props: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          from_node_id: string;
          to_node_id: string;
          relation: string;
          weight?: number | null;
          trust_tier?: Database["public"]["Enums"]["knowledge_trust_tier"];
          source?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          props?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          from_node_id?: string;
          to_node_id?: string;
          relation?: string;
          weight?: number | null;
          trust_tier?: Database["public"]["Enums"]["knowledge_trust_tier"];
          source?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          props?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 2: Add the enum**

Find `Database["public"]["Enums"]` and add (alongside the existing enums like `persona_mapping`):

```ts
      knowledge_trust_tier: "observed" | "proposed" | "trusted" | "rejected" | "archived";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: build succeeds (no type errors introduced by the new declarations). If the build is slow/unrelated-failing, at minimum confirm no error mentions `knowledge_nodes`/`knowledge_edges`/`knowledge_trust_tier`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat(brain): add knowledge-graph tables to Supabase types"
```

---

## Task 3: Domain module (pure logic, TDD)

**Files:**
- Create: `src/domain/knowledge-graph.ts`
- Test: `src/domain/__tests__/knowledge-graph.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/knowledge-graph.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  GATED_NODE_KINDS,
  isGatedKind,
  resolveInitialTrustTier,
  resolveDecisionTier,
  validateNodeInput,
  validateEdgeInput,
} from "../knowledge-graph";

describe("isGatedKind", () => {
  it("flags the outbound-governing kinds", () => {
    expect(GATED_NODE_KINDS).toContain("brand_fact");
    expect(isGatedKind("brand_fact")).toBe(true);
    expect(isGatedKind("cta")).toBe(true);
    expect(isGatedKind("learning")).toBe(false);
    expect(isGatedKind("persona")).toBe(false);
  });
});

describe("resolveInitialTrustTier", () => {
  it("trusts everything an operator creates", () => {
    expect(resolveInitialTrustTier({ kind: "brand_fact", createdBy: "operator" })).toBe("trusted");
    expect(resolveInitialTrustTier({ kind: "learning", createdBy: "operator" })).toBe("trusted");
  });
  it("proposes gated kinds Mark creates", () => {
    expect(resolveInitialTrustTier({ kind: "brand_fact", createdBy: "mark" })).toBe("proposed");
    expect(resolveInitialTrustTier({ kind: "cta", createdBy: "mark" })).toBe("proposed");
  });
  it("lets Mark observe non-gated kinds freely", () => {
    expect(resolveInitialTrustTier({ kind: "learning", createdBy: "mark" })).toBe("observed");
    expect(resolveInitialTrustTier({ kind: "signal", createdBy: "mark" })).toBe("observed");
  });
});

describe("resolveDecisionTier", () => {
  it("approves a proposed node to trusted", () => {
    expect(resolveDecisionTier("proposed", "approve")).toEqual({ ok: true, value: "trusted" });
  });
  it("rejects a proposed node", () => {
    expect(resolveDecisionTier("proposed", "reject")).toEqual({ ok: true, value: "rejected" });
  });
  it("refuses to decide on a node that is not proposed", () => {
    const result = resolveDecisionTier("trusted", "approve");
    expect(result.ok).toBe(false);
  });
});

describe("validateNodeInput", () => {
  it("accepts a minimal valid node", () => {
    const result = validateNodeInput({ kind: "brand_fact", label: "We answer 24/7" });
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ kind: "brand_fact", label: "We answer 24/7" }),
    });
  });
  it("rejects an unknown kind", () => {
    expect(validateNodeInput({ kind: "nonsense", label: "x" }).ok).toBe(false);
  });
  it("rejects an empty label", () => {
    expect(validateNodeInput({ kind: "learning", label: "  " }).ok).toBe(false);
  });
  it("rejects the internal-only persona", () => {
    expect(validateNodeInput({ kind: "persona", label: "p", persona: "unassigned_persona" }).ok).toBe(false);
  });
  it("requires ref_table and ref_id together", () => {
    expect(validateNodeInput({ kind: "crm_ref", label: "Acme", refTable: "companies" }).ok).toBe(false);
    expect(validateNodeInput({ kind: "crm_ref", label: "Acme", refId: "abc" }).ok).toBe(false);
  });
  it("rejects an un-referenceable ref_table", () => {
    expect(
      validateNodeInput({ kind: "crm_ref", label: "x", refTable: "secrets", refId: "abc" }).ok,
    ).toBe(false);
  });
  it("accepts a valid ref pair", () => {
    const result = validateNodeInput({ kind: "crm_ref", label: "Acme", refTable: "companies", refId: "abc" });
    expect(result.ok).toBe(true);
  });
  it("rejects out-of-range confidence", () => {
    expect(validateNodeInput({ kind: "learning", label: "x", confidence: 140 }).ok).toBe(false);
  });
});

describe("validateEdgeInput", () => {
  it("accepts a known relation between two distinct nodes", () => {
    const result = validateEdgeInput({ fromNodeId: "a", toNodeId: "b", relation: "proves" });
    expect(result.ok).toBe(true);
  });
  it("rejects an unknown relation", () => {
    expect(validateEdgeInput({ fromNodeId: "a", toNodeId: "b", relation: "frobnicates" }).ok).toBe(false);
  });
  it("rejects a self-loop", () => {
    expect(validateEdgeInput({ fromNodeId: "a", toNodeId: "a", relation: "proves" }).ok).toBe(false);
  });
  it("rejects missing endpoints", () => {
    expect(validateEdgeInput({ fromNodeId: "", toNodeId: "b", relation: "proves" }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/domain/__tests__/knowledge-graph.test.ts`
Expected: FAIL — cannot resolve module `../knowledge-graph`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/knowledge-graph.ts`:

```ts
/**
 * Marketing Brain — pure vocabulary, validation, and trust logic for the
 * knowledge graph. No I/O. The graph's vocabulary (node kinds, edge relations)
 * and its trust lifecycle live here so they stay deterministic and unit-testable
 * (the DB stores `kind`/`relation` as plain text validated against these lists).
 */

export const NODE_KINDS = [
  "brand_fact",
  "persona",
  "segment",
  "service",
  "proof_point",
  "messaging_angle",
  "cta",
  "asset_ref",
  "learning",
  "signal",
  "crm_ref",
  "campaign_ref",
  "other",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Kinds whose content can govern outbound copy — gated behind operator approval. */
export const GATED_NODE_KINDS = ["brand_fact", "messaging_angle", "cta", "proof_point"] as const;
export type GatedNodeKind = (typeof GATED_NODE_KINDS)[number];

export const EDGE_RELATIONS = [
  "responds_to",
  "governs",
  "proves",
  "targets",
  "relates_to",
  "learned_from",
  "used_in",
  "belongs_to",
  "competes_with",
] as const;
export type EdgeRelation = (typeof EDGE_RELATIONS)[number];

export const TRUST_TIERS = ["observed", "proposed", "trusted", "rejected", "archived"] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

/** Existing typed tables a node may reference (instead of copying). */
export const REFERENCEABLE_TABLES = [
  "companies",
  "contacts",
  "properties",
  "leads",
  "jobs",
  "outcomes",
  "campaigns",
  "campaign_assets",
] as const;
export type ReferenceableTable = (typeof REFERENCEABLE_TABLES)[number];

export type NodeAuthor = "mark" | "operator";
export type ApprovalDecision = "approve" | "reject";

export type KnowledgeNodeInput = {
  kind: NodeKind;
  label: string;
  body?: string | null;
  summary?: string | null;
  persona?: string | null;
  confidence?: number | null;
  key?: string | null;
  refTable?: ReferenceableTable | null;
  refId?: string | null;
  source?: string | null;
  sourceReference?: string | null;
  tags?: string[];
  props?: Record<string, unknown>;
};

export type KnowledgeEdgeInput = {
  fromNodeId: string;
  toNodeId: string;
  relation: EdgeRelation;
  weight?: number | null;
  source?: string | null;
  props?: Record<string, unknown>;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const NODE_KIND_SET = new Set<string>(NODE_KINDS);
const GATED_KIND_SET = new Set<string>(GATED_NODE_KINDS);
const RELATION_SET = new Set<string>(EDGE_RELATIONS);
const REFERENCEABLE_SET = new Set<string>(REFERENCEABLE_TABLES);

export function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === "string" && NODE_KIND_SET.has(value);
}

export function isGatedKind(value: unknown): value is GatedNodeKind {
  return typeof value === "string" && GATED_KIND_SET.has(value);
}

export function isEdgeRelation(value: unknown): value is EdgeRelation {
  return typeof value === "string" && RELATION_SET.has(value);
}

/**
 * Initial trust tier for a new node. Operator writes are trusted immediately;
 * Mark's gated kinds enter the approval queue (proposed); Mark's other kinds are
 * recorded as observed (usable internally, flagged as not operator-verified).
 */
export function resolveInitialTrustTier(args: { kind: NodeKind; createdBy: NodeAuthor }): TrustTier {
  if (args.createdBy === "operator") return "trusted";
  return isGatedKind(args.kind) ? "proposed" : "observed";
}

/** Transition for an operator decision on a proposed node/edge. */
export function resolveDecisionTier(current: TrustTier, decision: ApprovalDecision): ParseResult<TrustTier> {
  if (current !== "proposed") {
    return { ok: false, error: "Only a proposed item can be approved or rejected." };
  }
  return { ok: true, value: decision === "approve" ? "trusted" : "rejected" };
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateNodeInput(raw: {
  kind: unknown;
  label: unknown;
  body?: unknown;
  summary?: unknown;
  persona?: unknown;
  confidence?: unknown;
  key?: unknown;
  refTable?: unknown;
  refId?: unknown;
  source?: unknown;
  sourceReference?: unknown;
  tags?: unknown;
  props?: unknown;
}): ParseResult<KnowledgeNodeInput> {
  if (!isNodeKind(raw.kind)) return { ok: false, error: "Unknown node kind." };
  const label = trimmed(raw.label);
  if (!label) return { ok: false, error: "A node needs a label." };

  const persona = raw.persona == null || raw.persona === "" ? null : trimmed(raw.persona);
  if (persona === "unassigned_persona") {
    return { ok: false, error: "unassigned_persona is internal-only and cannot be stored." };
  }

  const hasTable = raw.refTable != null && raw.refTable !== "";
  const hasId = raw.refId != null && raw.refId !== "";
  if (hasTable !== hasId) {
    return { ok: false, error: "A reference needs both a table and an id." };
  }
  if (hasTable && !REFERENCEABLE_SET.has(trimmed(raw.refTable))) {
    return { ok: false, error: "That table cannot be referenced." };
  }

  let confidence: number | null = null;
  if (raw.confidence != null && raw.confidence !== "") {
    const n = Number(raw.confidence);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { ok: false, error: "Confidence must be between 0 and 100." };
    }
    confidence = Math.round(n);
  }

  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [];
  const props =
    raw.props && typeof raw.props === "object" && !Array.isArray(raw.props)
      ? (raw.props as Record<string, unknown>)
      : {};

  return {
    ok: true,
    value: {
      kind: raw.kind,
      label,
      body: trimmed(raw.body) || null,
      summary: trimmed(raw.summary) || null,
      persona: persona || null,
      confidence,
      key: trimmed(raw.key) || null,
      refTable: hasTable ? (trimmed(raw.refTable) as ReferenceableTable) : null,
      refId: hasId ? trimmed(raw.refId) : null,
      source: trimmed(raw.source) || null,
      sourceReference: trimmed(raw.sourceReference) || null,
      tags,
      props,
    },
  };
}

export function validateEdgeInput(raw: {
  fromNodeId: unknown;
  toNodeId: unknown;
  relation: unknown;
  weight?: unknown;
  source?: unknown;
  props?: unknown;
}): ParseResult<KnowledgeEdgeInput> {
  const fromNodeId = trimmed(raw.fromNodeId);
  const toNodeId = trimmed(raw.toNodeId);
  if (!fromNodeId || !toNodeId) return { ok: false, error: "An edge needs two node ids." };
  if (fromNodeId === toNodeId) return { ok: false, error: "An edge cannot link a node to itself." };
  if (!isEdgeRelation(raw.relation)) return { ok: false, error: "Unknown relation." };

  let weight: number | null = null;
  if (raw.weight != null && raw.weight !== "") {
    const n = Number(raw.weight);
    if (!Number.isFinite(n)) return { ok: false, error: "Weight must be a number." };
    weight = n;
  }
  const props =
    raw.props && typeof raw.props === "object" && !Array.isArray(raw.props)
      ? (raw.props as Record<string, unknown>)
      : {};

  return {
    ok: true,
    value: {
      fromNodeId,
      toNodeId,
      relation: raw.relation,
      weight,
      source: trimmed(raw.source) || null,
      props,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/domain/__tests__/knowledge-graph.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Re-export from the domain barrel**

In `src/domain/index.ts`, add a line after the other exports:

```ts
export * from "./knowledge-graph";
```

- [ ] **Step 6: Commit**

```bash
git add src/domain/knowledge-graph.ts src/domain/__tests__/knowledge-graph.test.ts src/domain/index.ts
git commit -m "feat(brain): domain vocabulary, validation, and trust logic"
```

---

## Task 4: Persistence layer (TDD)

**Files:**
- Create: `src/lib/knowledge-graph/persistence.ts`
- Test: `src/lib/knowledge-graph/persistence.test.ts`

The Mark-facing create paths must NEVER accept a caller-supplied trusted tier for gated kinds — the tier is always derived from `resolveInitialTrustTier`. Functions accept an injectable `client` and `orgId` for testability (default to the admin client + `getCurrentOrgId()`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/knowledge-graph/persistence.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { createNode, createEdge, decideNode } from "./persistence";

const ORG = "org-1";

function insertPayload(supabase: ReturnType<typeof createSupabaseQueryMock>) {
  const call = supabase.calls.find(([method]) => method === "insert") as
    | [string, Record<string, unknown>]
    | undefined;
  return call?.[1];
}

describe("createNode", () => {
  it("forces Mark's brand_fact to proposed and stamps created_by", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: { id: "n-1" }, error: null } });

    const result = await createNode(
      { kind: "brand_fact", label: "We answer 24/7" },
      { client: supabase as never, orgId: ORG, createdBy: "mark" },
    );

    expect(result).toEqual({ ok: true, id: "n-1" });
    const payload = insertPayload(supabase)!;
    expect(payload.trust_tier).toBe("proposed");
    expect(payload.created_by).toBe("mark");
    expect(payload.org_id).toBe(ORG);
    expect(payload.approved_by).toBeNull();
  });

  it("records Mark's learning as observed", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: { id: "n-2" }, error: null } });
    await createNode(
      { kind: "learning", label: "Emergency persona replies fastest by SMS" },
      { client: supabase as never, orgId: ORG, createdBy: "mark" },
    );
    expect(insertPayload(supabase)!.trust_tier).toBe("observed");
  });

  it("trusts an operator-created brand_fact and stamps the approver", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: { id: "n-3" }, error: null } });
    await createNode(
      { kind: "brand_fact", label: "IICRC certified" },
      { client: supabase as never, orgId: ORG, createdBy: "operator", actor: "Operator" },
    );
    const payload = insertPayload(supabase)!;
    expect(payload.trust_tier).toBe("trusted");
    expect(payload.approved_by).toBe("Operator");
  });

  it("rejects invalid input before touching Supabase", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: null, error: null } });
    const result = await createNode(
      { kind: "nonsense", label: "" } as never,
      { client: supabase as never, orgId: ORG, createdBy: "mark" },
    );
    expect(result.ok).toBe(false);
    expect(supabase.calls.some(([m]) => m === "insert")).toBe(false);
  });
});

describe("createEdge", () => {
  it("inserts a validated edge as observed for Mark", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_edges: { data: { id: "e-1" }, error: null } });
    const result = await createEdge(
      { fromNodeId: "a", toNodeId: "b", relation: "proves" },
      { client: supabase as never, orgId: ORG, createdBy: "mark" },
    );
    expect(result).toEqual({ ok: true, id: "e-1" });
    const payload = insertPayload(supabase)!;
    expect(payload.relation).toBe("proves");
    expect(payload.trust_tier).toBe("observed");
  });

  it("refuses a self-loop", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_edges: { data: null, error: null } });
    const result = await createEdge(
      { fromNodeId: "a", toNodeId: "a", relation: "proves" },
      { client: supabase as never, orgId: ORG, createdBy: "mark" },
    );
    expect(result.ok).toBe(false);
    expect(supabase.calls.some(([m]) => m === "insert")).toBe(false);
  });
});

describe("decideNode", () => {
  it("approves a proposed node to trusted with an approver stamp", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: { data: { id: "n-1", trust_tier: "proposed" }, error: null },
    });
    const result = await decideNode("n-1", "approve", {
      client: supabase as never,
      orgId: ORG,
      actor: "Operator",
    });
    expect(result.ok).toBe(true);
    const updateCall = supabase.calls.find(([m]) => m === "update") as [string, Record<string, unknown>];
    expect(updateCall[1].trust_tier).toBe("trusted");
    expect(updateCall[1].approved_by).toBe("Operator");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/knowledge-graph/persistence.test.ts`
Expected: FAIL — cannot resolve `./persistence`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/knowledge-graph/persistence.ts`:

```ts
import {
  type ApprovalDecision,
  type KnowledgeEdgeInput,
  type KnowledgeNodeInput,
  type NodeAuthor,
  resolveDecisionTier,
  resolveInitialTrustTier,
  validateEdgeInput,
  validateNodeInput,
} from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type TypedSupabaseClient, getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type WriteResult = { ok: true; id: string } | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured, so nothing was written.";

type WriteDeps = {
  client?: TypedSupabaseClient;
  orgId?: string;
  /** "mark" gates gated kinds to proposed; "operator" trusts immediately. */
  createdBy?: NodeAuthor;
  /** Display name stamped as approver when an operator creates a trusted node. */
  actor?: string;
};

async function resolveDeps(deps: WriteDeps): Promise<{ client: TypedSupabaseClient; orgId: string } | null> {
  if (deps.client && deps.orgId) return { client: deps.client, orgId: deps.orgId };
  if (!isSupabaseAdminConfigured()) return null;
  return { client: deps.client ?? getSupabaseAdminClient(), orgId: deps.orgId ?? (await getCurrentOrgId()) };
}

export async function createNode(input: KnowledgeNodeInput, deps: WriteDeps = {}): Promise<WriteResult> {
  const parsed = validateNodeInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;
  const createdBy = deps.createdBy ?? "mark";
  const value = parsed.value;
  // Tier is ALWAYS derived — never trusted from the caller. Mark cannot self-approve.
  const trustTier = resolveInitialTrustTier({ kind: value.kind, createdBy });
  const approvedBy = trustTier === "trusted" && createdBy === "operator" ? deps.actor ?? "Operator" : null;

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
      source: value.source ?? createdBy,
      source_reference: value.sourceReference,
      created_by: createdBy,
      approved_by: approvedBy,
      approved_at: approvedBy ? new Date().toISOString() : null,
      tags: value.tags ?? [],
      props: (value.props ?? {}) as never,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/** Insert or update by the (org, kind, key) natural key when `key` is provided. */
export async function upsertNodeByKey(input: KnowledgeNodeInput, deps: WriteDeps = {}): Promise<WriteResult> {
  if (!input.key) return createNode(input, deps);
  const parsed = validateNodeInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;

  const existing = await client
    .from("knowledge_nodes")
    .select("id")
    .eq("org_id", orgId)
    .eq("kind", parsed.value.kind)
    .eq("key", input.key)
    .maybeSingle<{ id: string }>();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return createNode(input, deps);

  const { data, error } = await client
    .from("knowledge_nodes")
    .update({
      label: parsed.value.label,
      body: parsed.value.body,
      summary: parsed.value.summary,
      confidence: parsed.value.confidence,
      tags: parsed.value.tags ?? [],
      props: (parsed.value.props ?? {}) as never,
    })
    .eq("id", existing.data.id)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function createEdge(input: KnowledgeEdgeInput, deps: WriteDeps = {}): Promise<WriteResult> {
  const parsed = validateEdgeInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;
  const createdBy = deps.createdBy ?? "mark";
  const trustTier = createdBy === "operator" ? "trusted" : "observed";

  const { data, error } = await client
    .from("knowledge_edges")
    .insert({
      org_id: orgId,
      from_node_id: parsed.value.fromNodeId,
      to_node_id: parsed.value.toNodeId,
      relation: parsed.value.relation,
      weight: parsed.value.weight,
      trust_tier: trustTier,
      source: parsed.value.source ?? createdBy,
      created_by: createdBy,
      approved_by: createdBy === "operator" ? deps.actor ?? "Operator" : null,
      approved_at: createdBy === "operator" ? new Date().toISOString() : null,
      props: (parsed.value.props ?? {}) as never,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/** Approve or reject a proposed node (operator only). */
export async function decideNode(
  nodeId: string,
  decision: ApprovalDecision,
  deps: WriteDeps & { actor?: string } = {},
): Promise<WriteResult> {
  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;

  const current = await client
    .from("knowledge_nodes")
    .select("id,trust_tier")
    .eq("id", nodeId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; trust_tier: string }>();
  if (current.error) return { ok: false, error: current.error.message };
  if (!current.data) return { ok: false, error: "Node not found." };

  const next = resolveDecisionTier(current.data.trust_tier as never, decision);
  if (!next.ok) return { ok: false, error: next.error };

  const actor = deps.actor ?? "Operator";
  const { data, error } = await client
    .from("knowledge_nodes")
    .update({
      trust_tier: next.value,
      approved_by: decision === "approve" ? actor : null,
      approved_at: decision === "approve" ? new Date().toISOString() : null,
    })
    .eq("id", nodeId)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/** Soft-archive a node. */
export async function archiveNode(nodeId: string, deps: WriteDeps = {}): Promise<WriteResult> {
  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;
  const { data, error } = await client
    .from("knowledge_nodes")
    .update({ trust_tier: "archived" })
    .eq("id", nodeId)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/knowledge-graph/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge-graph/persistence.ts src/lib/knowledge-graph/persistence.test.ts
git commit -m "feat(brain): knowledge-graph persistence with trust-tier enforcement"
```

---

## Task 5: Read-model (TDD)

**Files:**
- Create: `src/lib/knowledge-graph/read-model.ts`
- Test: `src/lib/knowledge-graph/read-model.test.ts`

Reads degrade gracefully: when Supabase is unconfigured or unreachable (an AbortError from the resilient fetch), they return an `unavailable` shape instead of throwing.

- [ ] **Step 1: Write the failing test**

Create `src/lib/knowledge-graph/read-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { listNodes, listProposed, brainSummary } from "./read-model";

const NODES = [
  { id: "n-1", kind: "brand_fact", label: "We answer 24/7", trust_tier: "trusted", persona: null },
  { id: "n-2", kind: "brand_fact", label: "Mold draft", trust_tier: "proposed", persona: null },
  { id: "n-3", kind: "learning", label: "SMS wins", trust_tier: "observed", persona: "persona_homeowner_emergency" },
];

describe("listNodes", () => {
  it("returns mapped nodes when live", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: NODES, error: null } });
    const result = await listNodes({}, supabase as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0]).toMatchObject({ id: "n-1", kind: "brand_fact" });
  });

  it("reports unavailable on a Supabase error", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: null, error: { message: "boom" } } });
    const result = await listNodes({}, supabase as never, "org-1");
    expect(result.status).toBe("unavailable");
  });
});

describe("listProposed", () => {
  it("returns only the items awaiting a decision", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: { data: NODES.filter((n) => n.trust_tier === "proposed"), error: null },
    });
    const result = await listProposed(supabase as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.nodes.every((n) => n.trustTier === "proposed")).toBe(true);
  });
});

describe("brainSummary", () => {
  it("counts nodes by kind and tier", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: NODES, error: null } });
    const result = await brainSummary(supabase as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.total).toBe(3);
    expect(result.byTier.trusted).toBe(1);
    expect(result.byTier.proposed).toBe(1);
    expect(result.byKind.brand_fact).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/knowledge-graph/read-model.test.ts`
Expected: FAIL — cannot resolve `./read-model`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/knowledge-graph/read-model.ts`:

```ts
import { type TrustTier } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type TypedSupabaseClient, getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type BrainNode = {
  id: string;
  kind: string;
  label: string;
  body: string | null;
  summary: string | null;
  persona: string | null;
  trustTier: TrustTier;
  confidence: number | null;
  refTable: string | null;
  refId: string | null;
  source: string | null;
  createdBy: string | null;
  createdAt: string | null;
};

export type BrainEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: string;
  weight: number | null;
  trustTier: TrustTier;
};

export type NodeFilters = {
  kind?: string;
  trustTier?: TrustTier;
  persona?: string;
  refTable?: string;
  refId?: string;
  search?: string;
};

type Live<T> = { status: "live" } & T;
type Unavailable = { status: "unavailable"; message: string };

const NODE_COLUMNS =
  "id,kind,label,body,summary,persona,trust_tier,confidence,ref_table,ref_id,source,created_by,created_at";
const EDGE_COLUMNS = "id,from_node_id,to_node_id,relation,weight,trust_tier";

type NodeRow = {
  id: string;
  kind: string;
  label: string;
  body: string | null;
  summary: string | null;
  persona: string | null;
  trust_tier: TrustTier;
  confidence: number | null;
  ref_table: string | null;
  ref_id: string | null;
  source: string | null;
  created_by: string | null;
  created_at: string | null;
};

type EdgeRow = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relation: string;
  weight: number | null;
  trust_tier: TrustTier;
};

function mapNode(row: NodeRow): BrainNode {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    body: row.body,
    summary: row.summary,
    persona: row.persona,
    trustTier: row.trust_tier,
    confidence: row.confidence,
    refTable: row.ref_table,
    refId: row.ref_id,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapEdge(row: EdgeRow): BrainEdge {
  return {
    id: row.id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    relation: row.relation,
    weight: row.weight,
    trustTier: row.trust_tier,
  };
}

async function resolveRead(
  client: TypedSupabaseClient | undefined,
  orgId: string | undefined,
): Promise<{ client: TypedSupabaseClient; orgId: string } | null> {
  if (client && orgId) return { client, orgId };
  if (!isSupabaseAdminConfigured()) return null;
  return { client: client ?? getSupabaseAdminClient(), orgId: orgId ?? (await getCurrentOrgId()) };
}

export async function listNodes(
  filters: NodeFilters = {},
  client?: TypedSupabaseClient,
  orgId?: string,
): Promise<Live<{ nodes: BrainNode[] }> | Unavailable> {
  const resolved = await resolveRead(client, orgId);
  if (!resolved) return { status: "unavailable", message: "Supabase is not configured." };
  try {
    let query = resolved.client
      .from("knowledge_nodes")
      .select(NODE_COLUMNS)
      .eq("org_id", resolved.orgId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (filters.kind) query = query.eq("kind", filters.kind);
    if (filters.trustTier) query = query.eq("trust_tier", filters.trustTier);
    if (filters.persona) query = query.eq("persona", filters.persona);
    if (filters.refTable) query = query.eq("ref_table", filters.refTable);
    if (filters.refId) query = query.eq("ref_id", filters.refId);
    if (filters.search) query = query.ilike("label", `%${filters.search}%`);

    const { data, error } = await query;
    if (error) return { status: "unavailable", message: error.message };
    return { status: "live", nodes: ((data ?? []) as NodeRow[]).map(mapNode) };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Brain is unavailable." };
  }
}

export async function listProposed(
  client?: TypedSupabaseClient,
  orgId?: string,
): Promise<Live<{ nodes: BrainNode[] }> | Unavailable> {
  return listNodes({ trustTier: "proposed" }, client, orgId);
}

export async function getNode(
  nodeId: string,
  client?: TypedSupabaseClient,
  orgId?: string,
): Promise<Live<{ node: BrainNode; edges: BrainEdge[]; neighbors: BrainNode[] }> | Unavailable> {
  const resolved = await resolveRead(client, orgId);
  if (!resolved) return { status: "unavailable", message: "Supabase is not configured." };
  try {
    const node = await resolved.client
      .from("knowledge_nodes")
      .select(NODE_COLUMNS)
      .eq("id", nodeId)
      .eq("org_id", resolved.orgId)
      .maybeSingle<NodeRow>();
    if (node.error) return { status: "unavailable", message: node.error.message };
    if (!node.data) return { status: "unavailable", message: "Node not found." };

    const edges = await resolved.client
      .from("knowledge_edges")
      .select(EDGE_COLUMNS)
      .eq("org_id", resolved.orgId)
      .or(`from_node_id.eq.${nodeId},to_node_id.eq.${nodeId}`)
      .limit(200);
    if (edges.error) return { status: "unavailable", message: edges.error.message };

    const edgeRows = (edges.data ?? []) as EdgeRow[];
    const neighborIds = [
      ...new Set(edgeRows.flatMap((e) => [e.from_node_id, e.to_node_id]).filter((id) => id !== nodeId)),
    ];
    let neighbors: BrainNode[] = [];
    if (neighborIds.length) {
      const neighborRows = await resolved.client
        .from("knowledge_nodes")
        .select(NODE_COLUMNS)
        .eq("org_id", resolved.orgId)
        .in("id", neighborIds);
      if (neighborRows.error) return { status: "unavailable", message: neighborRows.error.message };
      neighbors = ((neighborRows.data ?? []) as NodeRow[]).map(mapNode);
    }

    return { status: "live", node: mapNode(node.data), edges: edgeRows.map(mapEdge), neighbors };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Brain is unavailable." };
  }
}

export async function brainSummary(
  client?: TypedSupabaseClient,
  orgId?: string,
): Promise<
  | Live<{ total: number; byKind: Record<string, number>; byTier: Record<string, number> }>
  | Unavailable
> {
  const all = await listNodes({}, client, orgId);
  if (all.status !== "live") return all;
  const byKind: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  for (const node of all.nodes) {
    byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
    byTier[node.trustTier] = (byTier[node.trustTier] ?? 0) + 1;
  }
  return { status: "live", total: all.nodes.length, byKind, byTier };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/knowledge-graph/read-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge-graph/read-model.ts src/lib/knowledge-graph/read-model.test.ts
git commit -m "feat(brain): knowledge-graph read-model with graceful degradation"
```

---

## Task 6: Hermes API logic (TDD)

**Files:**
- Create: `src/lib/hermes-api/brain.ts`
- Test: `src/lib/hermes-api/__tests__/brain.test.ts`

Thin orchestration over the persistence layer for the API routes. Mark's writes always pass `createdBy: "mark"`. A query helper reads the brain.

- [ ] **Step 1: Write the failing test**

Create `src/lib/hermes-api/__tests__/brain.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { markCreateNode, markCreateEdge } from "../brain";

const ORG = "org-1";

describe("markCreateNode", () => {
  it("creates a brand_fact as proposed (Mark can never self-trust)", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: { id: "n-1" }, error: null } });
    const result = await markCreateNode(
      { kind: "brand_fact", label: "We answer 24/7", trust_tier: "trusted" },
      { client: supabase as never, orgId: ORG },
    );
    expect(result).toEqual({ ok: true, id: "n-1" });
    const insert = supabase.calls.find(([m]) => m === "insert") as [string, Record<string, unknown>];
    expect(insert[1].trust_tier).toBe("proposed");
    expect(insert[1].created_by).toBe("mark");
  });

  it("returns a validation error for an unknown kind", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_nodes: { data: null, error: null } });
    const result = await markCreateNode({ kind: "bogus", label: "x" }, { client: supabase as never, orgId: ORG });
    expect(result.ok).toBe(false);
  });
});

describe("markCreateEdge", () => {
  it("creates a validated edge", async () => {
    const supabase = createSupabaseQueryMock({ knowledge_edges: { data: { id: "e-1" }, error: null } });
    const result = await markCreateEdge(
      { from_node_id: "a", to_node_id: "b", relation: "proves" },
      { client: supabase as never, orgId: ORG },
    );
    expect(result).toEqual({ ok: true, id: "e-1" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/hermes-api/__tests__/brain.test.ts`
Expected: FAIL — cannot resolve `../brain`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/hermes-api/brain.ts`:

```ts
import { type NodeKind, type EdgeRelation } from "@/domain";
import { type TypedSupabaseClient } from "@/lib/supabase/server";
import { createEdge, createNode, type WriteResult } from "@/lib/knowledge-graph/persistence";
import { listNodes, type NodeFilters } from "@/lib/knowledge-graph/read-model";

type ApiDeps = { client?: TypedSupabaseClient; orgId?: string };

/** Mark creates a node — always created_by "mark"; gated kinds are forced to proposed. */
export async function markCreateNode(
  payload: Record<string, unknown>,
  deps: ApiDeps = {},
): Promise<WriteResult> {
  return createNode(
    {
      kind: payload.kind as NodeKind,
      label: payload.label as string,
      body: (payload.body as string) ?? null,
      summary: (payload.summary as string) ?? null,
      persona: (payload.persona as string) ?? null,
      confidence: (payload.confidence as number) ?? null,
      key: (payload.key as string) ?? null,
      refTable: (payload.ref_table as never) ?? null,
      refId: (payload.ref_id as string) ?? null,
      source: (payload.source as string) ?? "mark",
      sourceReference: (payload.source_reference as string) ?? null,
      tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
      props: (payload.props as Record<string, unknown>) ?? {},
    },
    { ...deps, createdBy: "mark" },
  );
}

export async function markCreateEdge(
  payload: Record<string, unknown>,
  deps: ApiDeps = {},
): Promise<WriteResult> {
  return createEdge(
    {
      fromNodeId: payload.from_node_id as string,
      toNodeId: payload.to_node_id as string,
      relation: payload.relation as EdgeRelation,
      weight: (payload.weight as number) ?? null,
      source: (payload.source as string) ?? "mark",
      props: (payload.props as Record<string, unknown>) ?? {},
    },
    { ...deps, createdBy: "mark" },
  );
}

/** Mark reads its brain for reasoning context. */
export async function markQueryBrain(payload: Record<string, unknown>, deps: ApiDeps = {}) {
  const filters: NodeFilters = {
    kind: typeof payload.kind === "string" ? payload.kind : undefined,
    trustTier: typeof payload.trust_tier === "string" ? (payload.trust_tier as never) : undefined,
    persona: typeof payload.persona === "string" ? payload.persona : undefined,
    refTable: typeof payload.ref_table === "string" ? payload.ref_table : undefined,
    refId: typeof payload.ref_id === "string" ? payload.ref_id : undefined,
    search: typeof payload.search === "string" ? payload.search : undefined,
  };
  return listNodes(filters, deps.client, deps.orgId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/hermes-api/__tests__/brain.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hermes-api/brain.ts src/lib/hermes-api/__tests__/brain.test.ts
git commit -m "feat(brain): Hermes API brain logic (create node/edge, query)"
```

---

## Task 7: Hermes API routes

**Files:**
- Create: `src/app/api/v1/hermes/brain/nodes/route.ts`
- Create: `src/app/api/v1/hermes/brain/edges/route.ts`
- Create: `src/app/api/v1/hermes/brain/query/route.ts`

Each route uses the shared `guard` (bearer + Supabase) and `ok`/`fail`/`readJson` helpers from `@/app/api/v1/hermes/_lib/http`, matching `crm/interactions/route.ts`.

- [ ] **Step 1: Write the nodes route**

Create `src/app/api/v1/hermes/brain/nodes/route.ts`:

```ts
import { fail, guard, INVALID_JSON, ok, readJson } from "@/app/api/v1/hermes/_lib/http";
import { markCreateNode } from "@/lib/hermes-api/brain";

/**
 * Mark writes a node into its marketing brain. Gated kinds (brand_fact,
 * messaging_angle, cta, proof_point) are ALWAYS forced to `proposed` — Mark
 * cannot self-approve. No outbound side effects.
 *
 *   POST /api/v1/hermes/brain/nodes
 *   { "kind": "brand_fact", "label": "...", "body": "...", ... }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }

  try {
    const result = await markCreateNode(body as Record<string, unknown>);
    if (!result.ok) return fail("invalid_request", result.error, 400);
    return ok({ id: result.id, kind: (body as Record<string, unknown>).kind }, 201);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to write node.", 502);
  }
}
```

- [ ] **Step 2: Write the edges route**

Create `src/app/api/v1/hermes/brain/edges/route.ts`:

```ts
import { fail, guard, INVALID_JSON, ok, readJson } from "@/app/api/v1/hermes/_lib/http";
import { markCreateEdge } from "@/lib/hermes-api/brain";

/**
 * Mark links two existing brain nodes with a typed relation.
 *
 *   POST /api/v1/hermes/brain/edges
 *   { "from_node_id": "...", "to_node_id": "...", "relation": "proves" }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }

  try {
    const result = await markCreateEdge(body as Record<string, unknown>);
    if (!result.ok) return fail("invalid_request", result.error, 400);
    return ok({ id: result.id }, 201);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to write edge.", 502);
  }
}
```

- [ ] **Step 3: Write the query route**

Create `src/app/api/v1/hermes/brain/query/route.ts`:

```ts
import { fail, guard, INVALID_JSON, ok, readJson } from "@/app/api/v1/hermes/_lib/http";
import { markQueryBrain } from "@/lib/hermes-api/brain";

/**
 * Mark reads its marketing brain for reasoning context.
 *
 *   POST /api/v1/hermes/brain/query
 *   { "kind": "brand_fact", "trust_tier": "trusted", "search": "..." }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = await readJson(request);
  const payload = body === INVALID_JSON || typeof body !== "object" || body === null ? {} : (body as Record<string, unknown>);

  try {
    const result = await markQueryBrain(payload);
    if (result.status !== "live") return fail("not_configured", result.message, 503);
    return ok({ nodes: result.nodes }, 200);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to query brain.", 502);
  }
}
```

- [ ] **Step 4: Typecheck the routes**

Run: `pnpm build`
Expected: build succeeds; no errors referencing the new `brain` routes.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/hermes/brain
git commit -m "feat(brain): Hermes brain API routes (nodes, edges, query)"
```

---

## Task 8: Operator server actions

**Files:**
- Create: `src/app/brain/actions.ts`

Operator-gated mutations: approve/reject proposed nodes, create nodes/edges manually (as trusted operator writes), archive. Mirrors the campaigns/vault action shape — `requireOperator()` + persistence + `revalidatePath`.

- [ ] **Step 1: Write the actions file**

Create `src/app/brain/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { type NodeKind, type EdgeRelation } from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { archiveNode, createEdge, createNode, decideNode } from "@/lib/knowledge-graph/persistence";

export type ActionResult = { ok: true } | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured.";

export async function approveNodeAction(nodeId: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await decideNode(nodeId, "approve", { actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}

export async function rejectNodeAction(nodeId: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await decideNode(nodeId, "reject", { actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}

export async function createNodeAction(input: {
  kind: NodeKind;
  label: string;
  body?: string;
  persona?: string;
}): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await createNode(
    { kind: input.kind, label: input.label, body: input.body ?? null, persona: input.persona ?? null },
    { createdBy: "operator", actor: getOperatorActor() },
  );
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}

export async function createEdgeAction(input: {
  fromNodeId: string;
  toNodeId: string;
  relation: EdgeRelation;
}): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await createEdge(input, { createdBy: "operator", actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}

export async function archiveNodeAction(nodeId: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await archiveNode(nodeId, { actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build`
Expected: build succeeds; no errors referencing `src/app/brain/actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/brain/actions.ts
git commit -m "feat(brain): operator-gated server actions for the brain"
```

---

## Task 9: Operator UI page + components

**Files:**
- Create: `src/app/brain/_components/approval-queue.tsx`
- Create: `src/app/brain/_components/brain-browser.tsx`
- Create: `src/app/brain/page.tsx`

Uses the shared primitives from `src/app/_components/page-header.tsx` (`PageHeader`, `Panel`, `StatusPill`, `EmptyState`). Read the current export signatures of those primitives before writing JSX and match them (props may have evolved). DESIGN.md: no emojis, charcoal/red palette, no equal 3-column rows.

- [ ] **Step 1: Confirm the shared primitive signatures**

Run: `rg -n "export function (PageHeader|Panel|StatusPill|EmptyState)" src/app/_components/page-header.tsx`
Expected: prints each primitive's declaration. Note their exact props (especially `StatusPill` tone values and `Panel`/`PageHeader` required props) and use them as-is below; adjust the JSX in Steps 2-4 if a prop name differs.

- [ ] **Step 2: Write the approval-queue component**

Create `src/app/brain/_components/approval-queue.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { Panel, StatusPill } from "@/app/_components/page-header";
import { approveNodeAction, rejectNodeAction } from "@/app/brain/actions";
import { type BrainNode } from "@/lib/knowledge-graph/read-model";

export function ApprovalQueue({ nodes }: { nodes: BrainNode[] }) {
  const [items, setItems] = useState(nodes);
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <Panel title="Approval queue">
        <p className="text-sm text-neutral-400">
          Nothing waiting. Brand facts Mark proposes will appear here for review before they are trusted.
        </p>
      </Panel>
    );
  }

  function decide(id: string, decision: "approve" | "reject") {
    startTransition(async () => {
      const action = decision === "approve" ? approveNodeAction : rejectNodeAction;
      const result = await action(id);
      if (result.ok) setItems((prev) => prev.filter((n) => n.id !== id));
    });
  }

  return (
    <Panel title="Approval queue">
      <ul className="flex flex-col gap-3">
        {items.map((node) => (
          <li key={node.id} className="rounded-lg border border-neutral-800 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-neutral-500">{node.kind}</span>
              <StatusPill tone="amber">proposed</StatusPill>
            </div>
            <p className="mt-1 font-medium text-neutral-100">{node.label}</p>
            {node.body ? <p className="mt-1 text-sm text-neutral-400">{node.body}</p> : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => decide(node.id, "approve")}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide(node.id, "reject")}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
```

> NOTE: `React.useTransition` returns `[isPending, startTransition]`. Passing an async function to `startTransition` is supported in React 19 — confirm the house pattern with `rg -n "useTransition" src/app` and match how existing client components invoke server actions (some may use a plain `async` click handler with local `useState` for the pending flag instead).

- [ ] **Step 3: Write the brain-browser component**

Create `src/app/brain/_components/brain-browser.tsx`:

```tsx
import Link from "next/link";

import { Panel, StatusPill } from "@/app/_components/page-header";
import { type BrainNode } from "@/lib/knowledge-graph/read-model";

const TIER_TONE: Record<string, "green" | "amber" | "red" | "blue"> = {
  trusted: "green",
  proposed: "amber",
  observed: "blue",
  rejected: "red",
  archived: "blue",
};

export function BrainBrowser({ nodes }: { nodes: BrainNode[] }) {
  if (nodes.length === 0) {
    return (
      <Panel title="Brain">
        <p className="text-sm text-neutral-400">
          The brain is empty. Run <code className="text-neutral-300">pnpm seed:brain</code> or let Mark start
          recording what it learns.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title={`Brain (${nodes.length})`}>
      <ul className="flex flex-col divide-y divide-neutral-800">
        {nodes.map((node) => (
          <li key={node.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-neutral-500">{node.kind}</span>
                {node.persona ? <span className="text-xs text-neutral-600">{node.persona}</span> : null}
              </div>
              <p className="truncate font-medium text-neutral-100">{node.label}</p>
              {node.body ? <p className="truncate text-sm text-neutral-400">{node.body}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              <StatusPill tone={TIER_TONE[node.trustTier] ?? "blue"}>{node.trustTier}</StatusPill>
              {node.refTable && node.refId ? (
                <Link
                  href={`/crm/${node.refTable}/${node.refId}`}
                  className="text-xs text-neutral-400 underline-offset-2 hover:underline"
                >
                  linked record
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/app/brain/page.tsx`:

```tsx
import { PageHeader } from "@/app/_components/page-header";
import { ApprovalQueue } from "@/app/brain/_components/approval-queue";
import { BrainBrowser } from "@/app/brain/_components/brain-browser";
import { brainSummary, listNodes, listProposed } from "@/lib/knowledge-graph/read-model";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const [proposed, all, summary] = await Promise.all([listProposed(), listNodes({}), brainSummary()]);

  const proposedNodes = proposed.status === "live" ? proposed.nodes : [];
  const allNodes = all.status === "live" ? all.nodes : [];
  const summaryLine =
    summary.status === "live"
      ? `${summary.total} nodes · ${summary.byTier.trusted ?? 0} trusted · ${summary.byTier.proposed ?? 0} awaiting review`
      : "Brain unavailable — Supabase is not configured.";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketing Brain"
        description={`Mark's durable marketing memory — brand facts, personas, proof, and what it has learned. ${summaryLine}`}
      />
      <ApprovalQueue nodes={proposedNodes} />
      <BrainBrowser nodes={allNodes} />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and lint the new files**

Run: `pnpm build`
Expected: build succeeds. Then scope-lint only the new files (the global lint is noisy):
Run: `pnpm exec eslint src/app/brain`
Expected: no errors. Fix any prop mismatches against the real primitive signatures from Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/app/brain/page.tsx src/app/brain/_components
git commit -m "feat(brain): operator brain page (approval queue + browser)"
```

---

## Task 10: Add the nav item

**Files:**
- Modify: `src/app/_data/growth-engine.ts`

- [ ] **Step 1: Add Brain to navItems**

In `src/app/_data/growth-engine.ts`, change `navItems` to include Brain:

```ts
export const navItems = [
  { label: "Mark", href: "/mark", icon: "agents" },
  { label: "Campaigns", href: "/campaigns", icon: "approval" },
  { label: "Brain", href: "/brain", icon: "agents" },
];
```

> NOTE: Confirm `"agents"` is a valid icon key for the nav renderer. Run `rg -n "icon" src/app/_components/side-nav.tsx` (or the nav component that consumes `navItems`) and pick an existing icon key if `agents` is already taken/inappropriate.

- [ ] **Step 2: Verify the page renders in nav**

Run: `pnpm build`
Expected: build succeeds. (Manual check at runtime: `/brain` appears in the side nav and loads.)

- [ ] **Step 3: Commit**

```bash
git add src/app/_data/growth-engine.ts
git commit -m "feat(brain): add Brain to the primary nav"
```

---

## Task 11: Seed script

**Files:**
- Create: `scripts/seed-brain.mjs`
- Modify: `package.json`

Seeds the 12 personas as `persona` nodes and a small starter set of BSR `brand_fact` nodes (trusted), so the page and Mark's memory aren't empty. Model it on `scripts/seed-hermes-demo.mjs` — read that file first for the exact Supabase-client bootstrap (env var names, createClient call, upsert idioms).

- [ ] **Step 1: Read the existing seed for the house pattern**

Run: `cat scripts/seed-hermes-demo.mjs`
Expected: shows how the script reads `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, creates the client, resolves the org id, and inserts rows. Reuse that exact bootstrap.

- [ ] **Step 2: Write the seed script**

Create `scripts/seed-brain.mjs` (adjust the bootstrap lines to match `seed-hermes-demo.mjs` exactly):

```js
// Seeds the Marketing Brain: 12 personas as persona nodes + starter BSR brand
// facts (trusted). Idempotent on the (org_id, kind, key) natural key.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const ORG_SLUG = process.env.DEFAULT_ORG_SLUG ?? "big-shoulders-restoration";

const PERSONAS = [
  ["persona_homeowner_emergency", "Emergency Homeowner"],
  ["persona_homeowner_preventative", "Inspection Homeowner"],
  ["persona_homeowner_rebuild", "Rebuild Homeowner"],
  ["persona_landlord", "Landlord"],
  ["persona_hoa_board", "HOA Board Member"],
  ["persona_property_manager", "Property Manager"],
  ["persona_insurance_agent", "Insurance Agent"],
  ["persona_listing_agent", "Listing Agent"],
  ["persona_buyers_agent", "Buyer Agent"],
  ["persona_plumbing_partner", "Plumbing Partner"],
  ["persona_hvac_roof_electrical_partner", "HVAC / Roofing / Electrical Partner"],
  ["persona_gc_remodeler_partner", "GC / Remodeler Partner"],
];

const BRAND_FACTS = [
  ["bf_24_7", "We answer 24/7", "Big Shoulders Restoration answers emergency calls around the clock."],
  ["bf_iicrc", "IICRC-certified technicians", "Crews are IICRC-certified for water, fire, and mold restoration."],
  ["bf_local", "Chicago-area, locally operated", "Local crews who know Chicago building stock and weather."],
  ["bf_insurance", "We work directly with insurance", "We document the loss and coordinate with carriers to ease claims."],
];

async function main() {
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", ORG_SLUG)
    .maybeSingle();
  if (orgError || !org) {
    console.error(`Could not resolve org "${ORG_SLUG}":`, orgError?.message ?? "not found");
    process.exit(1);
  }
  const orgId = org.id;

  const personaRows = PERSONAS.map(([persona, label]) => ({
    org_id: orgId,
    kind: "persona",
    key: persona,
    label,
    persona,
    trust_tier: "trusted",
    source: "seed",
    created_by: "operator",
    approved_by: "seed",
    approved_at: new Date().toISOString(),
  }));

  const brandRows = BRAND_FACTS.map(([key, label, body]) => ({
    org_id: orgId,
    kind: "brand_fact",
    key,
    label,
    body,
    trust_tier: "trusted",
    source: "seed",
    created_by: "operator",
    approved_by: "seed",
    approved_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("knowledge_nodes")
    .upsert([...personaRows, ...brandRows], { onConflict: "org_id,kind,key" });
  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }
  console.log(`Seeded ${personaRows.length} personas + ${brandRows.length} brand facts into the brain.`);
}

main();
```

- [ ] **Step 3: Register the script**

In `package.json` `scripts`, add after the other `seed:*` lines:

```json
    "seed:brain": "node scripts/seed-brain.mjs",
```

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-brain.mjs package.json
git commit -m "feat(brain): seed personas and starter brand facts"
```

---

## Task 12: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: all tests pass, including the four new files (`domain/__tests__/knowledge-graph.test.ts`, `lib/knowledge-graph/persistence.test.ts`, `lib/knowledge-graph/read-model.test.ts`, `lib/hermes-api/__tests__/brain.test.ts`).

- [ ] **Step 2: Typecheck the build**

Run: `pnpm build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Lint the changed files**

Run: `pnpm exec eslint src/domain/knowledge-graph.ts src/lib/knowledge-graph src/lib/hermes-api/brain.ts src/app/brain src/app/api/v1/hermes/brain`
Expected: no errors.

- [ ] **Step 4: Manual smoke (optional, requires Supabase env + applied migration)**

Apply the migration to your Supabase dev DB, then:
Run: `pnpm seed:brain` then `pnpm dev` and open `/brain`.
Expected: the page shows the seeded brand facts/personas as trusted; the approval queue is empty until Mark proposes a gated node via `POST /api/v1/hermes/brain/nodes`.

---

## Notes for the implementer

- **Trust enforcement is the safety property.** Never let a caller-supplied `trust_tier` reach the DB for a Mark write — `markCreateNode`/`createNode` always derive it. The `brain.test.ts` and `persistence.test.ts` cases that pass `trust_tier: "trusted"` and assert `proposed` guard this; keep them.
- **`pnpm lint` won't catch type errors** and scans vendored files — rely on `pnpm build` for types and scope eslint to changed paths.
- **Prod migration is manual** — flag it in the PR description.
- The visual graph view, pgvector search, and FK-derived edges are intentionally out of scope (see spec §Out of scope).
```
