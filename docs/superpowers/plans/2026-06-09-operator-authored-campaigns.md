# Operator-Authored Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator manually create a campaign (title, photos, who-it's-for, audience, objective/offer), persisted as a draft that reuses the existing campaigns machinery, deployable via the existing Launch → Outbox flow, and visible to Arc.

**Architecture:** `domain/` (pure draft validation) → `lib/campaigns/create.ts` (persistence: campaign + per-photo asset + an already-`approved` approval_item so the existing Launch can deploy it) → `app/campaigns/` (a `/campaigns/new` form + a `createCampaignAction`). Photos upload to the existing `campaign-media` Storage bucket via an injectable uploader. No new dispatch/approval subsystem.

**Tech Stack:** TypeScript, Next.js 16, React 19, Supabase (incl. Storage), Zod-free pure validation, Vitest. pnpm. Path alias `@/*` → `./src/*`.

**Spec:** `docs/superpowers/specs/2026-06-09-operator-authored-campaigns-design.md`

---

## Key integration facts (verified against the codebase)

- `campaigns` requires NOT-NULL `name`, `persona` (`persona_mapping` enum), `restoration_focus` enum. Has `status` (default `draft`), `source_system`, `launch_locked` (default true), `owner`, `objective`, `audience_summary`, `offer_summary`, `company_id`/`lead_id` FKs.
- `campaign_assets`: `asset_type` (`campaign_asset_type` enum incl. `social_ad`), `channel`, `title` (NOT-NULL non-empty), `status` (`approval_status` incl. `approved`), `dispatch_locked` (default true), `audit_payload` jsonb.
- **`launchCampaign` (existing) gates on `approval_items`**: it throws if a campaign/its assets have zero approval_items, and only unlocks assets whose approval_item `status` matches `/approved/`. So each photo asset MUST get an `approved` `approval_items` row for the campaign to be deployable. `campaign_assets.status='approved'` alone is not enough.
- `approval_items`: `campaign_id`, `campaign_asset_id`, `item_type` (NOT-NULL non-empty), `status` (default `pending_approval`), `risk_level` (default `medium`, one of low/medium/high/blocked), `requested_by`, `reviewed_by`, `reviewed_at`.
- `approval_decisions`: `approval_item_id`, `decision`, `decided_by`, `decision_notes`, `previous_status`, `next_status`, `metadata`.
- `campaign_events`: `campaign_id` (NOT-NULL), `campaign_asset_id?`, `event_type` (`campaign_event_type` enum — `created` is a valid value), `actor`, `detail`, `payload`.
- Operator identity: `getOperatorActor()` from `@/lib/auth/operator` (returns email or "Operator"). Gate with `requireOperator()` + `isSupabaseAdminConfigured()`.
- Storage upload pattern: `client.storage.from("campaign-media").upload(path, bytes, {contentType, upsert:true})` then `.getPublicUrl(path).data.publicUrl` (see `src/lib/arc/social-ad-orchestrator.ts`). The bucket is NOT created by any migration yet.
- UI primitives: `Button` from `_components/page-header`; `theme.control.input` + `cx` from `_components/theme`. Persona list: `OFFICIAL_PERSONA_MAPPINGS` from `@/domain`.
- Arc handoff: the campaign detail page already has a Arc conversation tab (`sendMarkMessageAction`), and operator campaigns appear in Arc's read-models automatically. **No new "Send to Arc" button is built this round** (YAGNI — use the existing Arc conversation); pointing Arc to it is the existing affordance.

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/domain/campaign-drafts.ts` | Pure validation/normalization of the operator create payload | Create |
| `src/domain/__tests__/campaign-drafts.test.ts` | Unit tests | Create |
| `src/domain/index.ts` | Re-export campaign-drafts | Modify |
| `src/lib/campaigns/create.ts` | Persistence: campaign + per-photo asset + approved approval_item + decision + event | Create |
| `src/lib/campaigns/create.test.ts` | Persistence tests (mock client + fake uploader) | Create |
| `supabase/migrations/20260609120000_campaign_media_bucket.sql` | Ensure `campaign-media` Storage bucket exists | Create |
| `src/app/campaigns/actions.ts` | `createCampaignAction` (multipart → parse → upload → persist) | Modify |
| `src/app/campaigns/_components/campaign-create-form.tsx` | Client create form | Create |
| `src/app/campaigns/new/page.tsx` | Operator-gated create page | Create |
| `src/app/campaigns/page.tsx` | "New campaign" button | Modify |

---

## Task 1: Domain — `parseCampaignDraft`

**Files:**
- Create: `src/domain/campaign-drafts.ts`
- Test: `src/domain/__tests__/campaign-drafts.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/campaign-drafts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CampaignDraftValidationError, parseCampaignDraft } from "../campaign-drafts";

const base = {
  name: "  Spring flood push  ",
  persona: "persona_homeowner_emergency",
  restorationFocus: "flood",
};

describe("parseCampaignDraft", () => {
  it("normalizes a valid draft (trims strings, drops empties)", () => {
    const out = parseCampaignDraft({ ...base, audienceSummary: "  North side  ", objective: "", channel: "social" });
    expect(out).toMatchObject({
      name: "Spring flood push",
      persona: "persona_homeowner_emergency",
      restorationFocus: "flood",
      audienceSummary: "North side",
      channel: "social",
    });
    expect(out.objective).toBeUndefined();
  });

  it("rejects a missing/blank title", () => {
    expect(() => parseCampaignDraft({ ...base, name: "   " })).toThrow(CampaignDraftValidationError);
  });

  it("rejects a persona that isn't an official persona", () => {
    expect(() => parseCampaignDraft({ ...base, persona: "unassigned_persona" })).toThrow(/persona/i);
    expect(() => parseCampaignDraft({ ...base, persona: "nope" })).toThrow(/persona/i);
  });

  it("rejects an invalid restoration focus", () => {
    expect(() => parseCampaignDraft({ ...base, restorationFocus: "earthquake" })).toThrow(/restoration/i);
  });

  it("validates optional lead/company UUIDs when present", () => {
    expect(() => parseCampaignDraft({ ...base, leadId: "not-a-uuid" })).toThrow(/uuid/i);
    const out = parseCampaignDraft({ ...base, leadId: "11111111-1111-1111-1111-111111111111" });
    expect(out.leadId).toBe("11111111-1111-1111-1111-111111111111");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/campaign-drafts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/campaign-drafts.ts`:

```ts
import { OFFICIAL_PERSONA_MAPPINGS } from "./personas";

export class CampaignDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignDraftValidationError";
  }
}

export const RESTORATION_FOCUS_VALUES = [
  "flood",
  "water_backup",
  "burst_pipe",
  "storm_surge",
  "standing_water",
  "mold",
  "sewage",
  "fire",
] as const;

export type RestorationFocus = (typeof RESTORATION_FOCUS_VALUES)[number];

export type ParsedCampaignDraft = {
  name: string;
  persona: string;
  restorationFocus: RestorationFocus;
  channel?: string;
  audienceSummary?: string;
  objective?: string;
  offerSummary?: string;
  leadId?: string;
  companyId?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CampaignDraftValidationError("Campaign draft must be an object.");
  }
  return value as Record<string, unknown>;
}

function optionalTrimmed(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new CampaignDraftValidationError(`"${field}" must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalUuid(value: unknown, field: string): string | undefined {
  const trimmed = optionalTrimmed(value, field);
  if (trimmed === undefined) return undefined;
  if (!UUID_RE.test(trimmed)) {
    throw new CampaignDraftValidationError(`"${field}" must be a valid UUID when provided.`);
  }
  return trimmed;
}

/** Pure: validate + normalize an operator-authored campaign draft. Throws on bad input. */
export function parseCampaignDraft(payload: unknown): ParsedCampaignDraft {
  const obj = asObject(payload);

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (name.length === 0) {
    throw new CampaignDraftValidationError("Give the campaign a title.");
  }

  const persona = typeof obj.persona === "string" ? obj.persona.trim() : "";
  if (!(OFFICIAL_PERSONA_MAPPINGS as readonly string[]).includes(persona)) {
    throw new CampaignDraftValidationError("Choose who the campaign is for (a valid persona).");
  }

  const restorationFocus = typeof obj.restorationFocus === "string" ? obj.restorationFocus.trim() : "";
  if (!(RESTORATION_FOCUS_VALUES as readonly string[]).includes(restorationFocus)) {
    throw new CampaignDraftValidationError("Choose a valid restoration focus.");
  }

  return {
    name,
    persona,
    restorationFocus: restorationFocus as RestorationFocus,
    channel: optionalTrimmed(obj.channel, "channel"),
    audienceSummary: optionalTrimmed(obj.audienceSummary, "audienceSummary"),
    objective: optionalTrimmed(obj.objective, "objective"),
    offerSummary: optionalTrimmed(obj.offerSummary, "offerSummary"),
    leadId: optionalUuid(obj.leadId, "leadId"),
    companyId: optionalUuid(obj.companyId, "companyId"),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/campaign-drafts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Re-export from the domain barrel**

In `src/domain/index.ts`, add after the last existing export line:

```ts
export * from "./campaign-drafts";
```

- [ ] **Step 6: Commit**

```bash
git add src/domain/campaign-drafts.ts src/domain/__tests__/campaign-drafts.test.ts src/domain/index.ts
git commit -m "feat(campaigns): parseCampaignDraft pure validation for operator drafts"
```

---

## Task 2: Persistence — `createOperatorCampaign`

**Files:**
- Create: `src/lib/campaigns/create.ts`
- Test: `src/lib/campaigns/create.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/campaigns/create.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { parseCampaignDraft } from "@/domain";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { createOperatorCampaign } from "./create";

function insertsFor(supabase: { calls: Array<[string, ...unknown[]]> }, table: string) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < supabase.calls.length; i++) {
    const [method, arg] = supabase.calls[i];
    if (method === "from" && arg === table && supabase.calls[i + 1]?.[0] === "insert") {
      out.push(supabase.calls[i + 1][1] as Record<string, unknown>);
    }
  }
  return out;
}

const draft = parseCampaignDraft({
  name: "Spring flood push",
  persona: "persona_homeowner_emergency",
  restorationFocus: "flood",
  channel: "social",
  audienceSummary: "North side homeowners",
});

describe("createOperatorCampaign", () => {
  it("creates a draft campaign, an approved asset+approval per photo, a decision, and a created event", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: { id: "camp-1" }, error: null },
      campaign_assets: { data: { id: "asset-1" }, error: null },
      approval_items: { data: { id: "appr-1" }, error: null },
      approval_decisions: { data: null, error: null },
      campaign_events: { data: null, error: null },
    });
    const uploader = vi.fn(async (path: string) => `https://cdn.test/${path}`);

    const out = await createOperatorCampaign({
      draft,
      operator: "evan@test",
      photos: [{ filename: "a.png", contentType: "image/png", bytes: new Uint8Array([1, 2, 3]) }],
      client: supabase,
      uploader,
    });

    expect(out.campaignId).toBe("camp-1");
    expect(uploader).toHaveBeenCalledTimes(1);

    expect(insertsFor(supabase, "campaigns")[0]).toMatchObject({
      name: "Spring flood push",
      persona: "persona_homeowner_emergency",
      restoration_focus: "flood",
      status: "draft",
      source_system: "operator",
      launch_locked: true,
      owner: "evan@test",
      audience_summary: "North side homeowners",
    });
    const asset = insertsFor(supabase, "campaign_assets")[0];
    expect(asset).toMatchObject({ campaign_id: "camp-1", asset_type: "social_ad", status: "approved", dispatch_locked: true });
    expect((asset.audit_payload as { media_assets: { url: string }[] }).media_assets[0].url).toBe("https://cdn.test/operator-campaigns/camp-1/0-a.png");
    expect(insertsFor(supabase, "approval_items")[0]).toMatchObject({ campaign_id: "camp-1", campaign_asset_id: "asset-1", status: "approved", item_type: "campaign_asset" });
    expect(insertsFor(supabase, "approval_decisions")[0]).toMatchObject({ approval_item_id: "appr-1", decision: "approved" });
    expect(insertsFor(supabase, "campaign_events")[0]).toMatchObject({ campaign_id: "camp-1", event_type: "created", actor: "evan@test" });
  });

  it("creates a campaign with no assets when there are no photos", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: { id: "camp-2" }, error: null },
      campaign_events: { data: null, error: null },
    });
    const uploader = vi.fn();
    const out = await createOperatorCampaign({ draft, operator: "evan@test", photos: [], client: supabase, uploader });
    expect(out.campaignId).toBe("camp-2");
    expect(uploader).not.toHaveBeenCalled();
    expect(insertsFor(supabase, "campaign_assets")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/campaigns/create.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/campaigns/create.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { type ParsedCampaignDraft } from "@/domain";

import { getSupabaseAdminClient } from "../supabase/server";

const SOURCE_SYSTEM = "operator";
const CAMPAIGN_MEDIA_BUCKET = "campaign-media";

export type CampaignPhoto = { filename: string; contentType: string; bytes: Uint8Array };

// Injectable so persistence is unit-testable without real Supabase Storage.
export type ImageUploader = (path: string, bytes: Uint8Array, contentType: string) => Promise<string>;

export function defaultUploader(client: SupabaseClient): ImageUploader {
  return async (path, bytes, contentType) => {
    const { error } = await client.storage.from(CAMPAIGN_MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) throw new Error(`image upload failed: ${error.message}`);
    return client.storage.from(CAMPAIGN_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  };
}

export type CreateOperatorCampaignInput = {
  draft: ParsedCampaignDraft;
  operator: string;
  photos: CampaignPhoto[];
  client?: SupabaseClient;
  uploader?: ImageUploader;
};

export type CreateOperatorCampaignResult = { campaignId: string; assetIds: string[] };

export async function createOperatorCampaign({
  draft,
  operator,
  photos,
  client = getSupabaseAdminClient(),
  uploader,
}: CreateOperatorCampaignInput): Promise<CreateOperatorCampaignResult> {
  const upload = uploader ?? defaultUploader(client);
  const now = new Date().toISOString();

  const campaignId = await insertOne(client, "campaigns", {
    name: draft.name,
    persona: draft.persona,
    restoration_focus: draft.restorationFocus,
    status: "draft",
    source_system: SOURCE_SYSTEM,
    launch_locked: true,
    owner: operator,
    objective: draft.objective ?? null,
    audience_summary: draft.audienceSummary ?? null,
    offer_summary: draft.offerSummary ?? null,
    company_id: draft.companyId ?? null,
    lead_id: draft.leadId ?? null,
    source_signal: { authored_by: "operator" },
  });

  const assetIds: string[] = [];
  for (const [index, photo] of photos.entries()) {
    const path = `operator-campaigns/${campaignId}/${index}-${photo.filename}`;
    const url = await upload(path, photo.bytes, photo.contentType);

    const assetId = await insertOne(client, "campaign_assets", {
      campaign_id: campaignId,
      asset_type: "social_ad",
      channel: draft.channel ?? "social",
      title: `${draft.name} — photo ${index + 1}`,
      status: "approved",
      source_system: SOURCE_SYSTEM,
      approved_by: operator,
      approved_at: now,
      dispatch_locked: true,
      audit_payload: { media_assets: [{ url }], outbound_locked: true, authored_by: "operator" },
    });
    assetIds.push(assetId);

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
  }

  await insertNoReturn(client, "campaign_events", {
    campaign_id: campaignId,
    event_type: "created",
    actor: operator,
    detail: `Campaign authored by ${operator} with ${photos.length} photo${photos.length === 1 ? "" : "s"}.`,
    payload: { source: "operator_create", photo_count: photos.length },
  });

  return { campaignId, assetIds };
}

async function insertOne(client: SupabaseClient, table: string, values: Record<string, unknown>): Promise<string> {
  const { data, error } = await client.from(table).insert(values).select("id").single<{ id: string }>();
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
  if (!data?.id) throw new Error(`${table} insert did not return an id.`);
  return data.id;
}

async function insertNoReturn(client: SupabaseClient, table: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await client.from(table).insert(values);
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/campaigns/create.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/create.ts src/lib/campaigns/create.test.ts
git commit -m "feat(campaigns): createOperatorCampaign persistence (campaign + approved photo assets)"
```

---

## Task 3: Migration — ensure the `campaign-media` Storage bucket exists

**Files:**
- Create: `supabase/migrations/20260609120000_campaign_media_bucket.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260609120000_campaign_media_bucket.sql`:

```sql
-- Ensure the public Storage bucket operator-authored campaign photos (and Arc's
-- social-ad images) upload to exists. Idempotent — safe if the bucket was already
-- created manually in the Supabase project.
insert into storage.buckets (id, name, public)
values ('campaign-media', 'campaign-media', true)
on conflict (id) do nothing;
```

- [ ] **Step 2: Verify it's well-formed**

Run: `git status --short supabase/migrations/`
Expected: only the new file listed. Confirm the timestamp `20260609120000` sorts after the latest existing migration (`20260608170000_lead_attribution.sql`). Do NOT apply it (no automated test for migrations). The `storage.buckets` table is provided by Supabase Storage; `public = true` matches the `getPublicUrl` usage in the persistence layer.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260609120000_campaign_media_bucket.sql
git commit -m "feat(campaigns): ensure campaign-media storage bucket exists"
```

---

## Task 4: Action — `createCampaignAction`

**Files:**
- Modify: `src/app/campaigns/actions.ts`

- [ ] **Step 1: Add the action**

In `src/app/campaigns/actions.ts`:

Add these imports alongside the existing ones at the top:

```ts
import { redirect } from "next/navigation";
import { CampaignDraftValidationError, parseCampaignDraft } from "@/domain";
import { createOperatorCampaign, type CampaignPhoto } from "@/lib/campaigns/create";
```

(`requireOperator`, `getOperatorActor`, `isSupabaseAdminConfigured`, `getSupabaseAdminClient`, and `revalidatePath` are already imported in this file.)

Add this action and helper at the end of the file:

```ts
export type CreateCampaignActionState = { ok: boolean; message: string } | null;

/**
 * Operator authors a campaign by hand: validate the draft, upload any photos to the
 * campaign-media bucket, persist a draft campaign with approved photo assets, then
 * redirect to the new campaign. Gated by the operator check + Supabase config.
 * Shaped for `useActionState`.
 */
export async function createCampaignAction(
  _previous: CreateCampaignActionState,
  formData: FormData,
): Promise<CreateCampaignActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the campaign can't be saved." };
  }

  let draft;
  try {
    draft = parseCampaignDraft({
      name: formData.get("name"),
      persona: formData.get("persona"),
      restorationFocus: formData.get("restorationFocus"),
      channel: formData.get("channel"),
      audienceSummary: formData.get("audienceSummary"),
      objective: formData.get("objective"),
      offerSummary: formData.get("offerSummary"),
    });
  } catch (error) {
    if (error instanceof CampaignDraftValidationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  let photos: CampaignPhoto[];
  try {
    photos = await readPhotos(formData);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't read the uploaded photos." };
  }

  let campaignId: string;
  try {
    const result = await createOperatorCampaign({
      draft,
      operator: getOperatorActor(),
      photos,
      client: getSupabaseAdminClient(),
    });
    campaignId = result.campaignId;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't create the campaign." };
  }

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}`);
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB per file

async function readPhotos(formData: FormData): Promise<CampaignPhoto[]> {
  const files = formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const photos: CampaignPhoto[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      throw new Error(`"${file.name}" isn't an image.`);
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error(`"${file.name}" is larger than 10 MB.`);
    }
    photos.push({
      filename: file.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }
  return photos;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm build`
Expected: build succeeds (the action compiles; `redirect` throws `NEXT_REDIRECT` which is expected control flow). If the build fails for reasons in this file, fix them; if unrelated/env, capture and report.

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/actions.ts
git commit -m "feat(campaigns): createCampaignAction — validate, upload photos, persist, redirect"
```

---

## Task 5: UI — create form, page, and entry point

**Files:**
- Create: `src/app/campaigns/_components/campaign-create-form.tsx`
- Create: `src/app/campaigns/new/page.tsx`
- Modify: `src/app/campaigns/page.tsx`

This task is UI; verification is `pnpm build` + `pnpm lint`.

- [ ] **Step 1: Create the form (client component)**

Create `src/app/campaigns/_components/campaign-create-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";

import { OFFICIAL_PERSONA_MAPPINGS, RESTORATION_FOCUS_VALUES } from "@/domain";

import { createCampaignAction, type CreateCampaignActionState } from "../actions";
import { Button } from "../../_components/page-header";
import { cx, theme } from "../../_components/theme";

function titleize(value: string) {
  return value.replace(/^persona_/, "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function CampaignCreateForm() {
  const [state, formAction, pending] = useActionState<CreateCampaignActionState, FormData>(createCampaignAction, null);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <Field label="Title">
        <input name="name" required placeholder="Spring flood response push" className={cx(theme.control.input, "w-full")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who it's for (persona)">
          <select name="persona" required defaultValue="" className={cx(theme.control.input, "w-full")}>
            <option value="" disabled>Select a persona…</option>
            {OFFICIAL_PERSONA_MAPPINGS.map((p) => (
              <option key={p} value={p}>{titleize(p)}</option>
            ))}
          </select>
        </Field>
        <Field label="Restoration focus">
          <select name="restorationFocus" required defaultValue="" className={cx(theme.control.input, "w-full")}>
            <option value="" disabled>Select a focus…</option>
            {RESTORATION_FOCUS_VALUES.map((f) => (
              <option key={f} value={f}>{titleize(f)}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Audience">
        <input name="audienceSummary" placeholder="North-side homeowners with recent storm exposure" className={cx(theme.control.input, "w-full")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Objective">
          <input name="objective" placeholder="Book emergency mitigation calls" className={cx(theme.control.input, "w-full")} />
        </Field>
        <Field label="Channel">
          <input name="channel" placeholder="social" className={cx(theme.control.input, "w-full")} />
        </Field>
      </div>
      <Field label="Offer">
        <input name="offerSummary" placeholder="Free 24-hour water-damage assessment" className={cx(theme.control.input, "w-full")} />
      </Field>

      <Field label="Photos">
        <input type="file" name="photos" accept="image/*" multiple className="text-sm text-[var(--text-secondary)]" />
      </Field>

      {state && !state.ok ? (
        <p className="text-sm text-[var(--priority-bright)]">{state.message}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create campaign"}</Button>
      </div>
    </form>
  );
}
```

> Verify against the codebase before writing: that `theme.control.input` and the `--text-muted` / `--priority-bright` CSS vars exist (they're used by `tracked-link-builder.tsx`), and that `Button` accepts `type`/`disabled`. Adjust class names to real tokens if any differ. No emojis (DESIGN.md).

- [ ] **Step 2: Create the page (server component)**

Create `src/app/campaigns/new/page.tsx`:

```tsx
import { requireOperator } from "@/lib/auth/operator";

import { PageHeader } from "../../_components/page-header";
import { CampaignCreateForm } from "../_components/campaign-create-form";

export default async function NewCampaignPage() {
  await requireOperator();

  return (
    <>
      <PageHeader
        eyebrow="Campaign command"
        title="New campaign"
        description="Author a campaign by hand: a title, who it's for, the audience and offer, and any reference photos. Save it as a draft, deploy it yourself, or point Arc at it later."
        backHref="/campaigns"
        backLabel="campaigns"
      />
      <CampaignCreateForm />
    </>
  );
}
```

> Verify `PageHeader` accepts `backHref`/`backLabel` (the campaign detail page uses them). If `requireOperator()` redirects when unauthenticated, that's the intended gate.

- [ ] **Step 3: Add the "New campaign" entry point**

In `src/app/campaigns/page.tsx`, modify the `CampaignsHeader` `aside` to include a link to the new page. Add the `Link` import at the top:

```tsx
import Link from "next/link";
```

Add `Button` to the existing import from `../_components/page-header`:

```tsx
import { Button, EmptyState, PageHeader, StatusPill } from "../_components/page-header";
```

Replace the `aside`'s `<div>...</div>` contents so the New campaign button sits alongside the pills:

```tsx
      aside={
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {pendingCount > 0 ? (
            <StatusPill tone="amber">{pendingCount} awaiting approval</StatusPill>
          ) : (
            <StatusPill tone="green">All decided</StatusPill>
          )}
          <StatusPill tone="amber">Outbound locked</StatusPill>
          <Link href="/campaigns/new">
            <Button size="sm">New campaign</Button>
          </Link>
        </div>
      }
```

> Confirm `Button` is exported from `_components/page-header` (it is) and accepts `size="sm"`.

- [ ] **Step 4: Verify build + lint**

Run: `pnpm build`
Expected: succeeds; `/campaigns/new` appears in the route list.
Run: `pnpm lint`
Expected: no new errors in the touched files.

- [ ] **Step 5: Visual check (optional but recommended)**

Use the `run` skill or `pnpm dev` to open `/campaigns`, click "New campaign", fill the form, and confirm validation messaging works. (Without Supabase configured locally, submit returns the "Supabase isn't configured" message — expected.)

- [ ] **Step 6: Commit**

```bash
git add src/app/campaigns/_components/campaign-create-form.tsx src/app/campaigns/new/page.tsx src/app/campaigns/page.tsx
git commit -m "feat(campaigns): operator create-campaign form, page, and entry point"
```

---

## Final verification

- [ ] `pnpm test` — full suite green (new: campaign-drafts + create tests).
- [ ] `pnpm build` and `pnpm lint` — clean.
- [ ] Confirm only the new migration was added; no shipped migration edited.

---

## Self-Review against the spec

- **Reuse campaigns/assets tables, `source_system='operator'`** → Task 2 (campaign insert). ✓
- **Upload photos from device → `campaign-media`** → Task 2 (`defaultUploader`) + Task 4 (`readPhotos`) + Task 3 (bucket). ✓
- **Photos as `social_ad` assets, URL in `audit_payload.media_assets[]`** → Task 2. ✓
- **Deploy via existing Launch** → Task 2 creates an `approved` `approval_items` row + sets asset `approved` + `dispatch_locked` true, satisfying `launchCampaign`'s gate. ✓
- **Operator assets auto-approved + decision recorded (audit trail)** → Task 2 (approval_items + approval_decisions + campaign_events 'created'). ✓
- **Arc handoff opt-in / Arc sees them** → no new code; existing Arc conversation tab + shared tables (documented in Key facts). ✓
- **Create form (title, persona, restoration_focus, audience, objective, offer, channel, photos)** → Task 5. ✓
- **Entry point on /campaigns** → Task 5 Step 3. ✓
- **Domain validation + persistence tests** → Tasks 1 and 2. ✓
- **Graceful degrade without Supabase** → Task 4 (`isSupabaseAdminConfigured` guard). ✓

Type/name consistency: `parseCampaignDraft`/`ParsedCampaignDraft`/`RESTORATION_FOCUS_VALUES` (Task 1) are consumed in Tasks 2/4/5; `createOperatorCampaign`/`CampaignPhoto` (Task 2) consumed in Task 4; `createCampaignAction`/`CreateCampaignActionState` (Task 4) consumed in Task 5. Consistent.
