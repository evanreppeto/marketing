# Arc Reads Brand Documents (SP2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Arc two read tools — `list_brand_documents` and `read_brand_document(id)` — over the uploaded brand source documents: the inventory + the knowledge extracted from each (incl. proposed nodes), scoped to `availableToArc` docs.

**Architecture:** New read-model (`sources-read-model.ts`) composing the existing `getMediaLibraryData` + `classifyBrandSource` + `listNodes`; a bearer-gated `GET /api/v1/arc/brand/sources` (list + `?id=` detail) mirroring the intelligence-read routes; two tools added to the runner's `intelligence.ts`. No schema change.

**Tech Stack:** TypeScript, Vitest, Next.js 16, `@anthropic-ai/claude-agent-sdk`.

**Test commands:** app — `pnpm test <path>`; runner — `pnpm --filter @bsr/arc-runner exec vitest run <path>`.

**Verified facts:**
- `getMediaLibraryData(): Promise<{status:"live"; assets: MediaAssetView[]; folders; totalBytes} | {status:"unavailable"; message}>`. `MediaAssetView` has `id, fileName, kind, source, tags, riskFlags, availableToArc, …`.
- `classifyBrandSource(asset): { category, label, confidence: "high"|"medium"|"low", reason }` (`src/lib/brand-knowledge/source-classifier.ts`). Brand-source filter used by `/brand`: `kind==="document" || source==="google_drive" || classification.confidence==="high"`.
- `listNodes(filters?, client?, orgId?): Promise<{status:"live"; nodes: BrainNode[]} | {status:"unavailable"; message}>`. Supports `{ refTable, refId }` filters; without a `trustTier` filter it returns all **non-archived** tiers (so **proposed** included). `BrainNode = { id, kind, label, body: string|null, summary: string|null, trustTier, source: string|null, refTable, refId, … }` — **no `props`**; the doc preview is embedded in `body` (sync's `sourceBody`).
- Read routes use `guard` (returns `NextResponse | null`) + `ok`/`fail` from `@/app/api/v1/arc/_lib/http` — see `opportunities/route.ts` / `vault/route.ts`.
- Runner: `intelligenceTools(client, step)` in `apps/arc-runner/src/tools/intelligence.ts` returns a tool array (already in `readTools()`); `runTool(step, label, () => client.apiGet(path, params?))`; `index.test.ts` has a READ name set.

---

## File Structure
- `src/lib/brand-knowledge/sources-read-model.ts` (create) + `sources-read-model.test.ts`
- `src/app/api/v1/arc/brand/sources/route.ts` (create) + `route.test.ts`
- `apps/arc-runner/src/tools/intelligence.ts` (modify) + `intelligence.test.ts` (modify)
- `apps/arc-runner/src/tools/index.test.ts` (modify — READ set), `apps/arc-runner/src/prompt.ts` (modify — mention)

---

## Task 1: Read-model `sources-read-model.ts`

**Files:** Create `src/lib/brand-knowledge/sources-read-model.ts` + `sources-read-model.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// sources-read-model.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/media-library/read-model", () => ({ getMediaLibraryData: vi.fn() }));
vi.mock("@/lib/knowledge-graph/read-model", () => ({ listNodes: vi.fn() }));
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { listNodes } from "@/lib/knowledge-graph/read-model";
import { listBrandSources, getBrandSource } from "./sources-read-model";

const libMock = vi.mocked(getMediaLibraryData);
const nodesMock = vi.mocked(listNodes);

const docAsset = { id: "a1", fileName: "Brand Guide.pdf", kind: "document", source: "uploaded", tags: ["brand source"], riskFlags: [], availableToArc: true };
const blockedAsset = { id: "a2", fileName: "Secret.pdf", kind: "document", source: "uploaded", tags: [], riskFlags: [], availableToArc: false };
const imageAsset = { id: "a3", fileName: "photo.jpg", kind: "image", source: "uploaded", tags: [], riskFlags: [], availableToArc: true };

function liveLib(assets: unknown[]) { libMock.mockResolvedValue({ status: "live", assets, folders: [], totalBytes: 0 } as never); }
function liveNodes(nodes: unknown[]) { nodesMock.mockResolvedValue({ status: "live", nodes } as never); }

describe("listBrandSources", () => {
  it("returns availableToArc brand sources with node stats; excludes blocked + non-source", async () => {
    liveLib([docAsset, blockedAsset, imageAsset]);
    liveNodes([
      { id: "n1", kind: "brand_fact", label: "x", body: null, summary: null, trustTier: "trusted", source: null, refTable: "media_assets", refId: "a1" },
      { id: "n2", kind: "proof_point", label: "y", body: null, summary: null, trustTier: "proposed", source: null, refTable: "media_assets", refId: "a1" },
    ]);
    const out = await listBrandSources();
    expect(out.map((d) => d.id)).toEqual(["a1"]); // a2 blocked, a3 not a brand source (image, low confidence)
    expect(out[0].brain).toEqual({ total: 2, trusted: 1, proposed: 1 });
    expect(out[0].classification.label).toBeTruthy();
  });
  it("returns [] when the library is unavailable", async () => {
    libMock.mockResolvedValue({ status: "unavailable", message: "no db" } as never);
    expect(await listBrandSources()).toEqual([]);
  });
});

describe("getBrandSource", () => {
  it("returns the doc + its nodes (including proposed)", async () => {
    liveLib([docAsset]);
    liveNodes([
      { id: "n2", kind: "proof_point", label: "Proof", body: "Document preview: …", summary: "reason", trustTier: "proposed", source: "brand_source_ingestion", refTable: "media_assets", refId: "a1" },
    ]);
    const doc = await getBrandSource("a1");
    expect(doc?.fileName).toBe("Brand Guide.pdf");
    expect(doc?.nodes).toHaveLength(1);
    expect(doc?.nodes[0]).toMatchObject({ kind: "proof_point", trustTier: "proposed", label: "Proof" });
  });
  it("returns null for a blocked / non-source / missing id", async () => {
    liveLib([docAsset, blockedAsset]);
    liveNodes([]);
    expect(await getBrandSource("a2")).toBeNull();   // blocked
    expect(await getBrandSource("nope")).toBeNull();  // missing
  });
  it("returns null when the library is unavailable", async () => {
    libMock.mockResolvedValue({ status: "unavailable", message: "no db" } as never);
    expect(await getBrandSource("a1")).toBeNull();
  });
});
```
> Note: the `image`/`blocked` exclusion assumes `classifyBrandSource(imageAsset).confidence !== "high"`. If the classifier rates a tagless image "high", adjust the fixture (give `imageAsset` no brand tags) so it isn't a source — the point is to prove the filter runs.

- [ ] **Step 2: Run → FAIL** (`pnpm test src/lib/brand-knowledge/sources-read-model.test.ts`).

- [ ] **Step 3: Implement `sources-read-model.ts`**

```typescript
import { listNodes, type BrainNode } from "@/lib/knowledge-graph/read-model";
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { type MediaAssetView } from "@/lib/media-library/types";

import { classifyBrandSource, type BrandSourceClassification } from "./source-classifier";

export type BrandSourceSummary = {
  id: string;
  fileName: string;
  kind: string;
  source: string;
  tags: string[];
  classification: { category: BrandSourceClassification["category"]; label: string; confidence: BrandSourceClassification["confidence"] };
  brain: { total: number; trusted: number; proposed: number };
};
export type BrandSourceNode = { kind: string; trustTier: string; label: string; summary: string | null; body: string | null; source: string | null };
export type BrandSourceDetail = BrandSourceSummary & { nodes: BrandSourceNode[] };

const NODE_CAP = 40;

/** An uploaded asset counts as a brand source the same way the /brand page decides. */
function isBrandSource(asset: MediaAssetView, c: BrandSourceClassification): boolean {
  return asset.kind === "document" || asset.source === "google_drive" || c.confidence === "high";
}

function summarize(asset: MediaAssetView, c: BrandSourceClassification, nodes: BrainNode[]): BrandSourceSummary {
  const linked = nodes.filter((n) => n.refTable === "media_assets" && n.refId === asset.id);
  return {
    id: asset.id,
    fileName: asset.fileName,
    kind: asset.kind,
    source: asset.source,
    tags: asset.tags,
    classification: { category: c.category, label: c.label, confidence: c.confidence },
    brain: {
      total: linked.length,
      trusted: linked.filter((n) => n.trustTier === "trusted").length,
      proposed: linked.filter((n) => n.trustTier === "proposed").length,
    },
  };
}

async function loadBrandAssets(): Promise<{ asset: MediaAssetView; c: BrandSourceClassification }[]> {
  const library = await getMediaLibraryData();
  if (library.status !== "live") return [];
  return library.assets
    .map((asset) => ({ asset, c: classifyBrandSource(asset) }))
    .filter(({ asset, c }) => asset.availableToArc && isBrandSource(asset, c));
}

async function loadNodes(filters: Parameters<typeof listNodes>[0]): Promise<BrainNode[]> {
  const res = await listNodes(filters);
  return res.status === "live" ? res.nodes : [];
}

/** Inventory of Arc-available brand source documents + per-doc knowledge stats. */
export async function listBrandSources(): Promise<BrandSourceSummary[]> {
  const sources = await loadBrandAssets();
  if (sources.length === 0) return [];
  const nodes = await loadNodes({ refTable: "media_assets" });
  return sources.map(({ asset, c }) => summarize(asset, c, nodes));
}

/** One brand document + the knowledge extracted from it (incl. proposed). Null if not an Arc-available brand source. */
export async function getBrandSource(assetId: string): Promise<BrandSourceDetail | null> {
  const match = (await loadBrandAssets()).find(({ asset }) => asset.id === assetId);
  if (!match) return null;
  const nodes = await loadNodes({ refTable: "media_assets", refId: assetId });
  const summary = summarize(match.asset, match.c, nodes);
  return {
    ...summary,
    nodes: nodes.slice(0, NODE_CAP).map((n) => ({
      kind: n.kind, trustTier: n.trustTier, label: n.label, summary: n.summary, body: n.body, source: n.source,
    })),
  };
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/lib/brand-knowledge/sources-read-model.ts src/lib/brand-knowledge/sources-read-model.test.ts && git commit -m "feat(brand): sources read-model — brand doc inventory + extracted knowledge"`

---

## Task 2: Route `GET /api/v1/arc/brand/sources`

**Files:** Create `src/app/api/v1/arc/brand/sources/route.ts` + `route.test.ts`

- [ ] **Step 1: Write the failing test** (mirror `opportunities/route.test.ts` + the vault slug case)

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/brand-knowledge/sources-read-model", () => ({ listBrandSources: vi.fn(), getBrandSource: vi.fn() }));
import { listBrandSources, getBrandSource } from "@/lib/brand-knowledge/sources-read-model";
import { GET } from "./route";

const listMock = vi.mocked(listBrandSources);
const getMock = vi.mocked(getBrandSource);
function req(auth: string | undefined, id?: string) {
  const u = new URL("http://localhost/api/v1/arc/brand/sources"); if (id) u.searchParams.set("id", id);
  return new Request(u, { headers: { ...(auth ? { authorization: auth } : {}) } });
}
const env = { ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
function configure() { process.env.ARC_AGENT_API_TOKEN = "secret"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; }
beforeEach(() => { listMock.mockReset(); getMock.mockReset(); listMock.mockResolvedValue([{ id: "a1", fileName: "Guide.pdf" }] as never); getMock.mockResolvedValue({ id: "a1", fileName: "Guide.pdf", nodes: [] } as never); });
afterEach(() => { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("GET /api/v1/arc/brand/sources", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(listMock).not.toHaveBeenCalled();
  });
  it("lists brand documents", async () => {
    configure();
    expect(await (await GET(req("Bearer secret"))).json()).toMatchObject({ ok: true, documents: [{ id: "a1" }] });
  });
  it("returns one document for ?id=", async () => {
    configure();
    const res = await GET(req("Bearer secret", "a1"));
    expect(await res.json()).toMatchObject({ ok: true, document: { id: "a1" } });
    expect(getMock).toHaveBeenCalledWith("a1");
  });
  it("404s when the id is not an Arc-available brand source", async () => {
    configure(); getMock.mockResolvedValue(null as never);
    expect((await GET(req("Bearer secret", "missing"))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Write the route** (`src/app/api/v1/arc/brand/sources/route.ts`)

```typescript
import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { getBrandSource, listBrandSources } from "@/lib/brand-knowledge/sources-read-model";

/**
 * Arc reads the uploaded brand source documents. List the inventory, or one
 * document + its extracted knowledge (incl. proposed) via ?id=. Read-only;
 * scoped to Arc-available docs inside the read-model.
 *   GET /api/v1/arc/brand/sources         -> { ok, documents }
 *   GET /api/v1/arc/brand/sources?id=foo  -> { ok, document } | 404
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) {
      const document = await getBrandSource(id);
      if (!document) return fail("not_found", `No Arc-available brand document for id "${id}".`, 404);
      return ok({ document });
    }
    return ok({ documents: await listBrandSources() });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read brand documents.", 502);
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/app/api/v1/arc/brand/sources && git commit -m "feat(arc): GET /brand/sources (list + id detail) for Arc"`

---

## Task 3: Runner tools + registration + prompt

**Files:** Modify `apps/arc-runner/src/tools/intelligence.ts`, `intelligence.test.ts`, `index.test.ts`, `prompt.ts`

- [ ] **Step 1: Add failing tests** to `apps/arc-runner/src/tools/intelligence.test.ts` (match the file's existing handler-invocation style)

```typescript
  it("list_brand_documents calls the brand sources route", async () => {
    const client = { apiGet: vi.fn(async () => ({ ok: true, documents: [{ id: "a1" }] })) } as unknown as ArcClient;
    const tools = Object.fromEntries(intelligenceTools(client, noStep).map((t) => [t.name, t]));
    await /* invoke tools.list_brand_documents handler with {} per the file's pattern */;
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/brand/sources");
  });
  it("read_brand_document passes the id", async () => {
    const client = { apiGet: vi.fn(async () => ({ ok: true, document: { id: "a1" } })) } as unknown as ArcClient;
    const tools = Object.fromEntries(intelligenceTools(client, noStep).map((t) => [t.name, t]));
    await /* invoke tools.read_brand_document handler with { id: "a1" } */;
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/brand/sources", { id: "a1" });
  });
```
Also update the existing "exposes all N tools" test (if present) to include `list_brand_documents` + `read_brand_document`. Run → FAIL.

- [ ] **Step 2: Add the two tools** in `intelligence.ts` (inside `intelligenceTools`, before the `return [...]`)

```typescript
  const listBrandDocuments = tool(
    "list_brand_documents",
    "List the uploaded brand source documents Arc can use (brand guidelines, voice docs, proof, offerings), with what's been learned from each. Use to see what source material exists before drafting.",
    {},
    async () => runTool(step, "Reading brand documents", () => client.apiGet("/api/v1/arc/brand/sources")),
  );
  const readBrandDocument = tool(
    "read_brand_document",
    "Read one brand document's details + the knowledge extracted from it (including items still pending approval). Use after list_brand_documents to ground copy in a specific source.",
    { id: z.string().describe("The brand document id (from list_brand_documents).") },
    async (args) => runTool(step, "Reading brand document", () => client.apiGet("/api/v1/arc/brand/sources", { id: args.id })),
  );
```
Add `listBrandDocuments, readBrandDocument` to the returned array. Update the module's doc comment to mention brand documents.

- [ ] **Step 3: Update `index.test.ts` READ set** — add `"list_brand_documents"`, `"read_brand_document"` to the expected read-mode tool-name set (they're in `readTools()` → all modes).

- [ ] **Step 4: Prompt mention** (`apps/arc-runner/src/prompt.ts`) — extend the intelligence-tools line to add: "list_brand_documents + read_brand_document (the uploaded brand source files and what's been learned from each)."

- [ ] **Step 5: Run** `pnpm --filter @bsr/arc-runner exec vitest run src/tools/intelligence.test.ts` → PASS; `pnpm --filter @bsr/arc-runner typecheck` → clean; then `pnpm --filter @bsr/arc-runner test` → all pass (update `index.test.ts` if its count/set assertion still fails).

- [ ] **Step 6: Commit** — `git add apps/arc-runner/src/tools/intelligence.ts apps/arc-runner/src/tools/intelligence.test.ts apps/arc-runner/src/tools/index.test.ts apps/arc-runner/src/prompt.ts && git commit -m "feat(arc): runner tools to list/read brand documents"`

---

## Task 4: Sweep + build

- [ ] **Step 1:** `pnpm test src/lib/brand-knowledge/sources-read-model.test.ts src/app/api/v1/arc/brand/sources` → pass.
- [ ] **Step 2:** `pnpm --filter @bsr/arc-runner test` → pass.
- [ ] **Step 3:** `pnpm build` → succeeds (`pnpm install` first if deps missing). Fix only feature-caused failures.
- [ ] **Step 4 (if fixups):** `git add -A && git commit -m "test(arc): brand-documents verification fixups"`

---

## Self-Review (plan author)

- **Spec coverage:** read-model (`listBrandSources`/`getBrandSource`, availableToArc filter, node stats, proposed included, graceful empty) → Task 1; route (list + `?id=` + 404 + 401) → Task 2; runner tools + registration + prompt → Task 3; sweep/build → Task 4. All spec sections covered.
- **Placeholder scan:** none except the two explicit `/* invoke … */` markers in Task 3 Step 1 (deliberate "match the file's existing handler-call style" instruction, exactly as the prior intelligence-tools plan did). All production code complete.
- **Type consistency:** `listBrandSources(): BrandSourceSummary[]` / `getBrandSource(id): BrandSourceDetail | null` match the route's `ok({ documents })` / `ok({ document })` and the tools' calls. `guard`/`ok`/`fail` import matches `opportunities/route.ts` exactly. `BrainNode` fields used (`body`/`summary`/`trustTier`/`refTable`/`refId`) all exist (no `props`). Tool names identical across `intelligence.ts`, its test, `index.test.ts`, and the prompt.
- **Safety:** read-only, `guard`-gated, scoped to `availableToArc` brand sources, bounded (`runTool` cap + `NODE_CAP`), proposed surfaced for reading only. No schema change. App routes → Vercel; runner → Cloud Build trigger.
