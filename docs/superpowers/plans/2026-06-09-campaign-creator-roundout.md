# Round Out the Campaign Creator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editing, photo add/remove, one-step create-&-deploy, and a Send-to-Arc hand-off to operator-authored draft campaigns.

**Architecture:** Pure edit validation in `domain/`; a shared `insertPhotoAsset` helper extracted from the existing create flow; new `lib/campaigns/manage.ts` for add/remove/update (all guarded to operator-authored drafts); new server actions; a small `operatorPhotos` slice + `sourceSystem` on the detail read-model; and UI (two create buttons, an edit page, a detail-page operator panel).

**Tech Stack:** TypeScript, Next.js 16, React 19, Supabase (DB + Storage), Vitest. pnpm. `@/*` → `./src/*`.

**Spec:** `docs/superpowers/specs/2026-06-09-campaign-creator-roundout-design.md`

---

## Verified integration facts

- `createOperatorCampaign` (`src/lib/campaigns/create.ts`) writes, per photo: a `campaign_assets` row (`status='approved'`, `dispatch_locked=true`, `audit_payload.media_assets=[{url}]`), an `approved` `approval_items` row, and an `approval_decisions` row. It has local `insertOne`/`insertNoReturn` helpers and `defaultUploader`.
- `launchCampaign({campaignId, operator})` (`src/lib/campaigns/launch.ts`) gates on `launch_locked=true` + at least one `approved` approval_item; it sets the campaign `active`, unlocks approved assets, enqueues Outbox dispatches.
- `sendArcDirective({campaignId, message, operator}, client)` (`src/lib/campaigns/arc-conversation.ts`) records a directive to Arc. `sendMarkMessageAction` in `actions.ts` is the existing caller pattern.
- `actions.ts` already imports: `requireOperator`, `getOperatorActor` (`@/lib/auth/operator`), `isSupabaseAdminConfigured`, `getSupabaseAdminClient` (`@/lib/supabase/server`), `revalidatePath`, `redirect`, `parseCampaignDraft`, `createOperatorCampaign`, `type CampaignPhoto`. It has a `readPhotos(formData)` helper and `createCampaignAction`.
- Detail read-model `getCampaignWorkspaceDetail` (`src/lib/campaigns/read-model.ts`): selects the campaign via a `CAMPAIGN_SELECT` constant into `CampaignRow`, builds `campaign: CampaignWorkspaceMeta` inline, and fetches `assets: CampaignAssetRow[]` (which include `id`, `dispatch_locked`, `audit_payload`). `CampaignWorkspaceMeta` has no `sourceSystem`; there is no `operatorPhotos` slice. `CampaignRow` does not currently include `source_system`.
- `campaign_event_type` valid values include `created`, `asset_generated`, `archived`, `planned`.
- `approval_items.campaign_asset_id` is `on delete cascade`, so deleting an asset removes its approval rows.
- Storage: `client.storage.from("campaign-media").remove([path])` deletes an object; `.upload(path, bytes, {contentType, upsert:true})` + `.getPublicUrl(path)` is the existing pattern.
- UI primitives: `Button`, `buttonClasses`, `PageHeader` (`_components/page-header`); `theme.control.input`, `cx` (`_components/theme`); CSS vars `--text-muted`, `--text-secondary`, `--priority-bright`, `--border-panel`, `--surface-inset` all exist. `CampaignCreateForm` lives at `src/app/campaigns/_components/campaign-create-form.tsx`.

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/domain/campaign-drafts.ts` | add `parseCampaignEdit` | Modify |
| `src/domain/__tests__/campaign-drafts.test.ts` | edit tests | Modify |
| `src/lib/campaigns/create.ts` | extract `insertPhotoAsset`; store `{url,path}` | Modify |
| `src/lib/campaigns/create.test.ts` | assert `path` in media_assets | Modify |
| `src/lib/campaigns/manage.ts` | `assertOperatorDraft`, `addCampaignPhotos`, `updateOperatorCampaign`, `removeCampaignAsset` | Create |
| `src/lib/campaigns/manage.test.ts` | persistence tests | Create |
| `src/lib/campaigns/read-model.ts` | `sourceSystem` on meta + `operatorPhotos` slice | Modify |
| `src/lib/campaigns/read-model.operator-photos.test.ts` | `buildOperatorPhotos` test | Create |
| `src/app/campaigns/actions.ts` | `intent` on create + 4 new actions | Modify |
| `src/app/campaigns/_components/campaign-create-form.tsx` | two submit buttons | Modify |
| `src/app/campaigns/_components/campaign-edit-form.tsx` | edit form (client) | Create |
| `src/app/campaigns/[campaignId]/edit/page.tsx` | edit page | Create |
| `src/app/campaigns/_components/campaign-operator-panel.tsx` | add/remove/send-to-arc panel | Create |
| `src/app/campaigns/[campaignId]/page.tsx` | render the operator panel | Modify |

---

## Task 1: Domain — `parseCampaignEdit`

**Files:**
- Modify: `src/domain/campaign-drafts.ts`
- Test: `src/domain/__tests__/campaign-drafts.test.ts`

- [ ] **Step 1: Append the failing test** to `src/domain/__tests__/campaign-drafts.test.ts`:

```ts
import { parseCampaignEdit } from "../campaign-drafts";

describe("parseCampaignEdit", () => {
  it("requires a non-blank title and normalizes optionals", () => {
    const out = parseCampaignEdit({ name: "  Updated title  ", audienceSummary: " new aud ", objective: "", offerSummary: "10% off" });
    expect(out).toEqual({ name: "Updated title", audienceSummary: "new aud", offerSummary: "10% off" });
  });

  it("rejects a blank title", () => {
    expect(() => parseCampaignEdit({ name: "  " })).toThrow(/title/i);
  });
});
```

(`CampaignDraftValidationError` is already imported at the top of this file from `../campaign-drafts`. Add `parseCampaignEdit` to that existing import line instead of a new line.)

- [ ] **Step 2: Run** `pnpm test src/domain/__tests__/campaign-drafts.test.ts` — FAIL (parseCampaignEdit not exported).

- [ ] **Step 3: Implement** — append to `src/domain/campaign-drafts.ts` (reuses the existing `asObject` + `optionalTrimmed` helpers already in the file):

```ts
export type ParsedCampaignEdit = {
  name: string;
  audienceSummary?: string;
  objective?: string;
  offerSummary?: string;
};

/** Pure: validate + normalize an operator campaign edit (title required, rest optional). */
export function parseCampaignEdit(payload: unknown): ParsedCampaignEdit {
  const obj = asObject(payload);

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (name.length === 0) {
    throw new CampaignDraftValidationError("Give the campaign a title.");
  }

  return {
    name,
    audienceSummary: optionalTrimmed(obj.audienceSummary, "audienceSummary"),
    objective: optionalTrimmed(obj.objective, "objective"),
    offerSummary: optionalTrimmed(obj.offerSummary, "offerSummary"),
  };
}
```

- [ ] **Step 4: Run** `pnpm test src/domain/__tests__/campaign-drafts.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/campaign-drafts.ts src/domain/__tests__/campaign-drafts.test.ts
git commit -m "feat(campaigns): parseCampaignEdit pure validation"
```

---

## Task 2: Refactor `create.ts` — extract `insertPhotoAsset`, store `{url, path}`

**Files:**
- Modify: `src/lib/campaigns/create.ts`
- Modify: `src/lib/campaigns/create.test.ts`

- [ ] **Step 1: Update the test** — in `src/lib/campaigns/create.test.ts`, the first test asserts the media url; add a `path` assertion. Replace the existing media-asset assertion line:

```ts
    expect((asset.audit_payload as { media_assets: { url: string }[] }).media_assets[0].url).toBe("https://cdn.test/operator-campaigns/camp-1/0-a.png");
```

with:

```ts
    const media = (asset.audit_payload as { media_assets: { url: string; path: string }[] }).media_assets[0];
    expect(media.url).toBe("https://cdn.test/operator-campaigns/camp-1/0-a.png");
    expect(media.path).toBe("operator-campaigns/camp-1/0-a.png");
```

- [ ] **Step 2: Run** `pnpm test src/lib/campaigns/create.test.ts` — FAIL (no `path` yet).

- [ ] **Step 3: Refactor** `src/lib/campaigns/create.ts`. Add an exported `PhotoAssetInput` type and `insertPhotoAsset`, and replace the per-photo block inside `createOperatorCampaign`'s loop with a call to it. Also export `insertOne`/`insertNoReturn` so `manage.ts` reuses them.

Add after `defaultUploader`:

```ts
export type PhotoAssetInput = {
  client: SupabaseClient;
  campaignId: string;
  operator: string;
  photo: CampaignPhoto;
  index: number;
  channel: string;
  uploader: ImageUploader;
  now: string;
};

/** Upload one photo and insert its approved asset + approval + decision. Returns the asset id. */
export async function insertPhotoAsset({ client, campaignId, operator, photo, index, channel, uploader, now }: PhotoAssetInput): Promise<string> {
  // Caller is responsible for sanitizing photo.filename — it is interpolated into the path.
  const path = `operator-campaigns/${campaignId}/${index}-${photo.filename}`;
  const url = await uploader(path, photo.bytes, photo.contentType);

  const assetId = await insertOne(client, "campaign_assets", {
    campaign_id: campaignId,
    asset_type: "social_ad",
    channel,
    title: `Campaign photo ${index + 1}`,
    status: "approved",
    source_system: SOURCE_SYSTEM,
    approved_by: operator,
    approved_at: now,
    dispatch_locked: true,
    audit_payload: { media_assets: [{ url, path }], outbound_locked: true, authored_by: "operator" },
  });

  const approvalItemId = await insertOne(client, "approval_items", {
    campaign_id: campaignId,
    campaign_asset_id: assetId,
    item_type: "campaign_asset",
    status: "approved",
    approval_required: true,
    locked_until_approved: true,
    risk_level: "low",
    requested_by: operator,
    reviewed_by: operator,
    reviewed_at: now,
  });

  await insertNoReturn(client, "approval_decisions", {
    approval_item_id: approvalItemId,
    decision: "approved",
    decided_by: operator,
    previous_status: "pending_approval",
    next_status: "approved",
    metadata: { source: "operator_create" },
  });

  return assetId;
}
```

Then replace the loop body in `createOperatorCampaign` (the `for (const [index, photo] of photos.entries()) { ... }` block) with:

```ts
  const assetIds: string[] = [];
  for (const [index, photo] of photos.entries()) {
    assetIds.push(
      await insertPhotoAsset({ client, campaignId, operator, photo, index, channel: draft.channel ?? "social", uploader: upload, now }),
    );
  }
```

And change the two helper declarations from `async function insertOne`/`insertNoReturn` to `export async function insertOne`/`export async function insertNoReturn` (so `manage.ts` can import them).

> Note: the asset `title` changes from `${draft.name} — photo N` to `Campaign photo N` because `insertPhotoAsset` no longer has the draft name. If the create test asserted the old title, update it; it asserts only `campaign_id/asset_type/status/dispatch_locked`, so no change needed.

- [ ] **Step 4: Run** `pnpm test src/lib/campaigns/create.test.ts` — PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/create.ts src/lib/campaigns/create.test.ts
git commit -m "refactor(campaigns): extract insertPhotoAsset, store storage path alongside url"
```

---

## Task 3: `manage.ts` — guard, add photos, update fields

**Files:**
- Create: `src/lib/campaigns/manage.ts`
- Test: `src/lib/campaigns/manage.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/lib/campaigns/manage.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { addCampaignPhotos, updateOperatorCampaign } from "./manage";

function insertsFor(supabase: { calls: Array<[string, ...unknown[]]> }, table: string) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < supabase.calls.length; i++) {
    const [m, a] = supabase.calls[i];
    if (m === "from" && a === table && supabase.calls[i + 1]?.[0] === "insert") out.push(supabase.calls[i + 1][1] as Record<string, unknown>);
  }
  return out;
}
function updatesFor(supabase: { calls: Array<[string, ...unknown[]]> }, table: string) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < supabase.calls.length; i++) {
    const [m, a] = supabase.calls[i];
    if (m === "from" && a === table && supabase.calls[i + 1]?.[0] === "update") out.push(supabase.calls[i + 1][1] as Record<string, unknown>);
  }
  return out;
}

const operatorDraft = { id: "camp-1", source_system: "operator", launch_locked: true };

describe("addCampaignPhotos", () => {
  it("appends an approved asset per photo, indexed past existing assets", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: operatorDraft, error: null },
      campaign_assets: { data: [{ id: "existing-1" }], error: null }, // 1 existing → new index starts at 1
      approval_items: { data: { id: "appr-9" }, error: null },
      approval_decisions: { data: null, error: null },
      campaign_events: { data: null, error: null },
    });
    const uploader = vi.fn(async (path: string) => `https://cdn.test/${path}`);
    // campaign_assets mock returns the same object for both the "count existing" select and the insert .select("id"),
    // so insertOne reads data[0]?.id — for the insert path we still get an id. Assert on uploader + inserts instead.
    const out = await addCampaignPhotos({
      campaignId: "camp-1",
      operator: "evan@test",
      photos: [{ filename: "x.png", contentType: "image/png", bytes: new Uint8Array([1]) }],
      client: supabase,
      uploader,
    });
    expect(uploader).toHaveBeenCalledWith("operator-campaigns/camp-1/1-x.png", expect.anything(), "image/png");
    expect(insertsFor(supabase, "campaign_assets")[0]).toMatchObject({ campaign_id: "camp-1", status: "approved" });
    expect(insertsFor(supabase, "campaign_events")[0]).toMatchObject({ event_type: "asset_generated" });
    expect(out.assetIds.length).toBe(1);
  });

  it("rejects a non-operator campaign", async () => {
    const supabase = createSupabaseQueryMock({ campaigns: { data: { id: "c", source_system: "hermes_agent_orchestrator", launch_locked: true }, error: null } });
    await expect(addCampaignPhotos({ campaignId: "c", operator: "e", photos: [], client: supabase, uploader: vi.fn() })).rejects.toThrow(/operator/i);
  });
});

describe("updateOperatorCampaign", () => {
  it("updates the editable fields on an operator draft", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: operatorDraft, error: null },
      campaign_events: { data: null, error: null },
    });
    await updateOperatorCampaign({
      campaignId: "camp-1",
      operator: "evan@test",
      fields: { name: "New name", audienceSummary: "aud", objective: undefined, offerSummary: undefined },
      client: supabase,
    });
    expect(updatesFor(supabase, "campaigns")[0]).toMatchObject({ name: "New name", audience_summary: "aud", objective: null, offer_summary: null });
  });

  it("rejects a launched campaign", async () => {
    const supabase = createSupabaseQueryMock({ campaigns: { data: { id: "c", source_system: "operator", launch_locked: false }, error: null } });
    await expect(updateOperatorCampaign({ campaignId: "c", operator: "e", fields: { name: "x" }, client: supabase })).rejects.toThrow(/draft|live|launch/i);
  });
});
```

- [ ] **Step 2: Run** `pnpm test src/lib/campaigns/manage.test.ts` — FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/lib/campaigns/manage.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { type ParsedCampaignEdit } from "@/domain";

import { defaultUploader, insertNoReturn, insertPhotoAsset, type CampaignPhoto, type ImageUploader } from "./create";
import { getSupabaseAdminClient } from "../supabase/server";

const CAMPAIGN_MEDIA_BUCKET = "campaign-media";

type CampaignGuardRow = { id: string; source_system: string | null; launch_locked: boolean };

/** Load a campaign and assert it is operator-authored and still a draft (not launched). Throws otherwise. */
async function assertOperatorDraft(client: SupabaseClient, campaignId: string): Promise<void> {
  const { data, error } = await client
    .from("campaigns")
    .select("id,source_system,launch_locked")
    .eq("id", campaignId)
    .maybeSingle<CampaignGuardRow>();
  if (error) throw new Error(`campaigns lookup failed: ${error.message}`);
  if (!data) throw new Error("Campaign not found.");
  if (data.source_system !== "operator") throw new Error("Only operator-authored campaigns can be edited here.");
  if (!data.launch_locked) throw new Error("This campaign is already live — editing is locked.");
}

export type AddCampaignPhotosInput = {
  campaignId: string;
  operator: string;
  photos: CampaignPhoto[];
  client?: SupabaseClient;
  uploader?: ImageUploader;
};

export async function addCampaignPhotos({
  campaignId,
  operator,
  photos,
  client = getSupabaseAdminClient(),
  uploader,
}: AddCampaignPhotosInput): Promise<{ assetIds: string[] }> {
  await assertOperatorDraft(client, campaignId);
  if (photos.length === 0) return { assetIds: [] };

  const upload = uploader ?? defaultUploader(client);
  const now = new Date().toISOString();

  // Continue indices past existing assets so storage paths don't collide.
  const { data: existing, error } = await client.from("campaign_assets").select("id").eq("campaign_id", campaignId);
  if (error) throw new Error(`campaign_assets lookup failed: ${error.message}`);
  const start = (existing ?? []).length;

  const assetIds: string[] = [];
  for (const [i, photo] of photos.entries()) {
    assetIds.push(await insertPhotoAsset({ client, campaignId, operator, photo, index: start + i, channel: "social", uploader: upload, now }));
  }

  await insertNoReturn(client, "campaign_events", {
    campaign_id: campaignId,
    event_type: "asset_generated",
    actor: operator,
    detail: `${operator} added ${photos.length} photo${photos.length === 1 ? "" : "s"}.`,
    payload: { source: "operator_add_photos", photo_count: photos.length },
  });

  return { assetIds };
}

export type UpdateOperatorCampaignInput = {
  campaignId: string;
  operator: string;
  fields: ParsedCampaignEdit;
  client?: SupabaseClient;
};

export async function updateOperatorCampaign({
  campaignId,
  operator,
  fields,
  client = getSupabaseAdminClient(),
}: UpdateOperatorCampaignInput): Promise<{ campaignId: string }> {
  await assertOperatorDraft(client, campaignId);

  const { error } = await client
    .from("campaigns")
    .update({
      name: fields.name,
      audience_summary: fields.audienceSummary ?? null,
      objective: fields.objective ?? null,
      offer_summary: fields.offerSummary ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
  if (error) throw new Error(`campaigns update failed: ${error.message}`);

  await insertNoReturn(client, "campaign_events", {
    campaign_id: campaignId,
    event_type: "planned",
    actor: operator,
    detail: `${operator} edited the campaign.`,
    payload: { source: "operator_edit" },
  });

  return { campaignId };
}
```

- [ ] **Step 4: Run** `pnpm test src/lib/campaigns/manage.test.ts` — PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/manage.ts src/lib/campaigns/manage.test.ts
git commit -m "feat(campaigns): addCampaignPhotos + updateOperatorCampaign (operator-draft guarded)"
```

---

## Task 4: `manage.ts` — `removeCampaignAsset`

**Files:**
- Modify: `src/lib/campaigns/manage.ts`
- Modify: `src/lib/campaigns/manage.test.ts`

- [ ] **Step 1: Append the failing test** to `src/lib/campaigns/manage.test.ts`:

```ts
import { removeCampaignAsset } from "./manage";

describe("removeCampaignAsset", () => {
  it("deletes a not-yet-deployed operator asset and best-effort removes its storage object", async () => {
    const removeSpy = vi.fn(async () => ({ data: null, error: null }));
    const supabase = createSupabaseQueryMock({
      campaigns: { data: { id: "camp-1", source_system: "operator", launch_locked: true }, error: null },
      campaign_assets: { data: { id: "asset-1", campaign_id: "camp-1", dispatch_locked: true, audit_payload: { media_assets: [{ url: "u", path: "operator-campaigns/camp-1/0-x.png" }] } }, error: null },
      campaign_events: { data: null, error: null },
    });
    // attach a Storage stub
    (supabase as unknown as { storage: unknown }).storage = { from: () => ({ remove: removeSpy }) };

    await removeCampaignAsset({ campaignId: "camp-1", assetId: "asset-1", operator: "evan@test", client: supabase });

    expect(removeSpy).toHaveBeenCalledWith(["operator-campaigns/camp-1/0-x.png"]);
    // a delete was issued against campaign_assets
    expect(supabase.calls.some(([m]) => m === "delete")).toBe(true);
  });

  it("refuses to remove a deployed asset", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: { id: "camp-1", source_system: "operator", launch_locked: true }, error: null },
      campaign_assets: { data: { id: "asset-1", campaign_id: "camp-1", dispatch_locked: false, audit_payload: {} }, error: null },
    });
    (supabase as unknown as { storage: unknown }).storage = { from: () => ({ remove: vi.fn() }) };
    await expect(removeCampaignAsset({ campaignId: "camp-1", assetId: "asset-1", operator: "e", client: supabase })).rejects.toThrow(/deployed|live/i);
  });
});
```

- [ ] **Step 2: Run** `pnpm test src/lib/campaigns/manage.test.ts` — FAIL (removeCampaignAsset not exported).

- [ ] **Step 3: Implement** — append to `src/lib/campaigns/manage.ts`:

```ts
type AssetRow = {
  id: string;
  campaign_id: string;
  dispatch_locked: boolean;
  audit_payload: { media_assets?: Array<{ path?: string }> } | null;
};

export type RemoveCampaignAssetInput = {
  campaignId: string;
  assetId: string;
  operator: string;
  client?: SupabaseClient;
};

export async function removeCampaignAsset({
  campaignId,
  assetId,
  operator,
  client = getSupabaseAdminClient(),
}: RemoveCampaignAssetInput): Promise<void> {
  await assertOperatorDraft(client, campaignId);

  const { data: asset, error } = await client
    .from("campaign_assets")
    .select("id,campaign_id,dispatch_locked,audit_payload")
    .eq("id", assetId)
    .maybeSingle<AssetRow>();
  if (error) throw new Error(`campaign_assets lookup failed: ${error.message}`);
  if (!asset || asset.campaign_id !== campaignId) throw new Error("Photo not found on this campaign.");
  if (!asset.dispatch_locked) throw new Error("This photo is already deployed and can't be removed.");

  // Best-effort: delete the storage object. A failure here must not block the DB delete.
  const path = asset.audit_payload?.media_assets?.[0]?.path;
  if (path) {
    try {
      await client.storage.from(CAMPAIGN_MEDIA_BUCKET).remove([path]);
    } catch {
      // ignore — the asset row is the source of truth users see
    }
  }

  const { error: deleteError } = await client.from("campaign_assets").delete().eq("id", assetId);
  if (deleteError) throw new Error(`campaign_assets delete failed: ${deleteError.message}`);

  await insertNoReturn(client, "campaign_events", {
    campaign_id: campaignId,
    event_type: "archived",
    actor: operator,
    detail: `${operator} removed a photo.`,
    payload: { source: "operator_remove_photo", asset_id: assetId },
  });
}
```

> Note on the mock: `createSupabaseQueryMock` returns the same canned object for every `campaign_assets` call, and `.maybeSingle()` resolves to it — so the asset lookup returns the canned asset. `.delete().eq(...)` resolves to the same `{data,error}` (error null). The test asserts a `delete` call was recorded and the storage `remove` was invoked with the path.

- [ ] **Step 4: Run** `pnpm test src/lib/campaigns/manage.test.ts` — PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/manage.ts src/lib/campaigns/manage.test.ts
git commit -m "feat(campaigns): removeCampaignAsset (guarded delete + best-effort storage cleanup)"
```

---

## Task 5: Read-model — `sourceSystem` + `operatorPhotos`

**Files:**
- Modify: `src/lib/campaigns/read-model.ts`
- Test: `src/lib/campaigns/read-model.operator-photos.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/lib/campaigns/read-model.operator-photos.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildOperatorPhotos } from "./read-model";

describe("buildOperatorPhotos", () => {
  it("returns photos only for operator campaigns, from assets with a media url", () => {
    const campaign = { source_system: "operator" } as never;
    const assets = [
      { id: "a1", dispatch_locked: true, title: "Photo 1", audit_payload: { media_assets: [{ url: "https://x/1.png", path: "p/1.png" }] } },
      { id: "a2", dispatch_locked: false, title: "Photo 2", audit_payload: { media_assets: [{ url: "https://x/2.png" }] } },
      { id: "a3", dispatch_locked: true, title: "No media", audit_payload: {} },
    ] as never;
    expect(buildOperatorPhotos(campaign, assets)).toEqual([
      { assetId: "a1", url: "https://x/1.png", title: "Photo 1", dispatchLocked: true },
      { assetId: "a2", url: "https://x/2.png", title: "Photo 2", dispatchLocked: false },
    ]);
  });

  it("returns nothing for non-operator campaigns", () => {
    const campaign = { source_system: "hermes_agent_orchestrator" } as never;
    const assets = [{ id: "a1", dispatch_locked: true, title: "t", audit_payload: { media_assets: [{ url: "u" }] } }] as never;
    expect(buildOperatorPhotos(campaign, assets)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `pnpm test src/lib/campaigns/read-model.operator-photos.test.ts` — FAIL (buildOperatorPhotos not exported).

- [ ] **Step 3: Implement** — in `src/lib/campaigns/read-model.ts`:

(a) Add `source_system` to the campaign select. Find the `CAMPAIGN_SELECT` constant and add `source_system` to its column list (e.g. after `owner`).

(b) Add `source_system: string | null;` to the `CampaignRow` type.

(c) Add `sourceSystem: string | null;` to the `CampaignWorkspaceMeta` type (after `owner`).

(d) In `getCampaignWorkspaceDetail`'s returned `campaign: { ... }` object, add `sourceSystem: campaign.source_system,` (after `owner`).

(e) Add the exported type + builder (place near `CampaignMediaAsset`):

```ts
export type OperatorPhoto = { assetId: string; url: string; title: string; dispatchLocked: boolean };

type OperatorPhotoAssetRow = {
  id: string;
  dispatch_locked: boolean;
  title: string;
  audit_payload: { media_assets?: Array<{ url?: string }> } | null;
};

/** Photos an operator can manage: only for operator campaigns, one per asset that has a media url. */
export function buildOperatorPhotos(
  campaign: { source_system: string | null },
  assets: OperatorPhotoAssetRow[],
): OperatorPhoto[] {
  if (campaign.source_system !== "operator") return [];
  const photos: OperatorPhoto[] = [];
  for (const asset of assets) {
    const url = asset.audit_payload?.media_assets?.[0]?.url;
    if (!url) continue;
    photos.push({ assetId: asset.id, url, title: asset.title, dispatchLocked: asset.dispatch_locked });
  }
  return photos;
}
```

(f) Add `operatorPhotos: OperatorPhoto[];` to the `LiveCampaignWorkspace` type, and in the `getCampaignWorkspaceDetail` return object add `operatorPhotos: buildOperatorPhotos(campaign, assets),` (the `assets` variable is the fetched `CampaignAssetRow[]` — it has `id`, `dispatch_locked`, `title`, `audit_payload`).

- [ ] **Step 4: Run** `pnpm test src/lib/campaigns/read-model.operator-photos.test.ts` and `pnpm build` — test PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/read-model.ts src/lib/campaigns/read-model.operator-photos.test.ts
git commit -m "feat(campaigns): expose sourceSystem + operatorPhotos on the campaign detail read-model"
```

---

## Task 6: Actions — create `intent` + four new actions

**Files:**
- Modify: `src/app/campaigns/actions.ts`

- [ ] **Step 1: Add imports.** Extend the existing `@/domain` import to add `parseCampaignEdit`. Add:

```ts
import { addCampaignPhotos, removeCampaignAsset, updateOperatorCampaign } from "@/lib/campaigns/manage";
import { launchCampaign } from "@/lib/campaigns/launch";
import { sendArcDirective } from "@/lib/campaigns/arc-conversation";
```

(If `launchCampaign` / `sendArcDirective` are already imported in this file, don't duplicate — check the existing import block first.)

- [ ] **Step 2: Add the `intent` branch to `createCampaignAction`.** Immediately after `parseCampaignDraft(...)` succeeds and before persisting, read intent and validate the deploy precondition:

```ts
  const intent = String(formData.get("intent") ?? "draft") === "deploy" ? "deploy" : "draft";
```

After `photos = await readPhotos(formData);`, add:

```ts
  if (intent === "deploy" && photos.length === 0) {
    return { ok: false, message: "Add at least one photo to create and deploy." };
  }
```

Then, in the success block, after `campaignId = result.campaignId;` and before `revalidatePath`/`redirect`, add:

```ts
    if (intent === "deploy") {
      try {
        await launchCampaign({ campaignId, operator: getOperatorActor() });
      } catch (error) {
        // Campaign was created; surface the deploy failure but keep the draft.
        revalidatePath("/campaigns");
        redirect(`/campaigns/${campaignId}`);
      }
    }
```

> Because `redirect` throws `NEXT_REDIRECT`, keep it outside the inner try OR rethrow: simpler is to compute a flag and redirect once at the end. Use this exact structure for the success tail of the action:

```ts
  let campaignId: string;
  let deployError: string | null = null;
  try {
    const result = await createOperatorCampaign({ draft, operator: getOperatorActor(), photos, client: getSupabaseAdminClient() });
    campaignId = result.campaignId;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't create the campaign." };
  }

  if (intent === "deploy") {
    try {
      await launchCampaign({ campaignId, operator: getOperatorActor() });
    } catch (error) {
      deployError = error instanceof Error ? error.message : "Created, but couldn't deploy.";
    }
  }

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  void deployError; // draft is created either way; the detail page shows deploy state
  redirect(`/campaigns/${campaignId}`);
```

(Replace the existing create/redirect tail with the above.)

- [ ] **Step 3: Append the four new actions** at the end of `actions.ts`:

```ts
export type ManageCampaignActionState = { ok: boolean; message: string } | null;

export async function updateCampaignAction(_previous: ManageCampaignActionState, formData: FormData): Promise<ManageCampaignActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) return { ok: false, message: "Missing campaign." };

  let fields;
  try {
    fields = parseCampaignEdit({
      name: formData.get("name"),
      audienceSummary: formData.get("audienceSummary"),
      objective: formData.get("objective"),
      offerSummary: formData.get("offerSummary"),
    });
  } catch (error) {
    if (error instanceof CampaignDraftValidationError) return { ok: false, message: error.message };
    throw error;
  }

  try {
    await updateOperatorCampaign({ campaignId, operator: getOperatorActor(), fields, client: getSupabaseAdminClient() });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save the changes." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function addCampaignPhotosAction(_previous: ManageCampaignActionState, formData: FormData): Promise<ManageCampaignActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) return { ok: false, message: "Missing campaign." };

  let photos;
  try {
    photos = await readPhotos(formData);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't read the photos." };
  }
  if (photos.length === 0) return { ok: false, message: "Choose at least one photo to add." };

  try {
    await addCampaignPhotos({ campaignId, operator: getOperatorActor(), photos, client: getSupabaseAdminClient() });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't add the photos." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, message: `Added ${photos.length} photo${photos.length === 1 ? "" : "s"}.` };
}

export async function removeCampaignAssetAction(_previous: ManageCampaignActionState, formData: FormData): Promise<ManageCampaignActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const assetId = String(formData.get("assetId") ?? "").trim();
  if (!campaignId || !assetId) return { ok: false, message: "Missing photo." };

  try {
    await removeCampaignAsset({ campaignId, assetId, operator: getOperatorActor(), client: getSupabaseAdminClient() });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't remove the photo." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, message: "Photo removed." };
}

export async function sendCampaignToMarkAction(_previous: ManageCampaignActionState, formData: FormData): Promise<ManageCampaignActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) return { ok: false, message: "Missing campaign." };

  try {
    await sendArcDirective(
      { campaignId, message: "Operator handed off this campaign — please review the photos and draft or refine the creative.", operator: getOperatorActor() },
      getSupabaseAdminClient(),
    );
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't reach Arc." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, message: "Sent to Arc — he'll pick it up from here." };
}
```

- [ ] **Step 4: Verify** `pnpm build` (succeeds) and `pnpm lint` (no new errors). Fix import ordering if lint complains.

- [ ] **Step 5: Commit**

```bash
git add src/app/campaigns/actions.ts
git commit -m "feat(campaigns): create-intent deploy + update/add-photos/remove/send-to-arc actions"
```

---

## Task 7: UI — two submit buttons on the create form

**Files:**
- Modify: `src/app/campaigns/_components/campaign-create-form.tsx`

- [ ] **Step 1: Replace the single submit button.** Find the submit `<div className="flex gap-2"> ... </div>` block and replace it with two buttons that set a hidden `intent` field, plus the hidden field. The form already uses `useActionState`; both buttons submit the same form:

```tsx
      <input type="hidden" name="intent" value="draft" ref={intentRef} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} onClick={() => setIntent("draft")}>
          {pending ? "Working…" : "Create draft"}
        </Button>
        <Button type="submit" variant="ghost" disabled={pending} onClick={() => setIntent("deploy")}>
          Create & deploy
        </Button>
      </div>
      <p className="text-xs text-[var(--text-muted)]">Deploy needs at least one photo.</p>
```

Add the intent ref + setter near the top of the component body (after the `useActionState` line):

```tsx
  const intentRef = useRef<HTMLInputElement>(null);
  const setIntent = (value: "draft" | "deploy") => {
    if (intentRef.current) intentRef.current.value = value;
  };
```

And add `useRef` to the React import: `import { useActionState, useRef } from "react";`.

> `theme.button.variants` has only `primary` and `ghost`, so "Create & deploy" uses `ghost`. The `onClick` sets the hidden field's value before the native submit fires, so the action reads the right `intent`.

- [ ] **Step 2: Verify** `pnpm build` + `pnpm lint` clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/campaign-create-form.tsx
git commit -m "feat(campaigns): Create draft vs Create & deploy buttons"
```

---

## Task 8: UI — edit form + edit page

**Files:**
- Create: `src/app/campaigns/_components/campaign-edit-form.tsx`
- Create: `src/app/campaigns/[campaignId]/edit/page.tsx`

- [ ] **Step 1: Create the edit form** — `src/app/campaigns/_components/campaign-edit-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";

import { updateCampaignAction, type ManageCampaignActionState } from "../actions";
import { Button } from "../../_components/page-header";
import { cx, theme } from "../../_components/theme";

type Initial = { id: string; name: string; audienceSummary: string; objective: string; offerSummary: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function CampaignEditForm({ initial }: { initial: Initial }) {
  const [state, formAction, pending] = useActionState<ManageCampaignActionState, FormData>(updateCampaignAction, null);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="campaignId" value={initial.id} />
      <Field label="Title">
        <input name="name" required defaultValue={initial.name} className={cx(theme.control.input, "w-full")} />
      </Field>
      <Field label="Audience">
        <input name="audienceSummary" defaultValue={initial.audienceSummary} className={cx(theme.control.input, "w-full")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Objective">
          <input name="objective" defaultValue={initial.objective} className={cx(theme.control.input, "w-full")} />
        </Field>
        <Field label="Offer">
          <input name="offerSummary" defaultValue={initial.offerSummary} className={cx(theme.control.input, "w-full")} />
        </Field>
      </div>
      {state && !state.ok ? <p className="text-sm text-[var(--priority-bright)]">{state.message}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the edit page** — `src/app/campaigns/[campaignId]/edit/page.tsx`:

```tsx
import { connection } from "next/server";
import { notFound } from "next/navigation";

import { requireOperator } from "@/lib/auth/operator";
import { getCampaignWorkspaceDetail } from "@/lib/campaigns/read-model";

import { PageHeader } from "../../../_components/page-header";
import { CampaignEditForm } from "../../_components/campaign-edit-form";

type EditPageProps = { params: Promise<{ campaignId: string }> };

export default async function EditCampaignPage({ params }: EditPageProps) {
  await connection();
  await requireOperator();

  const { campaignId } = await params;
  const detail = await getCampaignWorkspaceDetail(campaignId);
  if (detail.status !== "live" || detail.campaign.sourceSystem !== "operator" || !detail.campaign.launchLocked) {
    notFound();
  }

  return (
    <>
      <PageHeader
        eyebrow="Campaign command"
        title="Edit campaign"
        backHref={`/campaigns/${campaignId}`}
        backLabel="campaign"
      />
      <CampaignEditForm
        initial={{
          id: detail.campaign.id,
          name: detail.campaign.name,
          audienceSummary: detail.campaign.audienceSummary === "Audience has not been summarized yet." ? "" : detail.campaign.audienceSummary,
          objective: detail.campaign.objective === "No objective captured yet." ? "" : detail.campaign.objective,
          offerSummary: detail.campaign.offerSummary === "Offer has not been summarized yet." ? "" : detail.campaign.offerSummary,
        }}
      />
    </>
  );
}
```

> The read-model substitutes placeholder strings for empty fields; the mapping above blanks them so the edit form starts empty rather than pre-filling the placeholder. Confirm the exact placeholder strings in `read-model.ts` (they're in the `getCampaignWorkspaceDetail` return) and match them.

- [ ] **Step 3: Verify** `pnpm build` (the `/campaigns/[campaignId]/edit` route appears) + `pnpm lint`.

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/_components/campaign-edit-form.tsx "src/app/campaigns/[campaignId]/edit/page.tsx"
git commit -m "feat(campaigns): edit page + form for operator draft campaigns"
```

---

## Task 9: UI — detail-page operator panel

**Files:**
- Create: `src/app/campaigns/_components/campaign-operator-panel.tsx`
- Modify: `src/app/campaigns/[campaignId]/page.tsx`

- [ ] **Step 1: Create the panel** — `src/app/campaigns/_components/campaign-operator-panel.tsx`:

```tsx
"use client";

import { useActionState } from "react";

import type { OperatorPhoto } from "@/lib/campaigns/read-model";

import { addCampaignPhotosAction, removeCampaignAssetAction, sendCampaignToMarkAction, type ManageCampaignActionState } from "../actions";
import { Button, Panel, buttonClasses } from "../../_components/page-header";
import { cx, theme } from "../../_components/theme";

export function CampaignOperatorPanel({
  campaignId,
  isDraft,
  photos,
}: {
  campaignId: string;
  isDraft: boolean;
  photos: OperatorPhoto[];
}) {
  const [addState, addAction, adding] = useActionState<ManageCampaignActionState, FormData>(addCampaignPhotosAction, null);
  const [removeState, removeAction, removing] = useActionState<ManageCampaignActionState, FormData>(removeCampaignAssetAction, null);
  const [markState, markAction, sending] = useActionState<ManageCampaignActionState, FormData>(sendCampaignToMarkAction, null);

  return (
    <Panel className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-[var(--text-primary)]">Operator controls</span>
        <div className="flex gap-2">
          {isDraft ? (
            <a href={`/campaigns/${campaignId}/edit`} className={buttonClasses({ size: "sm", variant: "ghost" })}>Edit details</a>
          ) : null}
          <form action={markAction}>
            <input type="hidden" name="campaignId" value={campaignId} />
            <Button type="submit" size="sm" variant="ghost" disabled={sending}>{sending ? "Sending…" : "Send to Arc"}</Button>
          </form>
        </div>
      </div>

      {isDraft ? (
        <form action={addAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="file" name="photos" accept="image/*" multiple className="text-sm text-[var(--text-secondary)]" />
          <Button type="submit" size="sm" disabled={adding}>{adding ? "Uploading…" : "Add photos"}</Button>
        </form>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-muted)]">This campaign is live — photos are locked.</p>
      )}

      {photos.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p) => (
            <div key={p.assetId} className={cx("rounded-lg border p-2", "border-[var(--border-panel)] bg-[var(--surface-inset)]")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.title} className="h-24 w-full rounded object-cover" />
              {isDraft && p.dispatchLocked ? (
                <form action={removeAction} className="mt-1">
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <input type="hidden" name="assetId" value={p.assetId} />
                  <Button type="submit" size="sm" variant="ghost" disabled={removing}>Remove</Button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {[addState, removeState, markState].map((s, i) =>
        s ? (
          <p key={i} className={cx("mt-2 text-xs", s.ok ? "text-[var(--text-secondary)]" : "text-[var(--priority-bright)]")}>{s.message}</p>
        ) : null,
      )}
    </Panel>
  );
}
```

> Verify `Panel`, `Button` (with `variant`/`size`/`disabled`), and `buttonClasses` are exported from `_components/page-header` (they are). `theme.button.variants` has `primary` and `ghost` — the panel uses `ghost`. `<img>` is used deliberately (operator preview); the eslint-disable keeps lint clean if the repo bans `<img>`.

- [ ] **Step 2: Wire into the detail page.** In `src/app/campaigns/[campaignId]/page.tsx`, import the panel and render it (only when the campaign is operator-authored) below the workspace. Add:

```tsx
import { CampaignOperatorPanel } from "../_components/campaign-operator-panel";
```

In the `detail.status === "live"` return, replace the fragment body so it includes the panel after `<CampaignWorkspace>` (and after the economics panel already there):

```tsx
  return (
    <>
      <CampaignWorkspace detail={detail} dispatches={dispatches} />
      <CampaignEconomicsPanel economics={economics} campaignId={campaignId} />
      {detail.campaign.sourceSystem === "operator" ? (
        <CampaignOperatorPanel
          campaignId={campaignId}
          isDraft={detail.campaign.launchLocked}
          photos={detail.operatorPhotos}
        />
      ) : null}
    </>
  );
```

> Confirm the current live return shape from the attribution work (it renders `CampaignWorkspace` + `CampaignEconomicsPanel` in a fragment). Match it; just add the operator panel.

- [ ] **Step 3: Verify** `pnpm build` + `pnpm lint`.

- [ ] **Step 4: Visual check (recommended).** With the dev server: open an operator draft campaign → confirm the panel shows, add a photo, remove it, click Send to Arc, and use Edit details. (Requires Supabase + the `campaign-media` bucket.)

- [ ] **Step 5: Commit**

```bash
git add src/app/campaigns/_components/campaign-operator-panel.tsx "src/app/campaigns/[campaignId]/page.tsx"
git commit -m "feat(campaigns): operator panel — add/remove photos, edit link, send to Arc"
```

---

## Final verification

- [ ] `pnpm test` — full suite green.
- [ ] `pnpm build` + `pnpm lint` — clean.
- [ ] No shipped migration edited (this feature adds none).

---

## Self-Review against the spec

- **Create & deploy in one step** → Task 6 (`intent` + `launchCampaign`) + Task 7 (buttons). ✓
- **Add/remove photos later** → Task 3 (`addCampaignPhotos`), Task 4 (`removeCampaignAsset`), Task 6 (actions), Task 9 (UI). ✓
- **Edit campaign fields** → Task 1 (`parseCampaignEdit`), Task 3 (`updateOperatorCampaign`), Task 6 (action), Task 8 (edit page/form). ✓
- **Send to Arc** → Task 6 (`sendCampaignToMarkAction`) + Task 9 (button). ✓
- **Guard: operator-authored draft** → `assertOperatorDraft` (Task 3) used by all manage ops; UI gated by `sourceSystem`/`launchLocked` (Tasks 8, 9). ✓
- **Remove = delete + best-effort storage + not-deployed guard** → Task 4. ✓
- **`{url, path}` media entries + read-model `operatorPhotos`/`sourceSystem`** → Tasks 2 and 5. ✓
- **Editable fields = name/audience/objective/offer** → Tasks 1, 3, 8. ✓
- **Tests** → Tasks 1–5 each ship tests; UI via build/lint + manual. ✓

Type/name consistency: `parseCampaignEdit`/`ParsedCampaignEdit` (T1) → used in T3/T6; `insertPhotoAsset`/`insertOne`/`insertNoReturn` exported (T2) → used in T3; `addCampaignPhotos`/`updateOperatorCampaign`/`removeCampaignAsset` (T3/T4) → used in T6; `buildOperatorPhotos`/`OperatorPhoto`/`sourceSystem`/`operatorPhotos` (T5) → used in T8/T9; `ManageCampaignActionState` + the four actions (T6) → used in T7/T8/T9. Consistent.
