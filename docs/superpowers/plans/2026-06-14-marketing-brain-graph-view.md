# Marketing Brain — Graph View + Export (2A) Implementation Plan

> **For agentic workers:** implement task-by-task; each task is committed independently. **All work happens in the worktree `C:/Users/evanr/marketing-brain-pr` on branch `feat/marketing-brain`.** Use absolute paths under that root for file edits, and `cd "C:/Users/evanr/marketing-brain-pr"` before any git/pnpm/tsc/vitest command.

**Goal:** Add a Graphify-style interactive graph view + `graph.json` export to the Marketing Brain, on top of the existing node/edge data layer.

**Architecture:** A full-graph read-model feeds both a bearer-gated agent export endpoint and a `react-force-graph-2d` canvas on `/brain`. No change to the trust model, write paths, or approval flow.

**Spec:** `docs/superpowers/specs/2026-06-14-marketing-brain-graph-view-design.md`

**Conventions:** Same as the base feature — pure `domain/` (n/a here), org-scoped persistence/read-models guarded by `isSupabaseAdminConfigured()`, graceful degradation via the resilient fetch, `npx tsc --noEmit` for fast typecheck, `pnpm test <file>` for one file, scoped `npx eslint <path>` (global lint is noisy). The dependency `react-force-graph-2d` is already installed in this worktree.

---

## Task 1: Commit the dependency

Already installed (`react-force-graph-2d@^1.29.1` in `package.json`; `pnpm-lock.yaml` updated).

- [ ] `cd "C:/Users/evanr/marketing-brain-pr"` then:
```
git add package.json pnpm-lock.yaml
git commit -m "build(brain): add react-force-graph-2d for the graph view"
```

---

## Task 2: Full-graph read-model (TDD)

**Files:**
- Modify: `src/lib/knowledge-graph/read-model.ts` — export `mapNode`, `mapEdge` (currently module-private) so `graph.ts` can reuse them. Change `function mapNode` → `export function mapNode` and `function mapEdge` → `export function mapEdge`. Also export the `Live`/`Unavailable` helper types if convenient, OR redefine locally in graph.ts (your call — keep it DRY).
- Create: `src/lib/knowledge-graph/graph.ts`
- Create: `src/lib/knowledge-graph/graph.test.ts`

- [ ] **Step 1 — failing test.** Create `src/lib/knowledge-graph/graph.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getBrainGraph } from "./graph";

const NODES = [
  { id: "n-1", kind: "brand_fact", label: "24/7", trust_tier: "trusted", persona: null },
  { id: "n-2", kind: "persona", label: "Emergency Homeowner", trust_tier: "trusted", persona: "persona_homeowner_emergency" },
  { id: "n-3", kind: "proof_point", label: "Before/after", trust_tier: "proposed", persona: null },
];
const EDGES = [
  { id: "e-1", from_node_id: "n-1", to_node_id: "n-2", relation: "governs", weight: null, trust_tier: "trusted" },
  // dangling: n-9 not in the node set -> must be pruned
  { id: "e-2", from_node_id: "n-1", to_node_id: "n-9", relation: "relates_to", weight: null, trust_tier: "observed" },
];

function mock(nodes = NODES, edges = EDGES) {
  return createSupabaseQueryMock({
    knowledge_nodes: { data: nodes, error: null },
    knowledge_edges: { data: edges, error: null },
  });
}

describe("getBrainGraph", () => {
  it("returns nodes and edges, pruning edges with a missing endpoint", async () => {
    const result = await getBrainGraph({}, mock() as never, "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(1); // e-2 pruned (n-9 absent)
    expect(result.edges[0]).toMatchObject({ id: "e-1", fromNodeId: "n-1", toNodeId: "n-2" });
    expect(result.truncated).toBe(false);
  });

  it("reports unavailable when the node query errors", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: { data: null, error: { message: "boom" } },
      knowledge_edges: { data: [], error: null },
    });
    const result = await getBrainGraph({}, supabase as never, "org-1");
    expect(result.status).toBe("unavailable");
  });
});
```

- [ ] **Step 2 — run, expect fail:** `cd "C:/Users/evanr/marketing-brain-pr"; npx vitest run src/lib/knowledge-graph/graph.test.ts` → FAIL (no module).

- [ ] **Step 3 — implement.** First, in `read-model.ts`, add `export` to `mapNode` and `mapEdge`. Then create `src/lib/knowledge-graph/graph.ts`:

```ts
import { type TrustTier } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type TypedSupabaseClient, getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { type BrainEdge, type BrainNode, mapEdge, mapNode } from "./read-model";

export type BrainGraph = { nodes: BrainNode[]; edges: BrainEdge[]; truncated: boolean };
type GraphResult = ({ status: "live" } & BrainGraph) | { status: "unavailable"; message: string };

const NODE_CAP = 2000;
const EDGE_CAP = 5000;
const NODE_COLUMNS =
  "id,kind,label,body,summary,persona,trust_tier,confidence,ref_table,ref_id,source,created_by,created_at";
const EDGE_COLUMNS = "id,from_node_id,to_node_id,relation,weight,trust_tier";
const VISIBLE_TIERS: TrustTier[] = ["observed", "proposed", "trusted"];

export async function getBrainGraph(
  filters: { kinds?: string[]; trustTiers?: TrustTier[] } = {},
  client?: TypedSupabaseClient,
  orgId?: string,
): Promise<GraphResult> {
  if (!(client && orgId)) {
    if (!isSupabaseAdminConfigured()) return { status: "unavailable", message: "Supabase is not configured." };
  }
  try {
    const supabase = client ?? getSupabaseAdminClient();
    const resolvedOrg = orgId ?? (await getCurrentOrgId());
    const tiers = filters.trustTiers && filters.trustTiers.length ? filters.trustTiers : VISIBLE_TIERS;

    let nodeQuery = supabase
      .from("knowledge_nodes")
      .select(NODE_COLUMNS)
      .eq("org_id", resolvedOrg)
      .in("trust_tier", tiers)
      .order("updated_at", { ascending: false })
      .limit(NODE_CAP + 1);
    if (filters.kinds && filters.kinds.length) nodeQuery = nodeQuery.in("kind", filters.kinds);

    const nodesRes = await nodeQuery;
    if (nodesRes.error) return { status: "unavailable", message: nodesRes.error.message };

    const nodeRows = (nodesRes.data ?? []) as Parameters<typeof mapNode>[0][];
    const truncatedNodes = nodeRows.length > NODE_CAP;
    const nodes = (truncatedNodes ? nodeRows.slice(0, NODE_CAP) : nodeRows).map(mapNode);
    const nodeIds = new Set(nodes.map((n) => n.id));

    const edgesRes = await supabase
      .from("knowledge_edges")
      .select(EDGE_COLUMNS)
      .eq("org_id", resolvedOrg)
      .limit(EDGE_CAP + 1);
    if (edgesRes.error) return { status: "unavailable", message: edgesRes.error.message };

    const edgeRows = (edgesRes.data ?? []) as Parameters<typeof mapEdge>[0][];
    const truncatedEdges = edgeRows.length > EDGE_CAP;
    const edges = (truncatedEdges ? edgeRows.slice(0, EDGE_CAP) : edgeRows)
      .map(mapEdge)
      // prune dangling links so the canvas never references a missing node
      .filter((e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId));

    return { status: "live", nodes, edges, truncated: truncatedNodes || truncatedEdges };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Brain graph is unavailable." };
  }
}
```

> NOTE: `Parameters<typeof mapNode>[0]` reuses the row type without re-declaring it. If `mapNode`/`mapEdge` aren't typed with a named param type, just cast `as never[]`-free by declaring local `NodeRow`/`EdgeRow` types matching `NODE_COLUMNS`/`EDGE_COLUMNS` (same shape as in read-model.ts). Keep it typechecking under `npx tsc --noEmit`.

- [ ] **Step 4 — run, expect pass:** `npx vitest run src/lib/knowledge-graph/graph.test.ts`.
- [ ] **Step 5 — typecheck + commit:** `npx tsc --noEmit` clean, then
```
git add src/lib/knowledge-graph/graph.ts src/lib/knowledge-graph/graph.test.ts src/lib/knowledge-graph/read-model.ts
git commit -m "feat(brain): full-graph read-model with dangling-edge pruning"
```

---

## Task 3: graph.json export — Hermes endpoint (TDD)

**Files:**
- Modify: `src/lib/hermes-api/brain.ts` — add `markGraphExport`.
- Modify: `src/lib/hermes-api/__tests__/brain.test.ts` — add a test.
- Create: `src/app/api/v1/hermes/brain/graph/route.ts`.

- [ ] **Step 1 — add the test** to `src/lib/hermes-api/__tests__/brain.test.ts`:

```ts
// add this import at the top alongside the existing ones:
import { markGraphExport } from "../brain";

describe("markGraphExport", () => {
  it("returns nodes and links (force-graph shape)", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: { data: [{ id: "n-1", kind: "brand_fact", label: "x", trust_tier: "trusted", persona: null }], error: null },
      knowledge_edges: { data: [], error: null },
    });
    const result = await markGraphExport({ client: supabase as never, orgId: "org-1" });
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("expected live");
    expect(result.nodes).toHaveLength(1);
    expect(Array.isArray(result.links)).toBe(true);
  });
});
```

- [ ] **Step 2 — run, expect fail:** `npx vitest run src/lib/hermes-api/__tests__/brain.test.ts`.

- [ ] **Step 3 — implement `markGraphExport`** in `src/lib/hermes-api/brain.ts` (append):

```ts
import { getBrainGraph } from "@/lib/knowledge-graph/graph";

export type GraphExportLink = { source: string; target: string; relation: string; weight: number | null };
export type GraphExport =
  | { status: "live"; nodes: ReturnType<typeof toExportNode>[]; links: GraphExportLink[]; truncated: boolean }
  | { status: "unavailable"; message: string };

function toExportNode(n: { id: string; kind: string; label: string; trustTier: string; persona: string | null; refTable: string | null; refId: string | null }) {
  return { id: n.id, kind: n.kind, label: n.label, trustTier: n.trustTier, persona: n.persona, refTable: n.refTable, refId: n.refId };
}

export async function markGraphExport(deps: ApiDeps = {}): Promise<GraphExport> {
  const graph = await getBrainGraph({}, deps.client, deps.orgId);
  if (graph.status !== "live") return graph;
  return {
    status: "live",
    nodes: graph.nodes.map(toExportNode),
    links: graph.edges.map((e) => ({ source: e.fromNodeId, target: e.toNodeId, relation: e.relation, weight: e.weight })),
    truncated: graph.truncated,
  };
}
```
> `ApiDeps` already exists in this file. If `ReturnType<typeof toExportNode>` ordering causes a TS "used before declaration" issue, declare `toExportNode` above the type alias or give `nodes` an explicit inline type.

- [ ] **Step 4 — route.** Create `src/app/api/v1/hermes/brain/graph/route.ts`:

```ts
import { fail, guard, ok } from "@/app/api/v1/hermes/_lib/http";
import { markGraphExport } from "@/lib/hermes-api/brain";

/**
 * Mark/portable tools fetch the whole brain as a graph.json artifact.
 *   GET /api/v1/hermes/brain/graph  ->  { nodes, links }
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const result = await markGraphExport();
    if (result.status !== "live") return fail("not_configured", result.message, 503);
    return ok({ nodes: result.nodes, links: result.links, truncated: result.truncated }, 200);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to export graph.", 502);
  }
}
```

- [ ] **Step 5 — run tests + typecheck + commit:** `npx vitest run src/lib/hermes-api/__tests__/brain.test.ts` (pass), `npx tsc --noEmit` (clean), then
```
git add src/lib/hermes-api/brain.ts src/lib/hermes-api/__tests__/brain.test.ts src/app/api/v1/hermes/brain/graph
git commit -m "feat(brain): graph.json export endpoint (GET hermes/brain/graph)"
```

---

## Task 4: Interactive canvas component

**Files:**
- Create: `src/app/brain/_components/brain-graph.tsx`

This is the meaty UI task. Build a WORKING baseline; visual polish can iterate. Read the real
shared primitives (`src/app/_components/page-header.tsx` for `Panel`/`StatusPill`,
`src/app/_components/theme.ts` for `ThemeTone` and tokens) and an existing client component to
match conventions BEFORE writing.

Requirements:
- `"use client"`. Load `react-force-graph-2d` via `next/dynamic` with `ssr: false`:
  ```ts
  import dynamic from "next/dynamic";
  const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });
  ```
- Props: `{ nodes: BrainNode[]; edges: BrainEdge[] }` (import `BrainNode`/`BrainEdge` types from `@/lib/knowledge-graph/read-model`).
- Transform to force-graph data with `useMemo`: `{ nodes: nodes.map(n => ({ ...n })), links: edges.map(e => ({ id: e.id, source: e.fromNodeId, target: e.toNodeId, relation: e.relation, weight: e.weight, trustTier: e.trustTier })) }`. Deep-copy nodes (force-graph mutates them).
- A `KIND_COLOR: Record<string, string>` map (one color per node kind; use readable, on-brand hex/token values — derive from the design palette; brand_fact/persona/proof_point/cta/messaging_angle are the important ones). Unknown kinds → a neutral gray.
- `nodeCanvasObject`: draw a filled circle in the kind color; draw a ring whose style encodes trust tier (`trusted` solid, `proposed` amber dashed, `observed` faded); draw the node label text next to the dot when `globalScale` is above a threshold OR the node is selected.
- `linkLabel: (l) => l.relation`; link width from `weight` (default 1).
- State: `selected` node, `search` string, `activeKinds`/`activeTiers` filter sets. Apply filters to the in-memory data (do not refetch). Search: on submit, find the first label match, center/zoom via the graph ref (`ref.current.centerAt`, `ref.current.zoom`), and highlight matches.
- Controls bar (above the canvas): a search input; filter chips for kinds and trust tiers (toggle); a **"Download graph.json"** button that builds `{ nodes, links }` from the current full props (not the filtered view) and triggers a client-side download via a `Blob` + temporary `<a>`.
- A **detail side panel** when a node is selected: kind, label, body, persona, refs (link to `/crm/{refTable}/{refId}` when present), and a neighbor list (compute from `edges`). When the selected node's `trustTier === "proposed"`, show **Approve** / **Reject** buttons that call `approveNodeAction`/`rejectNodeAction` from `@/app/brain/actions` inside a `useTransition`; on success, update that node's `trustTier` locally (approve → `trusted`, reject → remove/dim).
- Sizes to its container: wrap the canvas in a `div` with a `ref` + `ResizeObserver` (or a fixed responsive height like `h-[70vh]`), passing explicit `width`/`height` to `ForceGraph2D`.
- Empty state (no nodes): a `Panel`/message telling the operator to seed or let Mark populate the brain.
- DESIGN.md: charcoal canvas background (`backgroundColor` prop using the surface token's resolved color or a dark hex consistent with the app), restoration-red accents, no neon.

- [ ] **Build it, then verify it compiles:** `cd "C:/Users/evanr/marketing-brain-pr"; npx tsc --noEmit` (clean) and `npx eslint src/app/brain/_components/brain-graph.tsx` (no errors). The full render is verified in Task 5 via `pnpm build`.
- [ ] **Commit:**
```
git add src/app/brain/_components/brain-graph.tsx
git commit -m "feat(brain): interactive force-graph canvas with filter, search, inspect"
```

---

## Task 5: Wire into the /brain page + verify build

**Files:**
- Modify: `src/app/brain/page.tsx`

- [ ] **Step 1.** Update `src/app/brain/page.tsx` to also fetch the graph and render it as the hero, keeping the approval queue prominent and the browse list reachable:

```tsx
import { PageHeader } from "@/app/_components/page-header";
import { ApprovalQueue } from "@/app/brain/_components/approval-queue";
import { BrainBrowser } from "@/app/brain/_components/brain-browser";
import { BrainGraph } from "@/app/brain/_components/brain-graph";
import { getBrainGraph } from "@/lib/knowledge-graph/graph";
import { brainSummary, listNodes, listProposed } from "@/lib/knowledge-graph/read-model";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const [graph, proposed, all, summary] = await Promise.all([
    getBrainGraph(),
    listProposed(),
    listNodes({}),
    brainSummary(),
  ]);

  const graphNodes = graph.status === "live" ? graph.nodes : [];
  const graphEdges = graph.status === "live" ? graph.edges : [];
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
      <BrainGraph nodes={graphNodes} edges={graphEdges} />
      <ApprovalQueue nodes={proposedNodes} />
      <BrainBrowser nodes={allNodes} />
    </div>
  );
}
```

- [ ] **Step 2 — full build (the real test of the dynamic ssr:false import + canvas):**
`cd "C:/Users/evanr/marketing-brain-pr"; pnpm build` — must succeed. If the build fails on the
`react-force-graph-2d` import during SSR/prerender, ensure the dynamic import has `ssr:false`
and that no force-graph type/import is evaluated at module scope on the server. The page is
`force-dynamic`, so it won't be statically prerendered.
- [ ] **Step 3 — lint + full tests:** `npx eslint src/app/brain src/lib/knowledge-graph src/lib/hermes-api/brain.ts src/app/api/v1/hermes/brain` (clean) and `npx vitest run` (all pass).
- [ ] **Step 4 — commit:**
```
git add src/app/brain/page.tsx
git commit -m "feat(brain): show the interactive graph on /brain"
```

---

## After all tasks
- Push the branch to update the PR: `cd "C:/Users/evanr/marketing-brain-pr"; git push`.
- The migration is unchanged (2A adds no schema), so no new prod SQL.
