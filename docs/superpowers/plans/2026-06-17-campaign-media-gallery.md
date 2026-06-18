# Campaign Media Gallery ("Restoration Reel") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only top-level **Gallery** tab that surfaces every piece of campaign media across all campaigns in one "alive" feed — a spotlight reel hero + kinetic masonry of tiles, each click opening a lightbox with provenance and a link back to the owning campaign.

**Architecture:** A new `getMediaGallery()` read-model in `src/lib/campaigns/read-model.ts` flattens the media that the existing campaign read-model already extracts (no schema, no migration, no new API route). A static server page (`src/app/gallery/page.tsx`) loads it and hands serializable data to colocated client components that own all motion and interaction. Strictly read + navigate: no mutations, no outbound actions.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Supabase (admin client, already wired), Vitest, Tailwind with the project's CSS-variable theme. Motion is pure CSS (keyframes/transitions) — no animation library (per the project's "inline SVG / CSS over heavy libs" lessons).

---

## Background the engineer needs

- **Lint does not typecheck.** Run `pnpm build` (or `pnpm exec tsc --noEmit`) to catch type errors. `pnpm lint` scans vendored files and reports tens of thousands of unrelated problems — scope any lint check to changed files only.
- **Read-models return a discriminated union** `{ status: "live"; ... } | { status: "unavailable"; message }`. Guard every persistence/read call with `isSupabaseAdminConfigured()`; never throw when Supabase env is absent — return `unavailable`.
- **RSC boundary rule:** Server Components must pass only **serializable** props to Client Components — never functions (e.g. formatters). A prior `/analytics` prod crash came from passing a formatter across this boundary. All gallery data crossing into client components is plain data.
- **Existing media extraction** lives in `src/lib/campaigns/read-model.ts`:
  - `type CampaignMediaAsset = { id: string; type: "image"|"video"|"embed"|"file"|"link"; title: string; url: string; thumbnailUrl: string | null; mimeType: string | null; description: string | null; source: string }`
  - `collectMediaFromAsset(asset: CampaignAssetRow): CampaignMediaAsset[]` — extracts media from one asset row.
  - `collectMediaFromCampaign(campaign: CampaignRow): CampaignMediaAsset[]` — extracts campaign-level media.
  - `uniqueMedia(items): CampaignMediaAsset[]` — dedupes by URL.
  - Helpers already in the file and reusable from `getMediaGallery()` (same module): `getSupabaseAdminClient()`, `isSupabaseAdminConfigured()`, `assertSupabaseResult(label, error)`, `selectIn<T>(supabase, table, select, column, ids, orderColumn)`, constants `CAMPAIGN_SELECT`, `ASSET_SELECT`, and `humanize(value)`.
  - Row types (already defined in the module): `CampaignRow`, `CampaignAssetRow` (fields include `id`, `campaign_id`, `asset_type`, `title`, `status`, `tool_source`, `created_at`, `updated_at`).
- **`ThemeTone`** (`src/app/_components/theme.ts`) = `"amber" | "green" | "red" | "blue" | "gray" | "dark"`.
- **Shared UI primitives** (`src/app/_components/page-header.tsx`): `PageHeader({ title, description, aside? })`, `Panel`, `StatusPill({ children, tone?, icon? })`, `EmptyState({ title, detail, action? })`.
- **Nav icon `"gallery"` already exists** in `src/app/_components/nav-icons.tsx` — no icon work.
- **Test helper** `createSupabaseQueryMock(responses: Record<string, {data, error}>)` from `@/lib/repos/__tests__/test-helpers` — keys are table names; the mock resolves `.from(table).select(...)...` chains to the supplied `{ data, error }`. Pass a `SupabaseClient` into read-model functions to use it.
- Run a single test file with `pnpm test path/to/file.test.ts`.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/campaigns/gallery.ts` | **New.** `getMediaGallery()` + `GalleryItem`/`MediaGallery` types + pure helpers `normalizeApprovalStatus`, `deriveSourceType`, `filterGalleryItems`. Imports the existing extraction helpers from `./read-model`. |
| `src/lib/campaigns/gallery.test.ts` | **New.** Unit tests for the pure helpers + an integration test of `getMediaGallery()` with a mocked Supabase client. |
| `src/lib/campaigns/read-model.ts` | **Modify.** Export the few internal helpers/types `gallery.ts` needs (`collectMediaFromAsset`, `collectMediaFromCampaign`, `uniqueMedia`, `selectIn`, `assertSupabaseResult`, `CAMPAIGN_SELECT`, `ASSET_SELECT`, `CampaignRow`, `CampaignAssetRow`). |
| `src/app/_data/growth-engine.ts` | **Modify.** Add the Gallery nav item. |
| `src/app/gallery/page.tsx` | **New.** Server component: loads `getMediaGallery()`, renders `PageHeader` + `GalleryView`, or `EmptyState`. |
| `src/app/gallery/_components/gallery-view.tsx` | **New (client).** Holds filter + lightbox state; renders reel + filter bar + masonry + lightbox. |
| `src/app/gallery/_components/spotlight-reel.tsx` | **New (client).** Auto-cycling hero (reduced-motion aware). |
| `src/app/gallery/_components/gallery-filter-bar.tsx` | **New (client).** Type/provenance/status chips with live counts. |
| `src/app/gallery/_components/media-tile.tsx` | **New (client).** One tile: thumbnail, provenance badge, approval dot, tilt/float, click→open. |
| `src/app/gallery/_components/media-lightbox.tsx` | **New (client).** Overlay with large media + provenance sidebar + campaign link. |
| `src/app/gallery/gallery.css` | **New.** Keyframes + `prefers-reduced-motion` rules for reel/float/tilt. |

---

## Task 1: Export internal read-model helpers for reuse

**Files:**
- Modify: `src/lib/campaigns/read-model.ts`

No behavior change — just widen visibility of helpers `gallery.ts` will import. This task has no test of its own; it's verified by Task 2's tests compiling.

- [ ] **Step 1: Add `export` to the helpers and types gallery needs**

In `src/lib/campaigns/read-model.ts`, add the `export` keyword to each of these existing declarations (they are currently module-private):

```ts
// constants near the top
export const CAMPAIGN_SELECT = "id,name,persona,restoration_focus,status,...";  // add `export`
export const ASSET_SELECT = "id,campaign_id,asset_type,channel,title,status,...";  // add `export`

// row types
export type CampaignRow = { /* unchanged */ };          // add `export`
export type CampaignAssetRow = { /* unchanged */ };     // add `export`

// helper functions
export function collectMediaFromAsset(asset: CampaignAssetRow) { /* unchanged */ }       // add `export`
export function collectMediaFromCampaign(campaign: CampaignRow) { /* unchanged */ }       // add `export`
export function uniqueMedia(items: CampaignMediaAsset[]) { /* unchanged */ }              // add `export`
export async function selectIn<T>(/* unchanged */) { /* unchanged */ }                    // add `export`
export function assertSupabaseResult(label: string, error: { message: string } | null) { /* unchanged */ }  // add `export`
```

Leave every function **body** unchanged. `CampaignMediaAsset` and `humanize` are needed too — `CampaignMediaAsset` is already exported; add `export` to `humanize` if it is not already exported.

- [ ] **Step 2: Verify the project still type-checks**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no new errors). If `humanize` or any name was already exported, leave it.

- [ ] **Step 3: Commit**

```bash
git add src/lib/campaigns/read-model.ts
git commit -m "refactor(campaigns): export media-extraction helpers for gallery reuse"
```

---

## Task 2: `gallery.ts` pure helpers — `normalizeApprovalStatus` + `deriveSourceType`

**Files:**
- Create: `src/lib/campaigns/gallery.ts`
- Test: `src/lib/campaigns/gallery.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/campaigns/gallery.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { deriveSourceType, normalizeApprovalStatus } from "./gallery";

describe("normalizeApprovalStatus", () => {
  it("maps the approval_status enum to the four UI buckets", () => {
    expect(normalizeApprovalStatus("approved")).toBe("approved");
    expect(normalizeApprovalStatus("pending_approval")).toBe("pending");
    expect(normalizeApprovalStatus("pending_owner_approval")).toBe("pending");
    expect(normalizeApprovalStatus("needs_compliance")).toBe("pending");
    expect(normalizeApprovalStatus("declined")).toBe("rejected");
    expect(normalizeApprovalStatus("rejected")).toBe("rejected");
    expect(normalizeApprovalStatus("blocked")).toBe("rejected");
    expect(normalizeApprovalStatus("draft")).toBe("draft");
    expect(normalizeApprovalStatus("needs_revision")).toBe("draft");
    expect(normalizeApprovalStatus("archived")).toBe("draft");
    expect(normalizeApprovalStatus("something_unknown")).toBe("draft");
  });
});

describe("deriveSourceType", () => {
  it("flags prompt-driven asset types as AI-generated", () => {
    expect(deriveSourceType("image_prompt", null)).toBe("ai");
    expect(deriveSourceType("video_prompt", null)).toBe("ai");
  });

  it("flags generator tools as AI-generated", () => {
    expect(deriveSourceType("social_ad", "Higgsfield")).toBe("ai");
    expect(deriveSourceType("social_ad", "DALL-E pipeline")).toBe("ai");
  });

  it("treats everything else as real BSR media", () => {
    expect(deriveSourceType("social_ad", "Arc Orchestrator")).toBe("real");
    expect(deriveSourceType("one_pager", null)).toBe("real");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/campaigns/gallery.test.ts`
Expected: FAIL — cannot resolve `./gallery` / functions not defined.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/campaigns/gallery.ts`:

```ts
export type GallerySourceType = "real" | "ai";
export type GalleryApprovalStatus = "approved" | "pending" | "rejected" | "draft";

export function normalizeApprovalStatus(status: string): GalleryApprovalStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "pending_approval":
    case "pending_owner_approval":
    case "needs_compliance":
      return "pending";
    case "declined":
    case "rejected":
    case "blocked":
      return "rejected";
    default:
      // draft, needs_revision, revision_requested, archived, unknown
      return "draft";
  }
}

const AI_TOOL_PATTERN = /higgsfield|dall|midjourney|stable\s*diffusion|sdxl|imagen|firefly|generat|\bai\b/i;

export function deriveSourceType(assetType: string, toolSource: string | null): GallerySourceType {
  if (assetType === "image_prompt" || assetType === "video_prompt") return "ai";
  if (toolSource && AI_TOOL_PATTERN.test(toolSource)) return "ai";
  return "real";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/campaigns/gallery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/gallery.ts src/lib/campaigns/gallery.test.ts
git commit -m "feat(gallery): add provenance + approval-status normalizers"
```

---

## Task 3: `filterGalleryItems` pure helper

**Files:**
- Modify: `src/lib/campaigns/gallery.ts`
- Modify: `src/lib/campaigns/gallery.test.ts`

The client filter bar will call this so the filtering logic stays unit-tested and out of the component.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/campaigns/gallery.test.ts`:

```ts
import { filterGalleryItems, type GalleryItem } from "./gallery";

function item(partial: Partial<GalleryItem>): GalleryItem {
  return {
    media: { id: "m1", type: "image", title: "t", url: "https://x/a.png", thumbnailUrl: null, mimeType: null, description: null, source: "s" },
    campaignId: "c1",
    campaignName: "Campaign",
    assetType: "social_ad",
    approvalStatus: "approved",
    sourceType: "real",
    format: null,
    updatedAtIso: "2026-06-01T00:00:00.000Z",
    usedInCount: 1,
    ...partial,
  };
}

describe("filterGalleryItems", () => {
  const items = [
    item({ media: { id: "a", type: "image", title: "a", url: "https://x/a.png", thumbnailUrl: null, mimeType: null, description: null, source: "s" }, sourceType: "real", approvalStatus: "approved" }),
    item({ media: { id: "b", type: "video", title: "b", url: "https://x/b.mp4", thumbnailUrl: null, mimeType: null, description: null, source: "s" }, sourceType: "ai", approvalStatus: "pending" }),
    item({ media: { id: "c", type: "file", title: "c", url: "https://x/c.pdf", thumbnailUrl: null, mimeType: null, description: null, source: "s" }, sourceType: "real", approvalStatus: "approved" }),
  ];

  it("returns everything when filters are 'all'", () => {
    expect(filterGalleryItems(items, { type: "all", provenance: "all", status: "all" })).toHaveLength(3);
  });

  it("filters by media type group (images only)", () => {
    const out = filterGalleryItems(items, { type: "images", provenance: "all", status: "all" });
    expect(out.map((i) => i.media.id)).toEqual(["a"]);
  });

  it("filters by provenance", () => {
    const out = filterGalleryItems(items, { type: "all", provenance: "ai", status: "all" });
    expect(out.map((i) => i.media.id)).toEqual(["b"]);
  });

  it("filters by status and combines filters", () => {
    const out = filterGalleryItems(items, { type: "all", provenance: "real", status: "approved" });
    expect(out.map((i) => i.media.id)).toEqual(["a", "c"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/campaigns/gallery.test.ts`
Expected: FAIL — `filterGalleryItems` / `GalleryItem` not exported.

- [ ] **Step 3: Write the minimal implementation**

Add to `src/lib/campaigns/gallery.ts` (import the media type from read-model at the top of the file):

```ts
import type { CampaignMediaAsset } from "./read-model";

export type GalleryItem = {
  media: CampaignMediaAsset;
  campaignId: string;
  campaignName: string;
  assetType: string;
  approvalStatus: GalleryApprovalStatus;
  sourceType: GallerySourceType;
  format: string | null;
  updatedAtIso: string;
  usedInCount: number;
};

export type GalleryTypeFilter = "all" | "images" | "video" | "docs";
export type GalleryProvenanceFilter = "all" | "real" | "ai";
export type GalleryStatusFilter = "all" | "approved" | "pending";

export type GalleryFilters = {
  type: GalleryTypeFilter;
  provenance: GalleryProvenanceFilter;
  status: GalleryStatusFilter;
};

function matchesType(mediaType: CampaignMediaAsset["type"], filter: GalleryTypeFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "images":
      return mediaType === "image";
    case "video":
      return mediaType === "video" || mediaType === "embed";
    case "docs":
      return mediaType === "file";
  }
}

export function filterGalleryItems(items: GalleryItem[], filters: GalleryFilters): GalleryItem[] {
  return items.filter((item) => {
    if (!matchesType(item.media.type, filters.type)) return false;
    if (filters.provenance !== "all" && item.sourceType !== filters.provenance) return false;
    if (filters.status !== "all" && item.approvalStatus !== filters.status) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/campaigns/gallery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/gallery.ts src/lib/campaigns/gallery.test.ts
git commit -m "feat(gallery): add filterGalleryItems with GalleryItem model"
```

---

## Task 4: `getMediaGallery()` — flatten media across all campaigns

**Files:**
- Modify: `src/lib/campaigns/gallery.ts`
- Modify: `src/lib/campaigns/gallery.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/campaigns/gallery.test.ts`:

```ts
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";
import { getMediaGallery } from "./gallery";

function campaignRow(over: Record<string, unknown> = {}) {
  return {
    id: "camp-1", name: "Spring Storm Response", persona: "persona_property_manager",
    restoration_focus: "water_backup", status: "pending_approval", company_id: null,
    contact_id: null, lead_id: null, owner: "Arc", objective: "x", audience_summary: null,
    offer_summary: null, compliance_notes: null, launch_locked: true, source_signal: {},
    source_system: null, reasoning_payload: {}, audit_payload: {},
    created_at: "2026-06-01T00:00:00.000Z", updated_at: "2026-06-01T00:00:00.000Z", ...over,
  };
}
function assetRow(over: Record<string, unknown> = {}) {
  return {
    id: "asset-1", campaign_id: "camp-1", asset_type: "image_prompt", channel: "image",
    title: "Hero", status: "approved", tool_source: "Higgsfield", prompt_input: null,
    prompt_inputs: {}, draft_body: null, edited_body: null, approved_body: null,
    dispatch_locked: true, compliance_notes: null, reasoning_payload: {},
    audit_payload: { media_assets: [{ url: "https://cdn.example/hero.png", type: "image", title: "Hero" }] },
    created_at: "2026-06-02T00:00:00.000Z", updated_at: "2026-06-02T00:00:00.000Z", ...over,
  };
}

describe("getMediaGallery", () => {
  it("returns unavailable when Supabase is not configured", async () => {
    const result = await getMediaGallery();
    expect(result.status).toBe("unavailable");
  });

  it("flattens media across campaigns with provenance, status and a hero set", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: [campaignRow()], error: null },
      campaign_assets: { data: [assetRow()], error: null },
      approval_items: { data: [], error: null },
      agent_outputs: { data: [], error: null },
    });

    const result = await getMediaGallery(supabase);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;

    expect(result.items).toHaveLength(1);
    const first = result.items[0];
    expect(first.media.url).toBe("https://cdn.example/hero.png");
    expect(first.campaignName).toBe("Spring Storm Response");
    expect(first.sourceType).toBe("ai");        // image_prompt + Higgsfield
    expect(first.approvalStatus).toBe("approved");
    expect(result.totals).toMatchObject({ media: 1, campaigns: 1, approved: 1, ai: 1 });
    // approved image lands in the hero reel
    expect(result.hero.map((h) => h.media.url)).toContain("https://cdn.example/hero.png");
  });

  it("dedupes identical media reused across campaigns and counts usage", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: [campaignRow({ id: "camp-1" }), campaignRow({ id: "camp-2", name: "Mold Awareness" })], error: null },
      campaign_assets: {
        data: [
          assetRow({ id: "asset-1", campaign_id: "camp-1" }),
          assetRow({ id: "asset-2", campaign_id: "camp-2" }),
        ],
        error: null,
      },
      approval_items: { data: [], error: null },
      agent_outputs: { data: [], error: null },
    });

    const result = await getMediaGallery(supabase);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].usedInCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/campaigns/gallery.test.ts`
Expected: FAIL — `getMediaGallery` not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/campaigns/gallery.ts`. Extend the existing import from `./read-model` and add the Supabase imports:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  ASSET_SELECT,
  CAMPAIGN_SELECT,
  assertSupabaseResult,
  collectMediaFromAsset,
  collectMediaFromCampaign,
  selectIn,
  type CampaignAssetRow,
  type CampaignMediaAsset,
  type CampaignRow,
} from "./read-model";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

export type MediaGallery =
  | { status: "unavailable"; message: string }
  | {
      status: "live";
      items: GalleryItem[];
      hero: GalleryItem[];
      totals: { media: number; campaigns: number; approved: number; ai: number };
    };

const HERO_MAX = 6;

export async function getMediaGallery(client?: SupabaseClient): Promise<MediaGallery> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select(CAMPAIGN_SELECT)
      .order("updated_at", { ascending: false })
      .limit(100);
    assertSupabaseResult("campaigns", error);

    const campaigns = (data ?? []) as CampaignRow[];
    const campaignIds = campaigns.map((c) => c.id);
    const campaignName = new Map(campaigns.map((c) => [c.id, c.name] as const));
    const assets = await selectIn<CampaignAssetRow>(supabase, "campaign_assets", ASSET_SELECT, "campaign_id", campaignIds, "updated_at");

    // Flatten per-asset media (carries the asset's provenance + status), then
    // campaign-level media (no owning asset → treated as real, status "approved"
    // only insofar as it is reference media; we mark it "draft" to avoid implying
    // an approval it never had).
    const collected: GalleryItem[] = [];

    for (const asset of assets) {
      const owner = campaigns.find((c) => c.id === asset.campaign_id);
      if (!owner) continue;
      for (const media of collectMediaFromAsset(asset)) {
        collected.push({
          media,
          campaignId: owner.id,
          campaignName: owner.name,
          assetType: asset.asset_type,
          approvalStatus: normalizeApprovalStatus(asset.status),
          sourceType: deriveSourceType(asset.asset_type, asset.tool_source),
          format: asset.channel ?? null,
          updatedAtIso: asset.updated_at,
          usedInCount: 1,
        });
      }
    }

    for (const campaign of campaigns) {
      for (const media of collectMediaFromCampaign(campaign)) {
        collected.push({
          media,
          campaignId: campaign.id,
          campaignName: campaign.name,
          assetType: "campaign",
          approvalStatus: "draft",
          sourceType: "real",
          format: null,
          updatedAtIso: campaign.updated_at,
          usedInCount: 1,
        });
      }
    }

    // Dedupe by media URL, keeping the newest occurrence and counting reuse.
    const byUrl = new Map<string, GalleryItem>();
    for (const entry of collected) {
      const key = entry.media.url;
      const existing = byUrl.get(key);
      if (!existing) {
        byUrl.set(key, { ...entry });
        continue;
      }
      existing.usedInCount += 1;
      if (entry.updatedAtIso > existing.updatedAtIso) {
        byUrl.set(key, { ...entry, usedInCount: existing.usedInCount });
      }
    }

    const items = [...byUrl.values()].sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));

    const hero = items
      .filter((i) => i.approvalStatus === "approved" && (i.media.type === "image" || i.media.type === "video"))
      .slice(0, HERO_MAX);

    return {
      status: "live",
      items,
      hero,
      totals: {
        media: items.length,
        campaigns: new Set(items.map((i) => i.campaignId)).size,
        approved: items.filter((i) => i.approvalStatus === "approved").length,
        ai: items.filter((i) => i.sourceType === "ai").length,
      },
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "The media gallery is unavailable." };
  }
}
```

> Note: `campaignName` map is not strictly required (we read `owner.name` directly) — drop the unused `const campaignName = ...` line if `pnpm exec tsc --noEmit` flags it as unused.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/campaigns/gallery.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS. Remove any unused local the compiler flags.

- [ ] **Step 6: Commit**

```bash
git add src/lib/campaigns/gallery.ts src/lib/campaigns/gallery.test.ts
git commit -m "feat(gallery): getMediaGallery flattens + dedupes media across campaigns"
```

---

## Task 5: Nav item + gallery CSS + server page (degraded/empty path first)

**Files:**
- Modify: `src/app/_data/growth-engine.ts`
- Create: `src/app/gallery/gallery.css`
- Create: `src/app/gallery/page.tsx`

- [ ] **Step 1: Add the Gallery nav item**

In `src/app/_data/growth-engine.ts`, insert Gallery after Campaigns:

```ts
export const navItems = [
  { label: "Arc", href: "/arc", icon: "agents" },
  { label: "Campaigns", href: "/campaigns", icon: "approval" },
  { label: "Gallery", href: "/gallery", icon: "gallery" },
  { label: "Opportunities", href: "/opportunities", icon: "opportunities" },
];
```

> If `pnpm exec tsc --noEmit` complains that `"agents"`/`"approval"` are not `NavIconName`, the file already uses those strings today — leave them. `"gallery"` is a valid `NavIconName`.

- [ ] **Step 2: Create the motion stylesheet with reduced-motion guards**

Create `src/app/gallery/gallery.css`:

```css
@keyframes gallery-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes gallery-hero-fade {
  0%, 100% { opacity: 1; }
  6% { opacity: 1; }
}

.gallery-tile { animation: gallery-float 6s ease-in-out infinite; transition: transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s; }
.gallery-tile:nth-child(2n) { animation-duration: 7.5s; animation-delay: -2s; }
.gallery-tile:nth-child(3n) { animation-duration: 5.5s; animation-delay: -1s; }
.gallery-tile:hover { transform: translateY(-4px) scale(1.03); box-shadow: 0 18px 30px rgba(0,0,0,.22); }

.gallery-masonry { columns: 4; column-gap: .75rem; }
@media (max-width: 1100px) { .gallery-masonry { columns: 3; } }
@media (max-width: 720px) { .gallery-masonry { columns: 2; } }
.gallery-masonry > * { break-inside: avoid; margin-bottom: .75rem; }

@media (prefers-reduced-motion: reduce) {
  .gallery-tile { animation: none !important; }
  .gallery-tile:hover { transform: none; }
  .gallery-hero-cycle { animation: none !important; }
}
```

- [ ] **Step 3: Create the server page (empty/unavailable path renders now; `GalleryView` wired in Task 9)**

Create `src/app/gallery/page.tsx`:

```tsx
import { EmptyState, PageHeader, StatusPill } from "@/app/_components/page-header";
import { getMediaGallery } from "@/lib/campaigns/gallery";

import "./gallery.css";
import { GalleryView } from "./_components/gallery-view";

export default async function GalleryPage() {
  const gallery = await getMediaGallery();

  if (gallery.status !== "live" || gallery.items.length === 0) {
    return (
      <>
        <PageHeader title="Gallery" description="Every piece of campaign media Arc has produced, in one place." />
        <div className="mt-6">
          <EmptyState
            title={gallery.status === "live" ? "No campaign media yet" : "Gallery unavailable"}
            detail={
              gallery.status === "live"
                ? "Once campaigns produce approved media and creative, it will show up here."
                : gallery.message
            }
          />
        </div>
      </>
    );
  }

  const { totals } = gallery;

  return (
    <>
      <PageHeader
        title="Gallery"
        description="Every piece of campaign media Arc has produced, in one place."
        aside={
          <>
            <StatusPill tone="gray">{totals.media} media</StatusPill>
            <StatusPill tone="green">{totals.approved} approved</StatusPill>
            <StatusPill tone="red">{totals.ai} AI</StatusPill>
          </>
        }
      />
      <div className="mt-6">
        <GalleryView items={gallery.items} hero={gallery.hero} />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Temporarily stub `GalleryView` so the page compiles**

Create `src/app/gallery/_components/gallery-view.tsx` as a minimal stub (replaced in Tasks 6–9):

```tsx
"use client";

import type { GalleryItem } from "@/lib/campaigns/gallery";

export function GalleryView({ items }: { items: GalleryItem[]; hero: GalleryItem[] }) {
  return <div>{items.length} media</div>;
}
```

- [ ] **Step 5: Verify build + nav**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Run: `pnpm build`
Expected: PASS; `/gallery` appears in the route list.

- [ ] **Step 6: Commit**

```bash
git add src/app/_data/growth-engine.ts src/app/gallery/gallery.css src/app/gallery/page.tsx src/app/gallery/_components/gallery-view.tsx
git commit -m "feat(gallery): add Gallery nav + server page with empty/unavailable states"
```

---

## Task 6: `MediaTile` component

**Files:**
- Create: `src/app/gallery/_components/media-tile.tsx`

Pure presentational client component (no test — verified by build + manual smoke; all branching logic was unit-tested in `gallery.ts`).

- [ ] **Step 1: Implement the tile**

Create `src/app/gallery/_components/media-tile.tsx`:

```tsx
"use client";

import type { GalleryItem } from "@/lib/campaigns/gallery";

const STATUS_DOT: Record<GalleryItem["approvalStatus"], string> = {
  approved: "var(--success, #2f8f4e)",
  pending: "var(--warning, #c98a1b)",
  rejected: "var(--accent, #b3251f)",
  draft: "var(--text-secondary, #8a877f)",
};

export function MediaTile({ item, onOpen }: { item: GalleryItem; onOpen: (item: GalleryItem) => void }) {
  const { media } = item;
  const isAi = item.sourceType === "ai";
  const thumb = media.thumbnailUrl ?? (media.type === "image" ? media.url : null);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="gallery-tile group relative block w-full overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-left"
      aria-label={`Open ${media.title}`}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={media.title} className="block w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-[var(--surface)] text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
          {media.type}
        </div>
      )}

      <span
        className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
        style={{ background: isAi ? "rgba(179,37,31,.92)" : "rgba(28,29,31,.82)" }}
      >
        {isAi ? "AI" : "Real"}
      </span>
      <span
        className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white"
        style={{ background: STATUS_DOT[item.approvalStatus] }}
        aria-hidden="true"
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] text-white transition-transform duration-300 group-hover:translate-y-0">
        {media.title} · {item.campaignName}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/gallery/_components/media-tile.tsx
git commit -m "feat(gallery): add MediaTile with provenance badge + status dot"
```

---

## Task 7: `MediaLightbox` component

**Files:**
- Create: `src/app/gallery/_components/media-lightbox.tsx`

- [ ] **Step 1: Implement the lightbox**

Create `src/app/gallery/_components/media-lightbox.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import type { GalleryItem } from "@/lib/campaigns/gallery";

const STATUS_TONE = { approved: "green", pending: "amber", rejected: "red", draft: "gray" } as const;

export function MediaLightbox({ item, onClose }: { item: GalleryItem | null; onClose: () => void }) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;
  const { media } = item;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={media.title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="grid max-h-[88vh] w-full max-w-5xl grid-cols-1 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] md:grid-cols-[1.6fr_1fr]"
      >
        <div className="flex items-center justify-center bg-black/40 p-3">
          {media.type === "video" ? (
            <video src={media.url} controls className="max-h-[80vh] w-full rounded" />
          ) : media.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt={media.title} className="max-h-[80vh] w-full rounded object-contain" />
          ) : (
            <div className="p-10 text-center text-sm text-[var(--text-secondary)]">Preview not available for this file type.</div>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-3 p-5">
          <div>
            <h2 className="font-serif text-lg font-semibold text-[var(--text-primary)]">{media.title}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.campaignName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={item.sourceType === "ai" ? "red" : "gray"}>{item.sourceType === "ai" ? "AI generated" : "Real BSR media"}</StatusPill>
            <StatusPill tone={STATUS_TONE[item.approvalStatus]}>{item.approvalStatus}</StatusPill>
          </div>
          <dl className="mt-1 space-y-2 border-t border-[var(--border-hairline)] pt-3 text-sm">
            <Row k="Type" v={media.type} />
            <Row k="Asset" v={item.assetType} />
            {item.format ? <Row k="Format" v={item.format} /> : null}
            {item.usedInCount > 1 ? <Row k="Used in" v={`${item.usedInCount} campaigns`} /> : null}
            <Row k="Source" v={media.source} />
          </dl>
          <div className="mt-auto flex gap-2 pt-3">
            <Link
              href={`/campaigns/${item.campaignId}`}
              className="flex-1 rounded-md bg-[var(--accent)] px-3 py-2 text-center text-sm font-semibold text-[var(--accent-contrast)]"
            >
              Open campaign →
            </Link>
            <a
              href={media.url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-md px-3 py-2 text-center text-sm font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] hover:text-[var(--text-primary)]"
            >
              View full size
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--text-secondary)]">{k}</dt>
      <dd className="truncate text-right font-medium text-[var(--text-primary)]">{v}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS. (`STATUS_TONE` values are valid `ThemeTone`s.)

- [ ] **Step 3: Commit**

```bash
git add src/app/gallery/_components/media-lightbox.tsx
git commit -m "feat(gallery): add MediaLightbox with provenance sidebar + campaign link"
```

---

## Task 8: `SpotlightReel` + `GalleryFilterBar`

**Files:**
- Create: `src/app/gallery/_components/spotlight-reel.tsx`
- Create: `src/app/gallery/_components/gallery-filter-bar.tsx`

- [ ] **Step 1: Implement the spotlight reel**

Create `src/app/gallery/_components/spotlight-reel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

import type { GalleryItem } from "@/lib/campaigns/gallery";

export function SpotlightReel({ items, onOpen }: { items: GalleryItem[]; onOpen: (item: GalleryItem) => void }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % items.length), 4500);
    return () => window.clearInterval(id);
  }, [items.length]);

  if (items.length === 0) return null;
  const current = items[Math.min(active, items.length - 1)];
  const media = current.media;
  const bg = media.thumbnailUrl ?? media.url;

  return (
    <section className="gallery-hero-cycle relative mb-6 overflow-hidden rounded-xl border border-[var(--border-hairline)]" style={{ aspectRatio: "16 / 6" }}>
      <button type="button" onClick={() => onOpen(current)} className="block h-full w-full text-left">
        {media.type === "image" || media.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt={media.title} className="h-full w-full object-cover transition-opacity duration-700" />
        ) : (
          <div className="h-full w-full bg-[var(--surface-inset)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
        <div className="absolute bottom-0 left-0 p-5 text-white">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Featured · approved</div>
          <div className="font-serif text-xl font-semibold">{media.title}</div>
          <div className="text-sm opacity-90">{current.campaignName}</div>
        </div>
      </button>
      {items.length > 1 ? (
        <div className="absolute bottom-3 right-4 flex gap-1.5">
          {items.map((it, i) => (
            <button
              key={it.media.id}
              type="button"
              aria-label={`Show featured ${i + 1}`}
              onClick={() => setActive(i)}
              className="h-2 w-2 rounded-full"
              style={{ background: i === active ? "white" : "rgba(255,255,255,.45)" }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Implement the filter bar**

Create `src/app/gallery/_components/gallery-filter-bar.tsx`:

```tsx
"use client";

import type { GalleryFilters } from "@/lib/campaigns/gallery";

const TYPE_OPTS: Array<[GalleryFilters["type"], string]> = [["all", "All"], ["images", "Images"], ["video", "Video"], ["docs", "Docs"]];
const PROV_OPTS: Array<[GalleryFilters["provenance"], string]> = [["all", "All sources"], ["real", "Real BSR"], ["ai", "AI"]];
const STATUS_OPTS: Array<[GalleryFilters["status"], string]> = [["all", "Any status"], ["approved", "Approved"], ["pending", "Pending"]];

export function GalleryFilterBar({
  filters,
  onChange,
  shownCount,
  totalCount,
}: {
  filters: GalleryFilters;
  onChange: (next: GalleryFilters) => void;
  shownCount: number;
  totalCount: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2">
      <Group value={filters.type} opts={TYPE_OPTS} onPick={(type) => onChange({ ...filters, type })} />
      <span className="mx-1 h-4 w-px bg-[var(--border-hairline)]" />
      <Group value={filters.provenance} opts={PROV_OPTS} onPick={(provenance) => onChange({ ...filters, provenance })} />
      <span className="mx-1 h-4 w-px bg-[var(--border-hairline)]" />
      <Group value={filters.status} opts={STATUS_OPTS} onPick={(status) => onChange({ ...filters, status })} />
      <span className="ml-auto pr-1 text-xs text-[var(--text-secondary)]">{shownCount} of {totalCount}</span>
    </div>
  );
}

function Group<T extends string>({ value, opts, onPick }: { value: T; opts: Array<[T, string]>; onPick: (v: T) => void }) {
  return (
    <div className="flex gap-1">
      {opts.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onPick(key)}
          aria-pressed={value === key}
          className={
            value === key
              ? "rounded-full bg-[var(--text-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--surface)]"
              : "rounded-full px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/gallery/_components/spotlight-reel.tsx src/app/gallery/_components/gallery-filter-bar.tsx
git commit -m "feat(gallery): add spotlight reel + filter bar"
```

---

## Task 9: Wire `GalleryView` together

**Files:**
- Modify: `src/app/gallery/_components/gallery-view.tsx`

- [ ] **Step 1: Replace the stub with the full composition**

Overwrite `src/app/gallery/_components/gallery-view.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";

import { filterGalleryItems, type GalleryFilters, type GalleryItem } from "@/lib/campaigns/gallery";
import { EmptyState } from "@/app/_components/page-header";

import { GalleryFilterBar } from "./gallery-filter-bar";
import { MediaLightbox } from "./media-lightbox";
import { MediaTile } from "./media-tile";
import { SpotlightReel } from "./spotlight-reel";

const DEFAULT_FILTERS: GalleryFilters = { type: "all", provenance: "all", status: "all" };

export function GalleryView({ items, hero }: { items: GalleryItem[]; hero: GalleryItem[] }) {
  const [filters, setFilters] = useState<GalleryFilters>(DEFAULT_FILTERS);
  const [open, setOpen] = useState<GalleryItem | null>(null);

  const shown = useMemo(() => filterGalleryItems(items, filters), [items, filters]);

  return (
    <div>
      <SpotlightReel items={hero} onOpen={setOpen} />
      <GalleryFilterBar filters={filters} onChange={setFilters} shownCount={shown.length} totalCount={items.length} />

      {shown.length === 0 ? (
        <EmptyState title="No media matches these filters" detail="Try widening the type, source, or status filters." />
      ) : (
        <div className="gallery-masonry">
          {shown.map((item) => (
            <MediaTile key={`${item.campaignId}-${item.media.id}`} item={item} onOpen={setOpen} />
          ))}
        </div>
      )}

      <MediaLightbox item={open} onClose={() => setOpen(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Lint only the changed files**

Run: `pnpm exec eslint src/app/gallery src/lib/campaigns/gallery.ts`
Expected: No errors (warnings from the `no-img-element` rule are suppressed inline; if the eslint config errors on them, keep the disable comments).

- [ ] **Step 4: Commit**

```bash
git add src/app/gallery/_components/gallery-view.tsx
git commit -m "feat(gallery): compose reel + filters + masonry + lightbox"
```

---

## Task 10: Full test run + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `pnpm test`
Expected: PASS (existing suite green + new `gallery.test.ts`).

- [ ] **Step 2: Seed and smoke locally**

Run: `pnpm seed:test-campaign` (or `pnpm seed:arc-demo`), then `pnpm dev` and open `http://localhost:3000/gallery`.
Expected/verify:
- Gallery appears in the left nav (framed-photo icon), after Campaigns.
- The spotlight reel shows an approved image/video and auto-advances (~4.5s).
- Tiles float gently and lift/tilt on hover; provenance badge (Real/AI) + status dot render.
- Clicking a tile opens the lightbox; "Open campaign →" navigates to `/campaigns/<id>`; Esc and backdrop close it.
- Filter chips narrow the feed and the "N of M" count updates.
- Toggle OS "reduce motion" → reel stops auto-advancing and float/tilt are disabled.
- With no media (or Supabase env unset) the page shows the `EmptyState`, not a broken hero.

- [ ] **Step 3: Final commit (if smoke required any fixes)**

```bash
git add -A
git commit -m "fix(gallery): smoke-test adjustments"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** new nav tab (Task 5) ✓; `getMediaGallery()` flatten + dedupe + degraded shape (Task 4) ✓; spotlight reel hero approved-only (Task 8) ✓; kinetic masonry + tilt (Tasks 5 css, 6) ✓; lightbox with provenance + campaign link (Task 7) ✓; provenance badge + status dot every tile (Task 6) ✓; filters client-side (Task 8) ✓; `prefers-reduced-motion` (Tasks 5 css, 8) ✓; empty/degraded states (Task 5) ✓; read-only/approval-safe — no mutations, no new API/migration/env (all tasks) ✓; tests (Tasks 2–4, 10) ✓.
- **Placeholder scan:** no TBD/TODO; every code step has full code.
- **Type consistency:** `GalleryItem`, `GalleryFilters`, `MediaGallery`, `normalizeApprovalStatus`, `deriveSourceType`, `filterGalleryItems`, `getMediaGallery` names are used identically across read-model, page, and components. `ThemeTone` values used in lightbox/page (`green`/`amber`/`red`/`gray`) are valid.
- **Deferred:** the "living wall" ambient mode and infinite-scroll pagination remain explicit non-goals per the spec.
