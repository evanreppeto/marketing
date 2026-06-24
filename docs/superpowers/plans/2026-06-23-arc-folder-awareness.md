# Arc Folder Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Arc see the Library folder tree, understand each folder's purpose (via a name + description), and organize media (create folders, file assets) — with sensible default folders seeded for new workspaces.

**Architecture:** Add a `description` column to `media_folders`. Thread folder context through the Arc read path (`list_media` gains folder fields + a `folder_id` filter; a new `list_folders` tool/route returns folders with descriptions and available-asset counts). Wire two runner write tools (`create_folder`, `file_asset`) to the existing org-guarded `POST /api/v1/arc/media` route. Seed a generic default folder set in the workspace onboarding hook. Surface descriptions in the Library UI.

**Tech Stack:** Next.js 16 server components + server actions, Supabase (service-role client, app-layer org gating), Vitest, the Claude Agent SDK runner in `apps/arc-runner` (its own Vitest project), Zod tool schemas.

**Conventions to respect:**
- `pnpm test <path>` runs a single test file in the main app. The runner has its own project: run runner tests with `pnpm --filter @bsr/arc-runner test <path>`.
- `pnpm lint` scans vendored files (~31k issues) — scope eslint to changed files only.
- `pnpm build` (tsc) is the real type check; `pnpm lint` does NOT typecheck.
- Folder/asset writes are **internal and reversible — never outbound**, so they are direct writes (no approval card). Do not add any outbound behavior.
- Org isolation is enforced in the app layer (service-role bypasses RLS). Every id in a write payload is already verified against the token org in `src/lib/arc-api/media.ts`; keep that intact.

---

## Task 1: Migration — add `description` to `media_folders`

**Files:**
- Create: `supabase/migrations/20260623120000_media_folder_description.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Folder purpose/description so Arc (and operators) understand what belongs in
-- each Library folder. Nullable; existing folders keep a null description.
alter table public.media_folders
  add column description text;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260623120000_media_folder_description.sql
git commit -m "feat(media): add description column to media_folders"
```

> Note: migrations are applied to the prod DB manually (see project memory). This step only adds the file.

---

## Task 2: Types — folder description + Arc summaries

**Files:**
- Modify: `src/lib/media-library/types.ts`

- [ ] **Step 1: Add `description` to the folder row + view**

In `src/lib/media-library/types.ts`, update `MediaFolderRow` and `MediaFolderView`:

```ts
export type MediaFolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
};

export type MediaFolderView = {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  count: number;
  directCount: number;
  description: string | null;
};
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: PASS (type errors in dependents are fixed in later tasks; if `buildFolderViews`/`getMediaLibraryData` error here, that's expected — proceed to Task 3 which fixes them, then re-run). If you prefer a clean build per task, do Task 3 before building.

- [ ] **Step 3: Commit**

```bash
git add src/lib/media-library/types.ts
git commit -m "feat(media): add description to folder row + view types"
```

---

## Task 3: Read-model + persistence carry `description`

**Files:**
- Modify: `src/lib/media-library/read-model.ts`
- Modify: `src/lib/media-library/persistence.ts`
- Test: `src/lib/media-library/read-model.test.ts`

- [ ] **Step 1: Write a failing test that `buildFolderViews` carries description**

Add to `src/lib/media-library/read-model.test.ts`:

```ts
import { buildFolderViews } from "./read-model";

describe("buildFolderViews descriptions", () => {
  it("carries each folder's description into the view", () => {
    const views = buildFolderViews(
      [{ id: "f1", name: "Logos", parent_id: null, description: "Brand marks" }],
      [{ folder_id: "f1" }],
    );
    const f1 = views.find((v) => v.id === "f1");
    expect(f1?.description).toBe("Brand marks");
    const all = views.find((v) => v.id === "all");
    expect(all?.description).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/media-library/read-model.test.ts`
Expected: FAIL (`description` is `undefined`, not `"Brand marks"`; also TS error that the row literal lacks `description` if types from Task 2 propagate).

- [ ] **Step 3: Thread description through `buildFolderViews`**

In `src/lib/media-library/read-model.ts`, in `buildFolderViews`, the synthetic "all" view and the `append` push both need `description`:

```ts
  const views: MediaFolderView[] = [
    { id: "all", name: "All media", parentId: null, depth: 0, count: assets.length, directCount: assets.length, description: null },
  ];
```

```ts
    views.push({
      id: folder.id,
      name: folder.name,
      parentId: folder.parent_id,
      depth,
      count: countSubtree(folder.id),
      directCount: directCounts.get(folder.id) ?? 0,
      description: folder.description ?? null,
    });
```

- [ ] **Step 4: Select `description` in `getMediaLibraryData`**

In the same file, update the folder query select:

```ts
  const { data: folderRows, error: fErr } = await db
    .from("media_folders").select("id, name, parent_id, description").eq("org_id", orgId).order("sort_order");
```

- [ ] **Step 5: Persist `description` in `createFolder`**

In `src/lib/media-library/persistence.ts`:

```ts
export type CreateFolderInput = { orgId: string; name: string; parentId?: string | null; description?: string | null; client?: SupabaseClient };
export async function createFolder({ orgId, name, parentId = null, description = null, client = getSupabaseAdminClient() }: CreateFolderInput): Promise<string> {
  return insertGetId(client, "media_folders", { org_id: orgId, name, parent_id: parentId, description });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test src/lib/media-library/read-model.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/media-library/read-model.ts src/lib/media-library/persistence.ts src/lib/media-library/read-model.test.ts
git commit -m "feat(media): carry folder description through read-model + createFolder"
```

---

## Task 4: Default folder set + idempotent seeding helper

**Files:**
- Modify: `src/lib/media-library/persistence.ts`
- Test: `src/lib/media-library/persistence.test.ts`

- [ ] **Step 1: Write failing tests for the default set + seeding**

Add to `src/lib/media-library/persistence.test.ts`:

```ts
import { DEFAULT_MEDIA_FOLDERS, seedDefaultMediaFolders } from "./persistence";

describe("DEFAULT_MEDIA_FOLDERS", () => {
  it("is a non-empty list with names and descriptions", () => {
    expect(DEFAULT_MEDIA_FOLDERS.length).toBeGreaterThan(0);
    for (const f of DEFAULT_MEDIA_FOLDERS) {
      expect(f.name.trim().length).toBeGreaterThan(0);
      expect(f.description.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("seedDefaultMediaFolders", () => {
  function clientWithFolderCount(count: number) {
    const insert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ count, error: null })),
        })),
        insert,
      })),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
    return { client, insert };
  }

  it("inserts the default set when the org has no folders", async () => {
    const { client, insert } = clientWithFolderCount(0);
    const created = await seedDefaultMediaFolders({ orgId: "org-1", client });
    expect(created).toBe(DEFAULT_MEDIA_FOLDERS.length);
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ org_id: "org-1", name: DEFAULT_MEDIA_FOLDERS[0].name, sort_order: 0 });
  });

  it("skips seeding when the org already has folders", async () => {
    const { client, insert } = clientWithFolderCount(3);
    const created = await seedDefaultMediaFolders({ orgId: "org-1", client });
    expect(created).toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });
});
```

> If `vi` is not already imported at the top of the file, add it: `import { describe, expect, it, vi } from "vitest";`

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/media-library/persistence.test.ts`
Expected: FAIL with "DEFAULT_MEDIA_FOLDERS is not exported" / "seedDefaultMediaFolders is not a function".

- [ ] **Step 3: Implement the constant + helper**

Add to `src/lib/media-library/persistence.ts` (near `createFolder`):

```ts
/** Generic starter folders seeded for a new workspace. Names/descriptions are
 *  editable; Arc and operators can add more (e.g. a literal "Damage" folder).
 *  Kept industry-agnostic — this is a multi-tenant product. */
export const DEFAULT_MEDIA_FOLDERS: { name: string; description: string }[] = [
  { name: "Logos & Brand", description: "Official logos, wordmarks, and brand marks — headers, watermarks, co-branding." },
  { name: "Team & People", description: "Staff, crew, and leadership photos for trust-building and about/team pages." },
  { name: "Before & After / Proof", description: "Before/after and proof-of-work photos that show real results." },
  { name: "Facilities & Equipment", description: "Trucks, equipment, signage, and workspace shots." },
  { name: "General", description: "Uncategorized media." },
];

/** Seed the default folder set for an org, but only if it has none yet
 *  (idempotent — safe to call on every onboarding). Returns rows created. */
export async function seedDefaultMediaFolders(
  { orgId, client = getSupabaseAdminClient() }: { orgId: string; client?: SupabaseClient },
): Promise<number> {
  const { count, error: countError } = await client
    .from("media_folders" as string)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (countError) throw new Error(`media_folders count failed: ${countError.message}`);
  if ((count ?? 0) > 0) return 0;

  const rows = DEFAULT_MEDIA_FOLDERS.map((folder, index) => ({
    org_id: orgId,
    name: folder.name,
    description: folder.description,
    sort_order: index,
  }));
  const { error } = await client.from("media_folders" as string).insert(rows);
  if (error) throw new Error(`media_folders seed failed: ${error.message}`);
  return rows.length;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/lib/media-library/persistence.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/media-library/persistence.ts src/lib/media-library/persistence.test.ts
git commit -m "feat(media): default folder set + idempotent seedDefaultMediaFolders"
```

---

## Task 5: Seed default folders during workspace onboarding

**Files:**
- Modify: `src/lib/auth/workspace-onboarding.ts`

- [ ] **Step 1: Import the seeding helper**

At the top of `src/lib/auth/workspace-onboarding.ts`, add:

```ts
import { seedDefaultMediaFolders } from "@/lib/media-library/persistence";
```

- [ ] **Step 2: Call it inside `createWorkspaceDefaults`**

In `createWorkspaceDefaults`, after the `business_profiles` upsert and before the `audit_events` insert, add:

```ts
  await seedDefaultMediaFolders({ orgId: org.id, client });
```

(The typed `client` is assignable to the helper's `SupabaseClient` param.)

- [ ] **Step 3: Verify the build + existing onboarding tests pass**

Run: `pnpm build`
Expected: PASS

Run: `pnpm test src/lib/auth`
Expected: PASS (no onboarding test asserts an exact set of default-creation calls; if one does, update it to expect the new `media_folders` insert).

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/workspace-onboarding.ts
git commit -m "feat(onboarding): seed default media folders for new workspaces"
```

---

## Task 6: Arc read — folder context on media + `list_folders` read-model

**Files:**
- Modify: `src/lib/media-library/arc-handoff.ts`
- Test: `src/lib/media-library/arc-handoff.test.ts` (create if missing)

- [ ] **Step 1: Write failing tests**

Create/extend `src/lib/media-library/arc-handoff.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { toArcMediaSummary, toArcFolderSummaries } from "./arc-handoff";

describe("toArcMediaSummary", () => {
  it("includes folderId and resolved folderName", () => {
    const rows = [
      { id: "a1", file_name: "x.jpg", public_url: "u", storage_path: "p", kind: "image", width: 10, height: 20, tags: ["t"], risk_flags: [], folder_id: "f1" },
      { id: "a2", file_name: "y.jpg", public_url: "u2", storage_path: "p2", kind: "image", width: null, height: null, tags: null, risk_flags: null, folder_id: null },
    ];
    const out = toArcMediaSummary(rows, new Map([["f1", "Logos & Brand"]]));
    expect(out[0]).toMatchObject({ id: "a1", folderId: "f1", folderName: "Logos & Brand", dimensions: "10 × 20" });
    expect(out[1]).toMatchObject({ id: "a2", folderId: null, folderName: null });
  });
});

describe("toArcFolderSummaries", () => {
  it("returns every folder with available-only counts", () => {
    const folders = [
      { id: "f1", name: "Logos & Brand", description: "Brand marks", parent_id: null },
      { id: "f2", name: "Team", description: null, parent_id: null },
    ];
    const out = toArcFolderSummaries(folders, ["f1", "f1", null, "f1"]);
    expect(out).toEqual([
      { id: "f1", name: "Logos & Brand", description: "Brand marks", parentId: null, availableAssetCount: 3 },
      { id: "f2", name: "Team", description: null, parentId: null, availableAssetCount: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/media-library/arc-handoff.test.ts`
Expected: FAIL (`toArcMediaSummary` has the wrong signature; `toArcFolderSummaries` not exported).

- [ ] **Step 3: Update `ArcMediaSummary` + `ArcMediaRow` and `toArcMediaSummary`**

In `src/lib/media-library/arc-handoff.ts`:

```ts
export type ArcMediaSummary = {
  id: string;
  fileName: string;
  url: string;
  kind: string;
  dimensions: string | null;
  tags: string[];
  riskFlags: string[];
  folderId: string | null;
  folderName: string | null;
};

type ArcMediaRow = {
  id: string;
  file_name: string;
  public_url: string;
  storage_path: string;
  kind: string;
  width: number | null;
  height: number | null;
  tags: string[] | null;
  risk_flags: string[] | null;
  folder_id: string | null;
};

/** Pure: media rows → compact Arc summaries, resolving folder names via the map. */
export function toArcMediaSummary(rows: ArcMediaRow[], folderNameById: Map<string, string>): ArcMediaSummary[] {
  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    url: r.public_url,
    kind: r.kind,
    dimensions: r.width != null && r.height != null ? `${r.width} × ${r.height}` : null,
    tags: r.tags ?? [],
    riskFlags: r.risk_flags ?? [],
    folderId: r.folder_id,
    folderName: r.folder_id ? folderNameById.get(r.folder_id) ?? null : null,
  }));
}
```

- [ ] **Step 4: Add the folder-name loader and rewrite `listAvailableArcMedia`**

Replace the existing `listAvailableArcMedia` with:

```ts
async function loadFolderNames(
  orgId: string, folderIds: string[], client: SupabaseClient,
): Promise<Map<string, string>> {
  if (folderIds.length === 0) return new Map();
  const { data, error } = await client
    .from("media_folders" as string)
    .select("id, name").eq("org_id", orgId).in("id", folderIds);
  if (error) throw new Error(`load folder names failed: ${error.message}`);
  return new Map(((data ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]));
}

/** List the org's Library assets that the operator opted into Arc (available_to_arc). */
export async function listAvailableArcMedia(
  orgId: string,
  opts: { kind?: string; folderId?: string; limit?: number } = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcMediaSummary[]> {
  let query = client
    .from("media_assets" as string)
    .select("id, file_name, public_url, storage_path, kind, width, height, tags, risk_flags, folder_id")
    .eq("org_id", orgId)
    .eq("available_to_arc", true)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  if (opts.kind) query = query.eq("kind", opts.kind);
  if (opts.folderId) query = query.eq("folder_id", opts.folderId);
  const { data, error } = await query;
  if (error) throw new Error(`list arc media failed: ${error.message}`);
  const rows = (data ?? []) as ArcMediaRow[];
  const folderIds = [...new Set(rows.map((r) => r.folder_id).filter((id): id is string => Boolean(id)))];
  const folderNameById = await loadFolderNames(orgId, folderIds, client);
  return toArcMediaSummary(rows, folderNameById);
}
```

- [ ] **Step 5: Add `ArcFolderSummary`, `toArcFolderSummaries`, and `listArcFolders`**

Append to `src/lib/media-library/arc-handoff.ts`:

```ts
/** Compact, model-facing summary of a Library folder Arc can organize media into. */
export type ArcFolderSummary = {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  availableAssetCount: number;
};

type ArcFolderRow = { id: string; name: string; description: string | null; parent_id: string | null };

/** Pure: folder rows + the folder_ids of available assets → folder summaries with
 *  available-only counts. Returns every folder (even zero-count) so Arc sees the
 *  full structure and can file into empty folders. */
export function toArcFolderSummaries(folderRows: ArcFolderRow[], availableAssetFolderIds: (string | null)[]): ArcFolderSummary[] {
  const counts = new Map<string, number>();
  for (const fid of availableAssetFolderIds) {
    if (fid) counts.set(fid, (counts.get(fid) ?? 0) + 1);
  }
  return folderRows.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description ?? null,
    parentId: f.parent_id ?? null,
    availableAssetCount: counts.get(f.id) ?? 0,
  }));
}

/** List the org's Library folders with available-to-Arc asset counts. */
export async function listArcFolders(
  orgId: string, client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcFolderSummary[]> {
  const { data: folderData, error: fErr } = await client
    .from("media_folders" as string)
    .select("id, name, description, parent_id").eq("org_id", orgId).order("sort_order");
  if (fErr) throw new Error(`list arc folders failed: ${fErr.message}`);
  const { data: assetData, error: aErr } = await client
    .from("media_assets" as string)
    .select("folder_id").eq("org_id", orgId).eq("available_to_arc", true);
  if (aErr) throw new Error(`list arc folder counts failed: ${aErr.message}`);
  return toArcFolderSummaries(
    (folderData ?? []) as ArcFolderRow[],
    ((assetData ?? []) as { folder_id: string | null }[]).map((r) => r.folder_id),
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test src/lib/media-library/arc-handoff.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/media-library/arc-handoff.ts src/lib/media-library/arc-handoff.test.ts
git commit -m "feat(arc): folder context on list media + listArcFolders read-model"
```

---

## Task 7: `arcCreateFolder` accepts a description

**Files:**
- Modify: `src/lib/arc-api/media.ts`
- Test: `src/lib/arc-api/__tests__/media.test.ts`

- [ ] **Step 1: Write a failing test**

Add to `src/lib/arc-api/__tests__/media.test.ts` (mirror the existing `arcCreateFolder` test setup in that file for the Supabase mock shape):

```ts
it("passes a trimmed description through to createFolder", async () => {
  const supabase = createSupabaseQueryMock({ media_folders: { data: { id: "f-1" }, error: null } });
  const result = await arcCreateFolder(
    { name: "Proof", description: "  Before/after proof  " },
    { client: supabase as never, orgId: ORG },
  );
  expect(result).toEqual({ ok: true, id: "f-1" });
  const insert = supabase.calls.find(([m]) => m === "insert") as [string, Record<string, unknown>];
  expect(insert[1]).toMatchObject({ org_id: ORG, name: "Proof", description: "Before/after proof" });
});
```

> Match the import style already used at the top of this test file for `createSupabaseQueryMock` and `ORG`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/arc-api/__tests__/media.test.ts`
Expected: FAIL (insert payload has no `description`).

- [ ] **Step 3: Read + pass the description in `arcCreateFolder`**

In `src/lib/arc-api/media.ts`, inside `arcCreateFolder`, after the parent-folder ownership checks and before the `createFolder` call:

```ts
  const description = typeof payload.description === "string" ? payload.description.trim() : "";

  const id = await createFolder({ orgId: deps.orgId, name, parentId, description: description || null, client });
  return { ok: true, id };
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/lib/arc-api/__tests__/media.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/arc-api/media.ts src/lib/arc-api/__tests__/media.test.ts
git commit -m "feat(arc): arcCreateFolder persists an optional description"
```

---

## Task 8: Routes — `folder_id` filter on media GET + new `GET /api/v1/arc/folders`

**Files:**
- Modify: `src/app/api/v1/arc/media/route.ts`
- Create: `src/app/api/v1/arc/folders/route.ts`
- Modify: `src/app/api/v1/arc/media/route.test.ts`
- Create: `src/app/api/v1/arc/folders/route.test.ts`

- [ ] **Step 1: Add the `folder_id` query param to the media GET**

In `src/app/api/v1/arc/media/route.ts`, update the `GET` body:

```ts
  const kind = url.searchParams.get("kind")?.trim() || undefined;
  const folderId = url.searchParams.get("folder_id")?.trim() || undefined;
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
  try {
    const media = await listAvailableArcMedia(allowed.scope.orgId, { kind, folderId, limit });
    return ok({ media });
```

- [ ] **Step 2: Create the folders route**

Create `src/app/api/v1/arc/folders/route.ts`:

```ts
import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { listArcFolders } from "@/lib/media-library/arc-handoff";

/**
 * The org's Library folders with available-to-Arc asset counts and descriptions,
 * so Arc understands what each folder is for and can file media correctly.
 * Read-only.
 *
 *   GET /api/v1/arc/folders  ->  { ok, folders: ArcFolderSummary[] }
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  try {
    const folders = await listArcFolders(allowed.scope.orgId);
    return ok({ folders });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list folders.", 502);
  }
}
```

- [ ] **Step 3: Write the folders route test**

Create `src/app/api/v1/arc/folders/route.test.ts` (mirror `media/route.test.ts`'s mock + bearer setup):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/auth/api-token", () => ({
  checkAgentBearer: vi.fn(async () => ({
    ok: true, tokenSource: "database", orgId: "org-2",
    workspaceId: "20000000-0000-4000-8000-000000000002",
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(() => true),
}));

import { checkAgentBearer } from "@/lib/auth/api-token";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { GET } from "./route";

const bearerMock = vi.mocked(checkAgentBearer);
const getSupabaseMock = vi.mocked(getSupabaseAdminClient);
const configuredMock = vi.mocked(isSupabaseAdminConfigured);

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}
function request(token = "secret") {
  return new Request("http://x/api/v1/arc/folders", { headers: { authorization: `Bearer ${token}` } });
}

describe("GET /api/v1/arc/folders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configuredMock.mockReturnValue(true);
    bearerMock.mockResolvedValue({
      ok: true, tokenSource: "database", orgId: "org-2",
      workspaceId: "20000000-0000-4000-8000-000000000002",
    });
  });

  it("401s without a valid bearer token", async () => {
    configure();
    bearerMock.mockResolvedValueOnce({ ok: false, reason: "unauthorized", status: 401 });
    const res = await GET(request("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns the token org's folders", async () => {
    configure();
    const supabase = createSupabaseQueryMock({
      media_folders: { data: [{ id: "f1", name: "Logos & Brand", description: "Brand marks", parent_id: null }], error: null },
      media_assets: { data: [{ folder_id: "f1" }], error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(supabase.calls).toContainEqual(["from", "media_folders"]);
    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-2"]);
    const body = await res.json();
    expect(body.folders[0]).toMatchObject({ id: "f1", name: "Logos & Brand", availableAssetCount: 1 });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
});
```

> If `createSupabaseQueryMock` does not support two distinct tables returning arrays in one mock, check its signature in `src/lib/repos/__tests__/test-helpers.ts` and adapt (e.g. queue per-table results) — match how `media/route.test.ts` uses it.

- [ ] **Step 4: Run both route tests**

Run: `pnpm test src/app/api/v1/arc/folders/route.test.ts src/app/api/v1/arc/media/route.test.ts`
Expected: PASS (existing media GET test still passes — adding the `folder_id` param doesn't change its assertions).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/arc/media/route.ts src/app/api/v1/arc/folders/route.ts src/app/api/v1/arc/folders/route.test.ts
git commit -m "feat(arc): folder_id filter on media GET + GET /api/v1/arc/folders"
```

---

## Task 9: Runner tools — `list_media` folder filter, `list_folders`, `create_folder`, `file_asset`

**Files:**
- Modify: `apps/arc-runner/src/tools/library.ts`
- Modify: `apps/arc-runner/src/tools/index.ts`
- Test: `apps/arc-runner/src/tools/library.test.ts`
- Test: `apps/arc-runner/src/tools/index.test.ts`

- [ ] **Step 1: Write failing runner tool tests**

Add to `apps/arc-runner/src/tools/library.test.ts`:

```ts
import { libraryReadTools, libraryDraftTools, libraryWriteTools } from "./library";

describe("list_media folder filter", () => {
  it("forwards folder_id to the media endpoint", async () => {
    const apiGet = vi.fn(async () => ({ media: [] }));
    const client = { apiGet } as unknown as ArcClient;
    const [listMedia] = libraryReadTools(client, vi.fn(async () => {}));
    const handler = listMedia.handler as (a: Record<string, unknown>, e?: unknown) => Promise<unknown>;
    await handler({ folder_id: "f1", limit: 10 });
    expect(apiGet).toHaveBeenCalledWith("/api/v1/arc/media", { kind: undefined, folder_id: "f1", limit: 10 });
  });
});

describe("list_folders", () => {
  it("is named list_folders and GETs the folders endpoint", async () => {
    const apiGet = vi.fn(async () => ({ folders: [{ id: "f1", name: "Logos & Brand" }] }));
    const client = { apiGet } as unknown as ArcClient;
    const tools = libraryReadTools(client, vi.fn(async () => {}));
    const listFolders = tools.find((t) => t.name === "list_folders")!;
    expect(listFolders).toBeDefined();
    const handler = listFolders.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ text: string }> }>;
    const out = await handler({});
    expect(apiGet).toHaveBeenCalledWith("/api/v1/arc/folders", {});
    expect(out.content[0].text).toContain("f1");
  });
});

describe("create_folder + file_asset", () => {
  it("create_folder POSTs the create_folder action", async () => {
    const apiPost = vi.fn(async () => ({ action: "create_folder", folder_id: "f9" }));
    const client = { apiPost } as unknown as ArcClient;
    const [createFolder] = libraryWriteTools(client, vi.fn(async () => {}));
    expect(createFolder.name).toBe("create_folder");
    const handler = createFolder.handler as (a: Record<string, unknown>, e?: unknown) => Promise<unknown>;
    await handler({ name: "Proof", description: "Before/after" });
    expect(apiPost).toHaveBeenCalledWith("/api/v1/arc/media", {
      action: "create_folder", name: "Proof", description: "Before/after", parent_id: undefined,
    });
  });

  it("file_asset POSTs the file_asset action (null folder for root)", async () => {
    const apiPost = vi.fn(async () => ({ action: "file_asset", asset_id: "a1" }));
    const client = { apiPost } as unknown as ArcClient;
    const tools = libraryWriteTools(client, vi.fn(async () => {}));
    const fileAsset = tools.find((t) => t.name === "file_asset")!;
    const handler = fileAsset.handler as (a: Record<string, unknown>, e?: unknown) => Promise<unknown>;
    await handler({ asset_id: "a1" });
    expect(apiPost).toHaveBeenCalledWith("/api/v1/arc/media", { action: "file_asset", asset_id: "a1", folder_id: null });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bsr/arc-runner test src/tools/library.test.ts`
Expected: FAIL (`libraryWriteTools` not exported; `list_folders` not found; `list_media` doesn't forward `folder_id`).

- [ ] **Step 3: Add `folder_id` to `list_media` and add `list_folders`**

In `apps/arc-runner/src/tools/library.ts`, update `libraryReadTools`:

```ts
export function libraryReadTools(client: ArcClient, step: StepFn) {
  const listMedia = tool(
    "list_media",
    "List REAL BSR media in the operator's Library that is available to you (photos, video, logos, docs the operator marked available_to_arc). Use this to find and REUSE authentic approved media instead of generating a new AI image. Returns each asset's id, file name, kind, dimensions, tags, risk flags, and the folder it lives in. Optionally filter by kind (image | video | logo | document) or by folder_id (from list_folders). To put one on a campaign draft for approval, call attach_media with its id.",
    {
      kind: z.string().optional().describe("Filter by kind: image | video | logo | document"),
      folder_id: z.string().optional().describe("Only return assets in this folder (id from list_folders)"),
      limit: z.number().optional().describe("Max assets to return (default 50)"),
    },
    async (args) =>
      runTool(step, "Reading library", () =>
        client.apiGet("/api/v1/arc/media", { kind: args.kind, folder_id: args.folder_id, limit: args.limit }),
      ),
  );

  const listFolders = tool(
    "list_folders",
    "List the operator's Library folders (e.g. Logos & Brand, Team & People, Before & After / Proof). Each folder has a name, a description of what belongs in it, and a count of media available to you. Use a folder's description to decide which media fits a campaign, and use file_asset to organize media into the right folder. Returns id, name, description, parentId, availableAssetCount.",
    {},
    async () => runTool(step, "Reading folders", () => client.apiGet("/api/v1/arc/folders", {})),
  );

  return [listMedia, listFolders];
}
```

- [ ] **Step 4: Add `libraryWriteTools`**

Append to `apps/arc-runner/src/tools/library.ts`:

```ts
/** Library organization writes (act/draft modes). Create folders and file assets
 *  into them. Direct, org-scoped, reversible writes — organizing the Library is
 *  internal and never goes outbound, so no approval card. */
export function libraryWriteTools(client: ArcClient, step: StepFn) {
  const createFolder = tool(
    "create_folder",
    "Create a folder in the operator's Library to organize media (e.g. Logos, Team, Before & After / Proof). Provide a name and a short description of what belongs in it so you remember its purpose. Optionally nest under parent_id. Internal and reversible — nothing goes outbound.",
    {
      name: z.string().describe("Folder name, e.g. 'Before & After / Proof'"),
      description: z.string().optional().describe("What belongs in this folder / what it's for"),
      parent_id: z.string().optional().describe("Parent folder id to nest under"),
    },
    async (args) =>
      runTool(step, `Creating folder ${args.name}`, () =>
        client.apiPost("/api/v1/arc/media", {
          action: "create_folder",
          name: args.name,
          description: args.description,
          parent_id: args.parent_id,
        }),
      ),
  );

  const fileAsset = tool(
    "file_asset",
    "Move a Library asset into a folder to keep media organized. Provide asset_id (from list_media) and the target folder_id (from list_folders); omit folder_id to move it to the Library root. Internal and reversible — nothing goes outbound.",
    {
      asset_id: z.string().describe("Asset id from list_media"),
      folder_id: z.string().optional().describe("Target folder id from list_folders; omit for the Library root"),
    },
    async (args) =>
      runTool(step, `Filing asset ${args.asset_id}`, () =>
        client.apiPost("/api/v1/arc/media", {
          action: "file_asset",
          asset_id: args.asset_id,
          folder_id: args.folder_id ?? null,
        }),
      ),
  );

  return [createFolder, fileAsset];
}
```

- [ ] **Step 5: Wire `libraryWriteTools` into the mode assembler**

In `apps/arc-runner/src/tools/index.ts`, update the import and `writeTools`:

```ts
import { libraryReadTools, libraryDraftTools, libraryWriteTools } from "./library";
```

```ts
/** Direct CRM writes + interactions + brain observations + library organization. act/draft only. */
function writeTools(client: ArcClient, step: StepFn) {
  return [
    ...crmWriteTools(client, step),
    ...brainWriteTools(client, step),
    ...interactionWriteTools(client, step),
    ...libraryWriteTools(client, step),
  ];
}
```

- [ ] **Step 6: Update `index.test.ts` expected tool-name lists**

In `apps/arc-runner/src/tools/index.test.ts`:
- Add `"list_folders"` to the `READ` array (after `"list_media"`).
- Add `"create_folder"` and `"file_asset"` to the `WRITE` array.

```ts
  "list_media",
  "list_folders",
```

```ts
const WRITE = ["record_brain_note", "link_brain_nodes", "log_interaction", "create_lead", "update_record", "create_folder", "file_asset"];
```

- [ ] **Step 7: Run the runner tests**

Run: `pnpm --filter @bsr/arc-runner test src/tools/library.test.ts src/tools/index.test.ts`
Expected: PASS

- [ ] **Step 8: Typecheck the runner**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/arc-runner/src/tools/library.ts apps/arc-runner/src/tools/index.ts apps/arc-runner/src/tools/library.test.ts apps/arc-runner/src/tools/index.test.ts
git commit -m "feat(arc-runner): list_folders + create_folder/file_asset tools, list_media folder filter"
```

---

## Task 10: Library UI — show folder descriptions + set on create

**Files:**
- Modify: `src/components/ui/filesystem-item.tsx`
- Modify: `src/app/library/_components/folder-tree-model.ts`
- Modify: `src/app/library/_components/new-folder-button.tsx`
- Modify: `src/app/library/actions.ts`

> Scope note: this surfaces descriptions (tooltip in the tree) and lets operators set a description **when creating** a folder. Editing an existing folder's description inline is deferred (the tree has no inline folder-edit affordance today); seeded defaults ship with good descriptions and Arc/operators set descriptions at create time. Add inline edit as a fast follow if needed.

- [ ] **Step 1: Add `description` to `FilesystemNode` and render it as a tooltip**

In `src/components/ui/filesystem-item.tsx`, add to the `FilesystemNode` type:

```ts
  defaultOpen?: boolean;
  description?: string;
  nodes?: FilesystemNode[];
```

In the same file, add a `title` to the folder name span so the description shows on hover:

```tsx
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium leading-5" title={node.description ?? undefined}>{node.name}</span>
        {node.meta ? <span className="block truncate text-[10.5px] leading-3 text-[var(--text-muted)]">{node.meta}</span> : null}
      </span>
```

- [ ] **Step 2: Pass folder description into the tree node**

In `src/app/library/_components/folder-tree-model.ts`, in `toFolderNode`, add `description` to the returned node:

```ts
    return {
      id: `folder:${folder.id}`,
      kind: "folder",
      name: folder.name,
      href: `/library?folder=${encodeURIComponent(folder.id)}`,
      count: folder.count,
      directCount: folder.directCount,
      meta: folder.directCount !== folder.count ? `${folder.directCount} here · ${folder.count - folder.directCount} nested` : undefined,
      description: folder.description ?? undefined,
      accent: tone.accent,
      soft: tone.soft,
      border: tone.border,
      isActive: activeFolderId === folder.id,
      defaultOpen: activePath.has(folder.id) || nodes.length > 0,
      nodes,
    };
```

- [ ] **Step 3: Read `description` in `createFolderAction`**

In `src/app/library/actions.ts`, update `createFolderAction`:

```ts
export async function createFolderAction(formData: FormData): Promise<void> {
  const orgId = await guard();
  const name = String(formData.get("name") ?? "").trim();
  const parentId = (String(formData.get("parentId") ?? "") || null) as string | null;
  const description = String(formData.get("description") ?? "").trim() || null;
  if (name) await createFolder({ orgId, name, parentId, description });
  revalidatePath("/library");
}
```

- [ ] **Step 4: Add a description input to the new-folder form**

In `src/app/library/_components/new-folder-button.tsx`, add a `description` state and input, and include it in the submitted FormData:

```tsx
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const formData = new FormData();
    formData.set("name", trimmed);
    if (description.trim()) formData.set("description", description.trim());
    if (parentFolderId) formData.set("parentId", parentFolderId);
    startTransition(async () => {
      await createFolderAction(formData);
      setName("");
      setDescription("");
      setOpen(false);
    });
  }
```

Add the description input inside the `<form>`, after the name `<input>`:

```tsx
      <input
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What goes here (optional)"
        className="min-h-9 w-56 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      />
```

Also reset description on the Escape/Cancel handlers (set `setDescription("")` alongside the existing `setName("")` calls).

- [ ] **Step 5: Verify the build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 6: Verify in the running app**

Start the dev server (preview_start), open `/library`, create a folder with a description, and confirm: the folder appears in the tree and hovering its name shows the description tooltip. Capture a screenshot for the summary.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/filesystem-item.tsx src/app/library/_components/folder-tree-model.ts src/app/library/_components/new-folder-button.tsx src/app/library/actions.ts
git commit -m "feat(library): show folder descriptions in tree + set on folder create"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full app test suite**

Run: `pnpm test`
Expected: PASS (all suites green).

- [ ] **Step 2: Run the runner test suite**

Run: `pnpm --filter @bsr/arc-runner test`
Expected: PASS

- [ ] **Step 3: Typecheck the whole build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Lint only the changed files**

Run eslint scoped to the files touched in this plan (not the whole repo — it scans vendored files). Example:

```bash
pnpm exec eslint src/lib/media-library src/lib/arc-api/media.ts src/app/api/v1/arc src/app/library src/components/ui/filesystem-item.tsx src/lib/auth/workspace-onboarding.ts
```

Expected: no errors in changed files.

- [ ] **Step 5: Final review commit (if lint produced fixes)**

```bash
git add -A
git commit -m "chore(arc): lint fixes for folder awareness"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Migration (description col) → Task 1.
- Types (`MediaFolderRow/View`, `ArcMediaSummary` folderId/folderName) → Tasks 2, 6.
- Read side (`list_media` folder context + `folder_id` filter; `list_folders` read-model + route; runner tools) → Tasks 6, 8, 9.
- Write side (`arcCreateFolder` description; `createFolder` description; runner `create_folder`/`file_asset` in write tier) → Tasks 3, 7, 9.
- Seeded defaults (generic set, idempotent, in onboarding) → Tasks 4, 5.
- Library UI (show description + set on create) → Task 10. **Adjustment vs spec:** inline editing of *existing* folder descriptions is deferred (no existing inline folder-edit UI; seeded + create-time + Arc-set descriptions cover the goal). Flagged in Task 10's scope note.
- Approval safety (folder writes internal/reversible, never outbound; per-row org checks intact) → preserved in Tasks 7, 9 (no approval card; existing `arcCreateFolder`/`arcFileAsset` org checks untouched).
- Testing → Tasks 3, 4, 6, 7, 8, 9 (unit + route + runner), Task 11 (full suites + build).

**Type consistency:** `listAvailableArcMedia(orgId, { kind?, folderId?, limit? })` and `toArcMediaSummary(rows, folderNameById)` are used consistently in arc-handoff (Task 6) and the route (Task 8). `ArcFolderSummary` fields (`id, name, description, parentId, availableAssetCount`) match between `toArcFolderSummaries`, `listArcFolders`, and the runner `list_folders` description. `createFolder({ ..., description })` signature matches every caller (`arcCreateFolder` Task 7, `createFolderAction` Task 10, `seedDefaultMediaFolders` inserts the column directly Task 4).

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output.
