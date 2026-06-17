# Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level **Library** tab where an operator uploads, organizes (flat folders), previews, and hands media assets to Arc — an org-agnostic surface backed by Supabase.

**Architecture:** Follows the wired-feature shape `src/domain/` (pure) → `src/lib/media-library/` (I/O) → `src/app/library/` (views + `actions.ts`). Mutations gated by `requireOperator()` + `isSupabaseAdminConfigured()`, scoped by `getCurrentOrgId()`. Storage reuses the public `campaign-media` bucket under a `library/` prefix. "Send to Arc" reuses the existing `ArcAttachment` + `enqueueArcChatTask` path.

**Tech Stack:** Next.js 16, React 19, Supabase (Storage + Postgres), Vitest, TypeScript, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-17-media-library-design.md`

---

## File structure

- Create: `supabase/migrations/20260617160000_media_library.sql` — `media_folders` + `media_assets`.
- Create: `src/domain/media-library.ts` — pure classify/validate/format helpers.
- Create: `src/domain/__tests__/media-library.test.ts`.
- Modify: `src/domain/index.ts` — re-export.
- Create: `src/lib/media-library/types.ts` — row + view types.
- Create: `src/lib/media-library/read-model.ts` + `.test.ts` — list folders/assets, used-in join, unavailable degradation.
- Create: `src/lib/media-library/persistence.ts` + `.test.ts` — folder/asset CRUD + storage upload.
- Create: `src/lib/media-library/arc-handoff.ts` + `.test.ts` — map assets → `ArcAttachment`, enqueue.
- Modify: `src/app/_components/nav-icons.tsx` — add `library` icon.
- Modify: `src/app/_components/console-frame.tsx` — add nav item.
- Create: `src/app/library/page.tsx` — server view.
- Create: `src/app/library/actions.ts` — server actions.
- Create: `src/app/library/_components/{folder-rail,asset-grid,asset-card,detail-drawer,lightbox,upload-button,filter-chips}.tsx`.
- Create: `src/app/api/v1/arc/media/route.ts` + `route.test.ts` — bearer-gated Arc read.
- Modify: `src/lib/campaigns/create.ts` — stamp `library_asset_id` into media provenance (used-in linkage).

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260617160000_media_library.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Media Library: per-org uploaded/organized media that operators hand to Arc.
-- Industry-agnostic. Isolation enforced in the app layer via the service-role
-- client; RLS enabled as defense-in-depth (mirrors brand_kit_foundation).

create table public.media_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  parent_id uuid references public.media_folders(id) on delete set null, -- reserved; flat in v1
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger media_folders_set_updated_at
  before update on public.media_folders
  for each row execute function public.set_updated_at();

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  folder_id uuid references public.media_folders(id) on delete set null,
  file_name text not null check (length(btrim(file_name)) > 0),
  storage_path text not null,
  public_url text not null,
  content_type text not null,
  kind text not null check (kind in ('image', 'video', 'logo', 'document')),
  width integer,
  height integer,
  byte_size bigint,
  duration_seconds numeric,
  source text not null default 'uploaded'
    check (source in ('uploaded', 'ai_generated', 'composite', 'stock', 'external')),
  provenance jsonb not null default '{}'::jsonb,
  risk_flags text[] not null default '{}',
  tags text[] not null default '{}',
  available_to_arc boolean not null default true,
  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_assets_org_idx on public.media_assets (org_id, created_at desc);
create index media_assets_folder_idx on public.media_assets (folder_id);

create trigger media_assets_set_updated_at
  before update on public.media_assets
  for each row execute function public.set_updated_at();

alter table public.media_folders enable row level security;
alter table public.media_assets enable row level security;

grant select, insert, update, delete on public.media_folders to service_role;
grant select, insert, update, delete on public.media_assets to service_role;
grant select on public.media_folders, public.media_assets to anon, authenticated;
```

- [ ] **Step 2: Sanity-check the SQL parses**

Run: `cat supabase/migrations/20260617160000_media_library.sql`
Expected: file prints; no `2026XXXX` placeholders; `set_updated_at` referenced (it already exists from earlier migrations).
Note: prod DB migration is applied manually by the BSR team (see memory: vercel-deploy). Do not auto-apply.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260617160000_media_library.sql
git commit -m "feat(media-library): add media_folders + media_assets schema"
```

---

## Task 2: Domain helpers (pure, TDD)

**Files:**
- Create: `src/domain/media-library.ts`
- Test: `src/domain/__tests__/media-library.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { classifyKind, formatByteSize, validateUpload, MAX_UPLOAD_BYTES } from "../media-library";

describe("classifyKind", () => {
  it("classifies images, video, and svg logos", () => {
    expect(classifyKind("image/png", "before.png")).toBe("image");
    expect(classifyKind("image/jpeg", "site.jpg")).toBe("image");
    expect(classifyKind("video/mp4", "flyover.mp4")).toBe("video");
    expect(classifyKind("image/svg+xml", "logo.svg")).toBe("logo");
    expect(classifyKind("application/pdf", "one-pager.pdf")).toBe("document");
  });
});

describe("validateUpload", () => {
  it("accepts a normal image", () => {
    expect(validateUpload({ contentType: "image/png", byteSize: 1_000_000 })).toEqual({ ok: true });
  });
  it("rejects an unsupported type", () => {
    const r = validateUpload({ contentType: "text/html", byteSize: 10 });
    expect(r.ok).toBe(false);
  });
  it("rejects oversize files", () => {
    const r = validateUpload({ contentType: "image/png", byteSize: MAX_UPLOAD_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
});

describe("formatByteSize", () => {
  it("formats bytes to human units", () => {
    expect(formatByteSize(2_100_000)).toBe("2.1 MB");
    expect(formatByteSize(14_000_000)).toBe("14 MB");
    expect(formatByteSize(900)).toBe("900 B");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/media-library.test.ts`
Expected: FAIL — `Cannot find module '../media-library'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/media-library.ts
/** Pure media-library helpers. No I/O — unit-tested in domain/__tests__. */

export type MediaKind = "image" | "video" | "logo" | "document";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const DOC_TYPES = ["application/pdf"];

export function classifyKind(contentType: string, fileName: string): MediaKind {
  if (contentType === "image/svg+xml" || fileName.toLowerCase().endsWith(".svg")) return "logo";
  if (IMAGE_TYPES.includes(contentType)) return "image";
  if (VIDEO_TYPES.includes(contentType)) return "video";
  if (DOC_TYPES.includes(contentType)) return "document";
  return "document";
}

export type UploadCheck = { contentType: string; byteSize: number };
export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateUpload({ contentType, byteSize }: UploadCheck): ValidationResult {
  const allowed = [...IMAGE_TYPES, ...VIDEO_TYPES, ...DOC_TYPES, "image/svg+xml"];
  if (!allowed.includes(contentType)) return { ok: false, reason: `Unsupported file type: ${contentType}` };
  if (byteSize > MAX_UPLOAD_BYTES) return { ok: false, reason: "File exceeds the 50 MB limit." };
  return { ok: true };
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/media-library.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Re-export from the domain barrel**

Modify `src/domain/index.ts` — add alongside the other re-exports:

```ts
export * from "./media-library";
```

- [ ] **Step 6: Commit**

```bash
git add src/domain/media-library.ts src/domain/__tests__/media-library.test.ts src/domain/index.ts
git commit -m "feat(media-library): pure classify/validate/format domain helpers"
```

---

## Task 3: Lib types + read-model (TDD)

**Files:**
- Create: `src/lib/media-library/types.ts`
- Create: `src/lib/media-library/read-model.ts`
- Test: `src/lib/media-library/read-model.test.ts`

- [ ] **Step 1: Write the types**

```ts
// src/lib/media-library/types.ts
import { type MediaKind } from "@/domain";

export type MediaAssetRow = {
  id: string;
  folder_id: string | null;
  file_name: string;
  storage_path: string;
  public_url: string;
  content_type: string;
  kind: MediaKind;
  width: number | null;
  height: number | null;
  byte_size: number | null;
  duration_seconds: number | null;
  source: string;
  provenance: Record<string, unknown>;
  risk_flags: string[];
  tags: string[];
  available_to_arc: boolean;
  uploaded_by: string | null;
  created_at: string;
};

export type MediaFolderView = { id: string; name: string; count: number };

export type MediaAssetView = {
  id: string;
  folderId: string | null;
  fileName: string;
  url: string;
  kind: MediaKind;
  badge: string;            // "PHOTO" | "VIDEO" | "LOGO" | "AI"
  dimensions: string | null; // "3024 × 4032"
  size: string | null;       // "2.1 MB"
  source: string;
  tags: string[];
  riskFlags: string[];
  availableToArc: boolean;
  uploadedBy: string | null;
  usedInCount: number;
};

export type MediaLibraryData =
  | { status: "live"; folders: MediaFolderView[]; assets: MediaAssetView[]; totalBytes: number }
  | { status: "unavailable"; message: string };
```

- [ ] **Step 2: Write the failing test (pure shaping function)**

```ts
// src/lib/media-library/read-model.test.ts
import { describe, expect, it } from "vitest";

import { toAssetView } from "./read-model";
import { type MediaAssetRow } from "./types";

const row = (over: Partial<MediaAssetRow> = {}): MediaAssetRow => ({
  id: "a1", folder_id: null, file_name: "before.jpg", storage_path: "library/o/a1-before.jpg",
  public_url: "https://x/before.jpg", content_type: "image/jpeg", kind: "image",
  width: 3024, height: 4032, byte_size: 2_100_000, duration_seconds: null,
  source: "uploaded", provenance: {}, risk_flags: [], tags: ["before-after"],
  available_to_arc: true, uploaded_by: "Evan", created_at: "2026-06-14T00:00:00Z", ...over,
});

describe("toAssetView", () => {
  it("maps a photo row, deriving badge/dimensions/size", () => {
    const v = toAssetView(row(), 2);
    expect(v.badge).toBe("PHOTO");
    expect(v.dimensions).toBe("3024 × 4032");
    expect(v.size).toBe("2.1 MB");
    expect(v.usedInCount).toBe(2);
  });
  it("labels AI-sourced assets with the AI badge", () => {
    expect(toAssetView(row({ source: "ai_generated" }), 0).badge).toBe("AI");
  });
  it("labels logos and video", () => {
    expect(toAssetView(row({ kind: "logo" }), 0).badge).toBe("LOGO");
    expect(toAssetView(row({ kind: "video", content_type: "video/mp4" }), 0).badge).toBe("VIDEO");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/lib/media-library/read-model.test.ts`
Expected: FAIL — `toAssetView` not exported.

- [ ] **Step 4: Write the read-model**

```ts
// src/lib/media-library/read-model.ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { formatByteSize } from "@/domain";
import { getCurrentOrgId, OrgUnavailableError } from "@/lib/auth/org";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { type MediaAssetRow, type MediaAssetView, type MediaFolderView, type MediaLibraryData } from "./types";

/** Pure: one DB row → view model. `usedIn` is the count of campaign assets referencing it. */
export function toAssetView(row: MediaAssetRow, usedIn: number): MediaAssetView {
  const badge =
    row.source === "ai_generated" ? "AI" : row.kind === "logo" ? "LOGO" : row.kind === "video" ? "VIDEO" : "PHOTO";
  return {
    id: row.id,
    folderId: row.folder_id,
    fileName: row.file_name,
    url: row.public_url,
    kind: row.kind,
    badge,
    dimensions: row.width && row.height ? `${row.width} × ${row.height}` : null,
    size: row.byte_size != null ? formatByteSize(row.byte_size) : null,
    source: row.source,
    tags: row.tags ?? [],
    riskFlags: row.risk_flags ?? [],
    availableToArc: row.available_to_arc,
    uploadedBy: row.uploaded_by,
    usedInCount: usedIn,
  };
}

/** Count, per library storage_path, how many campaign assets reference it. */
export function countUsage(
  assets: Pick<MediaAssetRow, "id" | "storage_path" | "public_url">[],
  campaignMedia: Array<{ path?: string; url?: string; library_asset_id?: string }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of assets) {
    const n = campaignMedia.filter(
      (m) => m.library_asset_id === a.id || m.path === a.storage_path || m.url === a.public_url,
    ).length;
    counts.set(a.id, n);
  }
  return counts;
}

export async function getMediaLibraryData(client?: SupabaseClient): Promise<MediaLibraryData> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }
  const db = client ?? getSupabaseAdminClient();
  let orgId: string;
  try {
    orgId = await getCurrentOrgId();
  } catch (error) {
    if (error instanceof OrgUnavailableError) return { status: "unavailable", message: error.message };
    throw error;
  }

  const { data: folderRows, error: fErr } = await db
    .from("media_folders").select("id, name").eq("org_id", orgId).order("sort_order");
  if (fErr) return { status: "unavailable", message: fErr.message };

  const { data: assetRows, error: aErr } = await db
    .from("media_assets").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
  if (aErr) return { status: "unavailable", message: aErr.message };
  const assets = (assetRows ?? []) as MediaAssetRow[];

  // Used-in: scan campaign_assets.audit_payload.media_assets for matches.
  const { data: caRows } = await db.from("campaign_assets").select("audit_payload");
  const campaignMedia: Array<{ path?: string; url?: string; library_asset_id?: string }> = [];
  for (const ca of (caRows ?? []) as Array<{ audit_payload: { media_assets?: unknown[] } }>) {
    for (const m of ca.audit_payload?.media_assets ?? []) {
      if (m && typeof m === "object") campaignMedia.push(m as Record<string, never>);
    }
  }
  const usage = countUsage(assets, campaignMedia);

  const counts = new Map<string | null, number>();
  for (const a of assets) counts.set(a.folder_id, (counts.get(a.folder_id) ?? 0) + 1);

  const folders: MediaFolderView[] = [
    { id: "all", name: "All media", count: assets.length },
    ...((folderRows ?? []) as Array<{ id: string; name: string }>).map((f) => ({
      id: f.id, name: f.name, count: counts.get(f.id) ?? 0,
    })),
  ];

  return {
    status: "live",
    folders,
    assets: assets.map((a) => toAssetView(a, usage.get(a.id) ?? 0)),
    totalBytes: assets.reduce((sum, a) => sum + (a.byte_size ?? 0), 0),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/lib/media-library/read-model.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/media-library/types.ts src/lib/media-library/read-model.ts src/lib/media-library/read-model.test.ts
git commit -m "feat(media-library): read-model with used-in join + view shaping"
```

---

## Task 4: Lib persistence (TDD with injected uploader)

**Files:**
- Create: `src/lib/media-library/persistence.ts`
- Test: `src/lib/media-library/persistence.test.ts`

- [ ] **Step 1: Write the failing test (storage path builder is pure)**

```ts
// src/lib/media-library/persistence.test.ts
import { describe, expect, it } from "vitest";

import { buildStoragePath, sanitizeFileName } from "./persistence";

describe("sanitizeFileName", () => {
  it("strips path separators and unsafe chars", () => {
    expect(sanitizeFileName("../../etc/p w!d.jpg")).toBe("etc-p-w-d.jpg");
  });
});

describe("buildStoragePath", () => {
  it("namespaces by org and asset id", () => {
    expect(buildStoragePath("org1", "asset1", "before.jpg")).toBe("library/org1/asset1-before.jpg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/media-library/persistence.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Write the persistence layer**

```ts
// src/lib/media-library/persistence.ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/server";

const BUCKET = "campaign-media";

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const ext = dot > 0 ? base.slice(dot + 1).replace(/[^a-zA-Z0-9]+/g, "") : "";
  return ext ? `${stem || "file"}.${ext}` : stem || "file";
}

export function buildStoragePath(orgId: string, assetId: string, fileName: string): string {
  return `library/${orgId}/${assetId}-${sanitizeFileName(fileName)}`;
}

export type ImageUploader = (path: string, bytes: Uint8Array, contentType: string) => Promise<string>;

export function defaultUploader(client: SupabaseClient): ImageUploader {
  return async (path, bytes, contentType) => {
    const { error } = await client.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) throw new Error(`media upload failed: ${error.message}`);
    return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };
}

export type CreateFolderInput = { orgId: string; name: string; client?: SupabaseClient };
export async function createFolder({ orgId, name, client = getSupabaseAdminClient() }: CreateFolderInput): Promise<string> {
  const { data, error } = await client
    .from("media_folders").insert({ org_id: orgId, name }).select("id").single<{ id: string }>();
  if (error) throw new Error(`media_folders insert failed: ${error.message}`);
  return data.id;
}

export async function renameFolder(id: string, name: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const { error } = await client.from("media_folders").update({ name }).eq("id", id);
  if (error) throw new Error(`media_folders update failed: ${error.message}`);
}

export async function deleteFolder(id: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const { error } = await client.from("media_folders").delete().eq("id", id);
  if (error) throw new Error(`media_folders delete failed: ${error.message}`);
}

export type InsertAssetInput = {
  orgId: string;
  folderId: string | null;
  fileName: string;
  bytes: Uint8Array;
  contentType: string;
  kind: string;
  width?: number | null;
  height?: number | null;
  byteSize: number;
  source?: string;
  uploadedBy: string;
  client?: SupabaseClient;
  uploader?: ImageUploader;
};

/** Upload bytes to Storage, then insert the media_assets row. Returns the new id. */
export async function insertAsset(input: InsertAssetInput): Promise<string> {
  const client = input.client ?? getSupabaseAdminClient();
  const upload = input.uploader ?? defaultUploader(client);
  // Pre-generate the id so the storage path and row agree.
  const { data: idRow, error: idErr } = await client
    .from("media_assets")
    .insert({
      org_id: input.orgId, folder_id: input.folderId, file_name: input.fileName,
      storage_path: "pending", public_url: "pending", content_type: input.contentType, kind: input.kind,
      width: input.width ?? null, height: input.height ?? null, byte_size: input.byteSize,
      source: input.source ?? "uploaded", uploaded_by: input.uploadedBy,
    })
    .select("id").single<{ id: string }>();
  if (idErr) throw new Error(`media_assets insert failed: ${idErr.message}`);
  const id = idRow.id;
  const path = buildStoragePath(input.orgId, id, input.fileName);
  const url = await upload(path, input.bytes, input.contentType);
  const { error: upErr } = await client
    .from("media_assets").update({ storage_path: path, public_url: url }).eq("id", id);
  if (upErr) throw new Error(`media_assets path update failed: ${upErr.message}`);
  return id;
}

export async function renameAsset(id: string, fileName: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const { error } = await client.from("media_assets").update({ file_name: fileName }).eq("id", id);
  if (error) throw new Error(`rename failed: ${error.message}`);
}

export async function moveAsset(id: string, folderId: string | null, client: SupabaseClient = getSupabaseAdminClient()) {
  const { error } = await client.from("media_assets").update({ folder_id: folderId }).eq("id", id);
  if (error) throw new Error(`move failed: ${error.message}`);
}

export async function setAssetTags(id: string, tags: string[], client: SupabaseClient = getSupabaseAdminClient()) {
  const { error } = await client.from("media_assets").update({ tags }).eq("id", id);
  if (error) throw new Error(`set tags failed: ${error.message}`);
}

export async function setAvailableToArc(id: string, value: boolean, client: SupabaseClient = getSupabaseAdminClient()) {
  const { error } = await client.from("media_assets").update({ available_to_arc: value }).eq("id", id);
  if (error) throw new Error(`toggle failed: ${error.message}`);
}

export async function deleteAsset(id: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const { data, error } = await client
    .from("media_assets").select("storage_path").eq("id", id).maybeSingle<{ storage_path: string }>();
  if (error) throw new Error(`delete lookup failed: ${error.message}`);
  if (data?.storage_path) await client.storage.from(BUCKET).remove([data.storage_path]);
  const { error: delErr } = await client.from("media_assets").delete().eq("id", id);
  if (delErr) throw new Error(`delete failed: ${delErr.message}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/media-library/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media-library/persistence.ts src/lib/media-library/persistence.test.ts
git commit -m "feat(media-library): folder + asset persistence with storage upload"
```

---

## Task 5: Arc handoff (TDD)

**Files:**
- Create: `src/lib/media-library/arc-handoff.ts`
- Test: `src/lib/media-library/arc-handoff.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/media-library/arc-handoff.test.ts
import { describe, expect, it } from "vitest";

import { toArcAttachments } from "./arc-handoff";

describe("toArcAttachments", () => {
  it("maps library assets to ArcAttachment shape using the public URL", () => {
    const out = toArcAttachments([
      { public_url: "https://x/a.jpg", storage_path: "library/o/a.jpg", content_type: "image/jpeg", file_name: "a.jpg" },
    ]);
    expect(out).toEqual([
      { url: "https://x/a.jpg", objectPath: "library/o/a.jpg", contentType: "image/jpeg", name: "a.jpg" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/media-library/arc-handoff.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/media-library/arc-handoff.ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { type ArcAttachment } from "@/lib/arc-chat/persistence";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type AttachableAsset = { public_url: string; storage_path: string; content_type: string; file_name: string };

/** Pure: library asset rows → ArcAttachment[]. Library media is already a public
 *  URL, so unlike composer uploads it needs no GCS signing. */
export function toArcAttachments(assets: AttachableAsset[]): ArcAttachment[] {
  return assets.map((a) => ({
    url: a.public_url, objectPath: a.storage_path, contentType: a.content_type, name: a.file_name,
  }));
}

/** Load the selected assets (org-scoped) and return ArcAttachments. */
export async function loadArcAttachments(
  orgId: string, assetIds: string[], client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcAttachment[]> {
  if (assetIds.length === 0) return [];
  const { data, error } = await client
    .from("media_assets")
    .select("public_url, storage_path, content_type, file_name")
    .eq("org_id", orgId).in("id", assetIds);
  if (error) throw new Error(`load attachments failed: ${error.message}`);
  return toArcAttachments((data ?? []) as AttachableAsset[]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/media-library/arc-handoff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media-library/arc-handoff.ts src/lib/media-library/arc-handoff.test.ts
git commit -m "feat(media-library): map assets to ArcAttachment for Send to Arc"
```

---

## Task 6: Navigation (icon + nav item)

**Files:**
- Modify: `src/app/_components/nav-icons.tsx`
- Modify: `src/app/_components/console-frame.tsx:74-83`

- [ ] **Step 1: Add `"library"` to the icon union and paths**

In `src/app/_components/nav-icons.tsx`, add `| "library"` to the `NavIconName` union, and add this entry to the `paths` record (image-frame line icon, matching the existing stroke style):

```tsx
  // Framed image — media library
  library: (
    <>
      <rect height="14" rx="2" width="16" x="4" y="5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 16 4-3 3 2 4-4 5 5" />
    </>
  ),
```

- [ ] **Step 2: Add the nav item**

In `src/app/_components/console-frame.tsx`, add to the `navItems` array (after Campaigns, before Opportunities so media sits near campaign work):

```tsx
    { label: "Library", href: "/library", icon: "library", matches: ["/library"] },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: compiles; no missing-icon type error. (lint ≠ typecheck — see memory.)

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/nav-icons.tsx src/app/_components/console-frame.tsx
git commit -m "feat(media-library): add Library nav item + icon"
```

---

## Task 7: Page + components (server view first)

**Files:**
- Create: `src/app/library/page.tsx`
- Create: `src/app/library/_components/filter-chips.tsx`
- Create: `src/app/library/_components/folder-rail.tsx`
- Create: `src/app/library/_components/asset-grid.tsx`

UI logic stays thin; tested logic lives in domain/lib. Verify visually with `pnpm dev`.

- [ ] **Step 1: Write the page**

```tsx
// src/app/library/page.tsx
import { connection } from "next/server";

import { EmptyState, PageHeader } from "@/app/_components/page-header";
import { formatByteSize } from "@/domain";
import { getMediaLibraryData } from "@/lib/media-library/read-model";

import { AssetGrid } from "./_components/asset-grid";
import { FolderRail } from "./_components/folder-rail";

export default async function LibraryPage() {
  await connection();
  const data = await getMediaLibraryData();

  if (data.status === "unavailable") {
    return (
      <>
        <PageHeader title="Library" description={data.message} />
        <EmptyState title="Library unavailable" detail={data.message} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Library"
        description={`${data.assets.length} assets · ${formatByteSize(data.totalBytes)} · upload media and hand it to your agent.`}
      />
      {data.assets.length === 0 ? (
        <EmptyState title="No media yet" detail="Upload photos, video, or logos and they'll appear here." />
      ) : (
        <div className="flex gap-5">
          <FolderRail folders={data.folders} />
          <AssetGrid assets={data.assets} />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Write FolderRail (server component, presentational)**

```tsx
// src/app/library/_components/folder-rail.tsx
import { type MediaFolderView } from "@/lib/media-library/types";

export function FolderRail({ folders }: { folders: MediaFolderView[] }) {
  return (
    <nav className="w-[200px] shrink-0 space-y-1">
      {folders.map((f) => (
        <div key={f.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]">
          <span className="truncate">{f.name}</span>
          <span className="text-xs text-[var(--text-muted)]">{f.count}</span>
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Write AssetGrid + cards (presentational; client interactivity comes in Task 8)**

```tsx
// src/app/library/_components/asset-grid.tsx
import { type MediaAssetView } from "@/lib/media-library/types";

export function AssetGrid({ assets }: { assets: MediaAssetView[] }) {
  return (
    <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((a) => (
        <figure key={a.id} className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="relative aspect-[4/3] bg-[var(--surface-inset)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- user media, external/public URL */}
            <img alt={a.fileName} src={a.url} className="h-full w-full object-cover" />
            <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">{a.badge}</span>
            {a.usedInCount > 0 ? (
              <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-[var(--ok)]">Used in {a.usedInCount}</span>
            ) : null}
          </div>
          <figcaption className="px-2.5 py-2">
            <div className="truncate text-[12px] text-[var(--text-primary)]">{a.fileName}</div>
            <div className="text-[10px] text-[var(--text-muted)]">{[a.dimensions, a.size].filter(Boolean).join(" · ")}</div>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify the page renders**

Run: `pnpm dev`, open `http://localhost:3000/library`.
Expected: With Supabase unset → "Library unavailable". With Supabase + seeded media → folder rail + grid. (No data is fine; the empty state shows.)

- [ ] **Step 5: Commit**

```bash
git add src/app/library/page.tsx src/app/library/_components/folder-rail.tsx src/app/library/_components/asset-grid.tsx
git commit -m "feat(media-library): Library page with folder rail + asset grid"
```

---

## Task 8: Interactive components (client) — upload, drawer, lightbox, filter chips

**Files:**
- Create: `src/app/library/_components/upload-button.tsx`
- Create: `src/app/library/_components/detail-drawer.tsx`
- Create: `src/app/library/_components/lightbox.tsx`
- Create: `src/app/library/_components/filter-chips.tsx`
- Modify: `src/app/library/_components/asset-grid.tsx` — make a client wrapper that opens the drawer/lightbox and shows hover actions.

These are `"use client"` components wired to the Task 9 server actions. Keep each focused; verify via `pnpm dev`. (No unit tests — they hold no business logic; the tested logic lives in domain/lib.)

- [ ] **Step 1: UploadButton** — hidden `<input type="file" multiple>`; on change, POST each file to the `uploadAssets` action via a `<form>` with `FormData` (files under `files`), then `router.refresh()`. Show a progress/disabled state while pending using `useTransition`. Match the gold primary button styling from `theme`/`page-header` primitives.

- [ ] **Step 2: DetailDrawer** — props `asset: MediaAssetView`; renders preview, provenance rows (source, uploadedBy, dimensions, size), tag chips, "Used in {usedInCount}", and an Arc panel with a form button calling `toggleAvailableToArc` and a "Use in new Arc chat" button calling `sendAssetsToArc([asset.id])`. Closing handled by parent state.

- [ ] **Step 3: Lightbox** — fullscreen overlay; props `assets`, `index`, `onClose`, `onPrev`, `onNext`; renders the image, prev/next, counter "{index+1} of {assets.length}", and the action bar (Download link, Delete form, "Use in Arc"). Use the SVG icons from the v4 mockup.

- [ ] **Step 4: FilterChips** (`"use client"`) — chips All types · Photos · Video · Available to Arc · Unused; filter the in-memory `assets` array client-side and pass the result to the grid.

- [ ] **Step 5: Make AssetGrid a client island** that owns `selectedId`/`lightboxIndex` state, renders hover quick-action buttons (rename/move/download/delete) per card, the DetailDrawer, and the Lightbox. Keep the presentational card markup from Task 7.

- [ ] **Step 6: Verify** with `pnpm dev` on `/library`: upload a file, open the drawer, open the lightbox, toggle Arc, send to Arc. Confirm `router.refresh()` reflects changes.

- [ ] **Step 7: Commit**

```bash
git add src/app/library/_components
git commit -m "feat(media-library): upload, detail drawer, lightbox, filter chips"
```

---

## Task 9: Server actions

**Files:**
- Create: `src/app/library/actions.ts`

- [ ] **Step 1: Write the actions**

```ts
// src/app/library/actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { classifyKind, validateUpload } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { enqueueArcChatTask } from "@/lib/arc-chat/enqueue";
import { createConversation } from "@/lib/arc-chat/persistence"; // verify exact export name; see note
import { loadArcAttachments } from "@/lib/media-library/arc-handoff";
import {
  createFolder, deleteAsset, deleteFolder, insertAsset, moveAsset,
  renameAsset, renameFolder, setAssetTags, setAvailableToArc,
} from "@/lib/media-library/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

const OPERATOR = "Operator";

async function guard() {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) throw new Error("Supabase is not configured.");
  return getCurrentOrgId();
}

export async function createFolderAction(formData: FormData): Promise<void> {
  const orgId = await guard();
  const name = String(formData.get("name") ?? "").trim();
  if (name) await createFolder({ orgId, name });
  revalidatePath("/library");
}

export async function renameFolderAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (id && name) await renameFolder(id, name);
  revalidatePath("/library");
}

export async function deleteFolderAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteFolder(id);
  revalidatePath("/library");
}

export async function uploadAssetsAction(formData: FormData): Promise<void> {
  const orgId = await guard();
  const folderId = (String(formData.get("folderId") ?? "") || null) as string | null;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  for (const file of files) {
    const check = validateUpload({ contentType: file.type, byteSize: file.size });
    if (!check.ok) continue; // skip invalid; UI validates too
    const bytes = new Uint8Array(await file.arrayBuffer());
    await insertAsset({
      orgId, folderId, fileName: file.name, bytes, contentType: file.type,
      kind: classifyKind(file.type, file.name), byteSize: file.size, uploadedBy: OPERATOR,
    });
  }
  revalidatePath("/library");
}

export async function renameAssetAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (id && name) await renameAsset(id, name);
  revalidatePath("/library");
}

export async function moveAssetAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const folderId = (String(formData.get("folderId") ?? "") || null) as string | null;
  if (id) await moveAsset(id, folderId);
  revalidatePath("/library");
}

export async function setTagsAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const tags = String(formData.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (id) await setAssetTags(id, tags);
  revalidatePath("/library");
}

export async function toggleAvailableToArcAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "true") === "true";
  if (id) await setAvailableToArc(id, value);
  revalidatePath("/library");
}

export async function deleteAssetAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteAsset(id);
  revalidatePath("/library");
}

export async function sendAssetsToArcAction(formData: FormData): Promise<void> {
  const orgId = await guard();
  const ids = String(formData.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const attachments = await loadArcAttachments(orgId, ids);
  if (attachments.length === 0) return;
  const { conversationId, messageId } = await createConversation({
    operator: OPERATOR, title: "Media from Library",
  });
  await enqueueArcChatTask({
    conversationId, messageId, message: "Use these reference images.",
    mentions: [], operator: OPERATOR, attachments,
  });
  revalidatePath("/arc");
}
```

> **Implementation note for the engineer:** confirm the exact conversation-creation helper in `src/lib/arc-chat/persistence.ts` (open it and search for the function that the existing composer/`sendArcMessageAction` uses to start a conversation and produce a `messageId`). Reuse that exact function and its return shape rather than the placeholder `createConversation` name above. If conversation creation and message persistence are two calls in the existing flow, mirror that sequence here.

- [ ] **Step 2: Verify the arc-chat conversation helper name**

Run: `grep -n "export async function" src/lib/arc-chat/persistence.ts`
Expected: identify the real creator (e.g. `startConversation` / `insertConversation` / `appendMessage`). Update the import + call in `sendAssetsToArcAction` to match. Then `pnpm build`.

- [ ] **Step 3: Typecheck + lint scoped**

Run: `pnpm build` then `npx eslint src/app/library src/lib/media-library`
Expected: no type errors; lint clean on changed files (repo-wide lint noise is pre-existing — see memory).

- [ ] **Step 4: Commit**

```bash
git add src/app/library/actions.ts
git commit -m "feat(media-library): server actions for folders, assets, and Send to Arc"
```

---

## Task 10: Bearer-gated Arc read API

**Files:**
- Create: `src/app/api/v1/arc/media/route.ts`
- Test: `src/app/api/v1/arc/media/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/v1/arc/media/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/api-token", () => ({
  checkAgentBearer: vi.fn(async () => ({ ok: false, reason: "unauthorized", status: 401 })),
}));

import { checkAgentBearer } from "@/lib/auth/api-token";
import { GET } from "./route";

describe("GET /api/v1/arc/media", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s without a valid bearer token", async () => {
    const res = await GET(new Request("http://x/api/v1/arc/media"));
    expect(res.status).toBe(401);
  });

  it("503s when the token is not configured", async () => {
    (checkAgentBearer as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, reason: "not_configured", status: 503,
    });
    const res = await GET(new Request("http://x/api/v1/arc/media"));
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/v1/arc/media/route.test.ts`
Expected: FAIL — `./route` has no `GET`.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/v1/arc/media/route.ts
import { NextResponse } from "next/server";

import { checkAgentBearer } from "@/lib/auth/api-token";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Arc-facing read of approved media available to the agent.
 *   GET /api/v1/arc/media   Authorization: Bearer <ARC_AGENT_API_TOKEN>
 *   200 -> { ok: true, assets: [...] }   401 -> bad token   503 -> not configured
 */
export async function GET(request: Request) {
  const auth = await checkAgentBearer(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, status: auth.reason === "not_configured" ? "not_configured" : "unauthorized" },
      { status: auth.status },
    );
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: false, status: "not_configured" }, { status: 503 });
  }
  const orgId = await getCurrentOrgId();
  const { data, error } = await getSupabaseAdminClient()
    .from("media_assets")
    .select("id, file_name, public_url, kind, source, provenance, risk_flags, tags, width, height")
    .eq("org_id", orgId).eq("available_to_arc", true).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, status: "error", message: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, assets: data ?? [] }, { status: 200 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/v1/arc/media/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/arc/media/route.ts src/app/api/v1/arc/media/route.test.ts
git commit -m "feat(media-library): bearer-gated GET /api/v1/arc/media for Arc"
```

---

## Task 11: Used-in linkage stamp (exact match going forward)

**Files:**
- Modify: `src/lib/campaigns/create.ts:185-242` (the `AssetMediaProvenance` type + `promoteAssetToCampaign` media object)

- [ ] **Step 1: Extend the provenance type**

In `src/lib/campaigns/create.ts`, add an optional field to `AssetMediaProvenance`:

```ts
export type AssetMediaProvenance = {
  source?: string;
  model?: string;
  jobId?: string;
  format?: string;
  riskFlags?: string[];
  libraryAssetId?: string; // NEW: exact link back to a media_assets row
};
```

- [ ] **Step 2: Persist it in the media object**

In `promoteAssetToCampaign`, inside the `mediaAsset` object literal, add (alongside the existing spreads):

```ts
        ...(provenance.libraryAssetId ? { library_asset_id: provenance.libraryAssetId } : {}),
```

- [ ] **Step 3: Typecheck + existing tests still pass**

Run: `pnpm build && pnpm test src/lib/campaigns/create.test.ts src/lib/campaigns/create.promote.test.ts`
Expected: compiles; existing campaign tests pass (the field is additive/optional).

- [ ] **Step 4: Commit**

```bash
git add src/lib/campaigns/create.ts
git commit -m "feat(media-library): stamp library_asset_id into campaign media provenance"
```

---

## Task 12: Full verification pass

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test`
Expected: all green (new + existing).

- [ ] **Step 2: Typecheck**

Run: `pnpm build`
Expected: compiles with no type errors.

- [ ] **Step 3: Scoped lint**

Run: `npx eslint src/app/library src/lib/media-library src/domain/media-library.ts src/app/api/v1/arc/media`
Expected: clean (repo-wide lint noise is pre-existing — see memory `pnpm-lint-scans-vendor`).

- [ ] **Step 4: Manual smoke (if Supabase configured locally)**

Run: `pnpm dev` → `/library`. Upload an image, create a folder, move the image, toggle "Available to Arc", "Use in new Arc chat" (confirm a conversation appears under `/arc`), delete the image. With Supabase unset, confirm the page shows the unavailable state and actions no-op.

- [ ] **Step 5: Final commit (if anything pending)**

```bash
git add -A
git commit -m "chore(media-library): verification pass" || echo "nothing to commit"
```

---

## Self-review notes

- **Spec coverage:** nav (T6), storage reuse (T4), schema (T1), domain/lib/app layers (T2–T9), Send to Arc via ArcAttachment (T5/T9), Arc read API (T10), used-in linkage (T3 read + T11 stamp), error/unavailable degradation (T3/T7/T9). AI-generated auto-ingest is intentionally deferred to v1.1 per the spec (no task).
- **Known follow-up (flagged, not a placeholder):** Task 9 depends on the exact arc-chat conversation-creation helper; Step 2 verifies the real name before completing the task. This is called out explicitly rather than guessed.
- **Type consistency:** `MediaAssetView`/`MediaAssetRow`/`MediaFolderView` are defined once in `types.ts` and reused; `ArcAttachment` shape matches `src/lib/arc-chat/persistence.ts`.
