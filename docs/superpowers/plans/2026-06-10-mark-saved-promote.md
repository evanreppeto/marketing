# Mark — Save & Promote + Chat Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator ⭐-save Mark's chat outputs (media, draft cards, message text as angles), revisit them in a Saved view, attach a project/campaign to a chat via a settings gear, and promote a saved item into the existing `/campaigns` approval flow (attached to an existing campaign or a newly created one).

**Architecture:** Pure additive feature. New `mark_saved_items` table + a `campaign_id` link on `mark_conversations`. A new `src/lib/mark-chat/saved.ts` persistence module and two new `src/lib/campaigns/create.ts` helpers reuse the existing approval pipeline (`campaign_assets` + `approval_items` + `campaign_events`). New server actions in `src/app/mark/actions.ts`. UI: ⭐ on media/draft/message, a `/mark/saved` page, a Promote dialog, and a chat-settings popover. No change to the approval state machine.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Supabase (admin client), Tailwind CSS-variable tokens, vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-10-mark-saved-promote-design.md`
**DESIGN.md guardrails (§8):** no emoji, no glow/gradient decoration, no purple/neon, no nested cards, reduced-motion safe. Mark surface may use the richer visuals already established.

---

## File Structure

- `supabase/migrations/20260610170000_mark_saved_items.sql` — **create**: `mark_saved_items` table + `mark_conversations.campaign_id` column.
- `src/lib/mark-chat/persistence.ts` — **modify**: add `campaignId` to `MarkConversation`/`ConversationRow`/`CONVERSATION_COLUMNS`/`toConversation`; add `assignConversationToCampaign`.
- `src/lib/mark-chat/saved.ts` — **create**: `SavedItem` type + CRUD (`saveItem`, `listSavedItems`, `removeSavedItem`, `findSavedBySource`, `markPromoted`).
- `src/lib/mark-chat/saved.test.ts` — **create**: unit tests for `saved.ts`.
- `src/lib/campaigns/create.ts` — **modify**: add `createCampaignShell` + `promoteAssetToCampaign`.
- `src/lib/campaigns/create.promote.test.ts` — **create**: insert-shape tests for the two helpers.
- `src/app/mark/actions.ts` — **modify**: `saveMarkItemAction`, `unsaveMarkItemAction`, `promoteSavedItemAction`, `attachCampaignForm`.
- `src/app/mark/_components/save-star.tsx` — **create**: reusable ⭐ toggle button.
- `src/app/mark/_components/message-media.tsx` — **modify**: ⭐ on each media item.
- `src/app/mark/_components/action-card.tsx` — **modify**: ⭐ on draft cards.
- `src/app/mark/_components/message-list.tsx` — **modify**: "Save as angle" in the Mark message action bar; thread `MarkSavedContext` provider for saved keys.
- `src/app/mark/page.tsx` — **modify**: load saved-source keys + pass to `MarkChat`.
- `src/app/mark/_components/mark-chat.tsx` — **modify**: thread saved keys down; add settings gear + chip; pass `activeCampaignId`.
- `src/app/mark/_components/chat-settings.tsx` — **create**: settings popover (project + campaign attach).
- `src/app/mark/saved/page.tsx` — **create**: Saved view (server component).
- `src/app/mark/saved/_components/saved-list.tsx` — **create**: client list + per-item actions.
- `src/app/mark/saved/_components/promote-dialog.tsx` — **create**: Existing/New campaign promote dialog.
- `src/app/mark/_components/thread-sidebar.tsx` — **modify**: add a "Saved" link by "Archived".

---

## Task 1: Migration — saved items table + conversation campaign link

**Files:**
- Create: `supabase/migrations/20260610170000_mark_saved_items.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Mark "Saved" pinboard: operator-starred chat outputs (media, draft cards, angles),
-- plus a campaign link on conversations so an attached-campaign chat promotes there.

create table if not exists public.mark_saved_items (
  id uuid primary key default gen_random_uuid(),
  operator text not null,
  kind text not null check (kind in ('media','draft','angle')),
  title text,
  body text,
  media_url text,
  caption text,
  source_conversation_id uuid references public.mark_conversations(id) on delete set null,
  source_message_id uuid,
  source_campaign_id uuid,
  source_asset_id uuid,
  note text,
  promoted_campaign_id uuid,
  promoted_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mark_saved_items_operator_idx on public.mark_saved_items (operator, created_at desc);
create index if not exists mark_saved_items_kind_idx on public.mark_saved_items (kind);

alter table public.mark_conversations
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
```

(Grants: the shipped `20260529133000_data_api_role_grants.sql` sets `alter default privileges ... grant ... to service_role`, so this new table is auto-granted to the service role. No explicit grant needed.)

- [ ] **Step 2: Sanity-check SQL parses (no DB apply required in CI)**

Run: `node -e "const s=require('fs').readFileSync('supabase/migrations/20260610170000_mark_saved_items.sql','utf8'); if(!/create table/.test(s)||!/add column/.test(s)) throw new Error('migration missing statements'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610170000_mark_saved_items.sql
git commit -m "feat(mark): migration for mark_saved_items + conversation campaign_id"
```

---

## Task 2: Conversation read-model gains `campaignId` + assign helper

**Files:**
- Modify: `src/lib/mark-chat/persistence.ts`
- Test: `src/lib/mark-chat/persistence.test.ts`

- [ ] **Step 1: Write a failing test**

Append to `src/lib/mark-chat/persistence.test.ts` (inside the file, after existing tests; reuse its existing Supabase mock helper — check the top of the file for how it builds a fake client and a conversation row, and mirror that). Add:

```ts
import { assignConversationToCampaign } from "./persistence";

describe("assignConversationToCampaign", () => {
  it("updates campaign_id on the conversation row", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      from() {
        return {
          update(values: Record<string, unknown>) {
            calls.push(values);
            return { eq: () => ({ error: null }) };
          },
        };
      },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
    await assignConversationToCampaign("conv-1", "camp-9", client);
    expect(calls[0]).toEqual({ campaign_id: "camp-9" });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm test src/lib/mark-chat/persistence.test.ts`
Expected: FAIL — `assignConversationToCampaign is not exported` / undefined.

- [ ] **Step 3: Add `campaignId` to the read-model + the assign function**

In `src/lib/mark-chat/persistence.ts`:

(a) `MarkConversation` type — add after `projectId`:
```ts
  campaignId: string | null;
```
(b) `ConversationRow` type — add after `project_id`:
```ts
  campaign_id: string | null;
```
(c) `CONVERSATION_COLUMNS` — change to include `campaign_id`:
```ts
const CONVERSATION_COLUMNS =
  "id, operator, title, status, project_id, campaign_id, pinned_at, created_at, updated_at, last_message_at";
```
(d) `toConversation` — add after `projectId: row.project_id ?? null,`:
```ts
    campaignId: row.campaign_id ?? null,
```
(e) Add the function next to `assignConversationToProject`:
```ts
export async function assignConversationToCampaign(
  conversationId: string,
  campaignId: string | null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("mark_conversations").update({ campaign_id: campaignId }).eq("id", conversationId);
  assertOk("mark_conversations assign campaign", error);
}
```

- [ ] **Step 4: Run — expect PASS, and the existing suite stays green**

Run: `pnpm test src/lib/mark-chat/persistence.test.ts`
Expected: PASS (new test + all existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mark-chat/persistence.ts src/lib/mark-chat/persistence.test.ts
git commit -m "feat(mark): conversation campaignId read-model + assignConversationToCampaign"
```

---

## Task 3: `saved.ts` persistence + tests

**Files:**
- Create: `src/lib/mark-chat/saved.ts`
- Test: `src/lib/mark-chat/saved.test.ts`

- [ ] **Step 1: Write `saved.ts`**

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "../supabase/server";

export type SavedKind = "media" | "draft" | "angle";

export type SavedItem = {
  id: string;
  operator: string;
  kind: SavedKind;
  title: string | null;
  body: string | null;
  mediaUrl: string | null;
  caption: string | null;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  sourceCampaignId: string | null;
  sourceAssetId: string | null;
  note: string | null;
  promotedCampaignId: string | null;
  promotedAssetId: string | null;
  createdAt: string;
};

type SavedRow = {
  id: string;
  operator: string;
  kind: SavedKind;
  title: string | null;
  body: string | null;
  media_url: string | null;
  caption: string | null;
  source_conversation_id: string | null;
  source_message_id: string | null;
  source_campaign_id: string | null;
  source_asset_id: string | null;
  note: string | null;
  promoted_campaign_id: string | null;
  promoted_asset_id: string | null;
  created_at: string;
};

const COLUMNS =
  "id, operator, kind, title, body, media_url, caption, source_conversation_id, source_message_id, source_campaign_id, source_asset_id, note, promoted_campaign_id, promoted_asset_id, created_at";

function toSaved(row: SavedRow): SavedItem {
  return {
    id: row.id,
    operator: row.operator,
    kind: row.kind,
    title: row.title ?? null,
    body: row.body ?? null,
    mediaUrl: row.media_url ?? null,
    caption: row.caption ?? null,
    sourceConversationId: row.source_conversation_id ?? null,
    sourceMessageId: row.source_message_id ?? null,
    sourceCampaignId: row.source_campaign_id ?? null,
    sourceAssetId: row.source_asset_id ?? null,
    note: row.note ?? null,
    promotedCampaignId: row.promoted_campaign_id ?? null,
    promotedAssetId: row.promoted_asset_id ?? null,
    createdAt: row.created_at,
  };
}

export type SaveItemInput = {
  operator: string;
  kind: SavedKind;
  title?: string | null;
  body?: string | null;
  mediaUrl?: string | null;
  caption?: string | null;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  sourceCampaignId?: string | null;
  sourceAssetId?: string | null;
  note?: string | null;
};

export async function saveItem(
  input: SaveItemInput,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<SavedItem> {
  const { data, error } = await client
    .from("mark_saved_items")
    .insert({
      operator: input.operator,
      kind: input.kind,
      title: input.title ?? null,
      body: input.body ?? null,
      media_url: input.mediaUrl ?? null,
      caption: input.caption ?? null,
      source_conversation_id: input.sourceConversationId ?? null,
      source_message_id: input.sourceMessageId ?? null,
      source_campaign_id: input.sourceCampaignId ?? null,
      source_asset_id: input.sourceAssetId ?? null,
      note: input.note ?? null,
    })
    .select(COLUMNS)
    .single<SavedRow>();
  if (error) throw new Error(`mark_saved_items insert: ${error.message}`);
  if (!data) throw new Error("mark_saved_items insert returned no row");
  return toSaved(data);
}

export async function listSavedItems(
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<SavedItem[]> {
  const { data, error } = await client
    .from("mark_saved_items")
    .select(COLUMNS)
    .eq("operator", operator)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`mark_saved_items list: ${error.message}`);
  return (data ?? []).map((r) => toSaved(r as SavedRow));
}

export async function removeSavedItem(
  id: string,
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("mark_saved_items").delete().eq("id", id).eq("operator", operator);
  if (error) throw new Error(`mark_saved_items delete: ${error.message}`);
}

export async function getSavedItem(
  id: string,
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<SavedItem | null> {
  const { data, error } = await client
    .from("mark_saved_items")
    .select(COLUMNS)
    .eq("id", id)
    .eq("operator", operator)
    .maybeSingle<SavedRow>();
  if (error) throw new Error(`mark_saved_items get: ${error.message}`);
  return data ? toSaved(data) : null;
}

export async function markPromoted(
  id: string,
  promoted: { campaignId: string; assetId: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("mark_saved_items")
    .update({ promoted_campaign_id: promoted.campaignId, promoted_asset_id: promoted.assetId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`mark_saved_items markPromoted: ${error.message}`);
}
```

- [ ] **Step 2: Write `saved.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { saveItem, listSavedItems, removeSavedItem, markPromoted } from "./saved";

function fakeClient(captured: { table?: string; payload?: unknown; row?: unknown }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    insert(payload: unknown) { captured.payload = payload; return builder; },
    update(payload: unknown) { captured.payload = payload; return builder; },
    delete() { return builder; },
    select() { return builder; },
    eq() { return builder; },
    order() { return Promise.resolve({ data: [captured.row], error: null }); },
    single() { return Promise.resolve({ data: captured.row, error: null }); },
    maybeSingle() { return Promise.resolve({ data: captured.row, error: null }); },
    then(res: (v: { data: unknown; error: null }) => unknown) { return Promise.resolve({ data: null, error: null }).then(res); },
  });
  void chain;
  return {
    from(table: string) { captured.table = table; return builder; },
  } as unknown as SupabaseClient;
}

describe("saved.ts", () => {
  it("saveItem maps camelCase input to snake_case columns", async () => {
    const cap: { payload?: Record<string, unknown>; row?: unknown } = {
      row: { id: "s1", operator: "op", kind: "media", title: "t", body: null, media_url: "u", caption: "c", source_conversation_id: "c1", source_message_id: "m1", source_campaign_id: null, source_asset_id: null, note: null, promoted_campaign_id: null, promoted_asset_id: null, created_at: "2026-01-01" },
    };
    const item = await saveItem({ operator: "op", kind: "media", title: "t", mediaUrl: "u", caption: "c", sourceConversationId: "c1", sourceMessageId: "m1" }, fakeClient(cap));
    expect((cap.payload as Record<string, unknown>).media_url).toBe("u");
    expect((cap.payload as Record<string, unknown>).source_conversation_id).toBe("c1");
    expect(item.mediaUrl).toBe("u");
    expect(item.kind).toBe("media");
  });

  it("listSavedItems returns mapped items", async () => {
    const cap = { row: { id: "s1", operator: "op", kind: "angle", title: "T", body: "B", media_url: null, caption: null, source_conversation_id: null, source_message_id: null, source_campaign_id: null, source_asset_id: null, note: null, promoted_campaign_id: null, promoted_asset_id: null, created_at: "2026-01-01" } };
    const items = await listSavedItems("op", fakeClient(cap));
    expect(items[0].kind).toBe("angle");
    expect(items[0].body).toBe("B");
  });

  it("markPromoted writes promoted ids", async () => {
    const cap: { payload?: Record<string, unknown> } = {};
    await markPromoted("s1", { campaignId: "camp", assetId: "asset" }, fakeClient(cap));
    expect((cap.payload as Record<string, unknown>).promoted_campaign_id).toBe("camp");
    expect((cap.payload as Record<string, unknown>).promoted_asset_id).toBe("asset");
  });

  it("removeSavedItem does not throw", async () => {
    await expect(removeSavedItem("s1", "op", fakeClient({}))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run — expect PASS**

Run: `pnpm test src/lib/mark-chat/saved.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/mark-chat/saved.ts src/lib/mark-chat/saved.test.ts
git commit -m "feat(mark): saved-items persistence (saved.ts) + tests"
```

---

## Task 4: Campaign promote helpers

**Files:**
- Modify: `src/lib/campaigns/create.ts`
- Test: `src/lib/campaigns/create.promote.test.ts`

> Read the existing `insertPhotoAsset` and `createOperatorCampaign` in `src/lib/campaigns/create.ts` first to match the exact insert column names and the `assertOk`/error helper this file uses. The columns below come from the campaigns schema (`campaigns`, `campaign_assets`, `approval_items`, `campaign_events`).

- [ ] **Step 1: Write `createCampaignShell` + `promoteAssetToCampaign`**

Append to `src/lib/campaigns/create.ts` (use the same `SupabaseClient` import and `getSupabaseAdminClient` default already present in the file):

```ts
export type CreateCampaignShellInput = {
  operator: string;
  name: string;
  persona: string;
  restorationFocus: string;
  client?: SupabaseClient;
};

/** Minimal campaign row (draft, launch-locked) for promoting a saved item into a
 *  brand-new campaign. Mirrors the campaign insert in createOperatorCampaign. */
export async function createCampaignShell(input: CreateCampaignShellInput): Promise<{ campaignId: string }> {
  const client = input.client ?? getSupabaseAdminClient();
  const { data, error } = await client
    .from("campaigns")
    .insert({
      name: input.name,
      persona: input.persona,
      restoration_focus: input.restorationFocus,
      status: "draft",
      launch_locked: true,
      owner: input.operator,
      source_system: "mark_saved",
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(`campaigns insert: ${error.message}`);
  if (!data) throw new Error("campaigns insert returned no row");
  await client.from("campaign_events").insert({
    campaign_id: data.id,
    event_type: "created",
    actor: input.operator,
    detail: "created from Mark saved item",
  });
  return { campaignId: data.id };
}

export type PromoteAssetInput = {
  operator: string;
  campaignId: string;
  assetType: string;   // e.g. "social_ad" | "image_prompt"
  title: string;
  body: string | null;
  mediaUrl: string | null;
  client?: SupabaseClient;
};

/** Insert a pending-approval campaign asset + its approval gate + an event, so the
 *  asset shows up in /campaigns awaiting the operator's decision. Mirrors
 *  insertPhotoAsset but stays pending_approval instead of pre-approved. */
export async function promoteAssetToCampaign(input: PromoteAssetInput): Promise<{ assetId: string }> {
  const client = input.client ?? getSupabaseAdminClient();
  const { data: asset, error: assetErr } = await client
    .from("campaign_assets")
    .insert({
      campaign_id: input.campaignId,
      asset_type: input.assetType,
      title: input.title,
      status: "pending_approval",
      draft_body: input.body,
      dispatch_locked: true,
      tool_source: "mark_saved",
      audit_payload: input.mediaUrl ? { media_assets: [{ url: input.mediaUrl }], outbound_locked: true } : { outbound_locked: true },
    })
    .select("id")
    .single<{ id: string }>();
  if (assetErr) throw new Error(`campaign_assets insert: ${assetErr.message}`);
  if (!asset) throw new Error("campaign_assets insert returned no row");

  const { error: itemErr } = await client.from("approval_items").insert({
    campaign_id: input.campaignId,
    campaign_asset_id: asset.id,
    item_type: "campaign_asset",
    status: "pending_approval",
    locked_until_approved: true,
    requested_by: input.operator,
    risk_level: "medium",
  });
  if (itemErr) throw new Error(`approval_items insert: ${itemErr.message}`);

  await client.from("campaign_events").insert({
    campaign_id: input.campaignId,
    campaign_asset_id: asset.id,
    event_type: "asset_generated",
    actor: input.operator,
    detail: "promoted from Mark saved",
  });

  return { assetId: asset.id };
}
```

- [ ] **Step 2: Write insert-shape tests**

Create `src/lib/campaigns/create.promote.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createCampaignShell, promoteAssetToCampaign } from "./create";

function client(inserts: Record<string, unknown[]>, ids: Record<string, string>) {
  return {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          (inserts[table] ??= []).push(payload);
          return {
            select: () => ({ single: () => Promise.resolve({ data: { id: ids[table] ?? "x" }, error: null }) }),
            then: (res: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(res),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("promote helpers", () => {
  it("createCampaignShell inserts a draft, launch-locked campaign + created event", async () => {
    const inserts: Record<string, unknown[]> = {};
    const { campaignId } = await createCampaignShell({
      operator: "op", name: "Storm push", persona: "persona_landlord", restorationFocus: "flood",
      client: client(inserts, { campaigns: "camp-1" }),
    });
    expect(campaignId).toBe("camp-1");
    const camp = inserts.campaigns[0] as Record<string, unknown>;
    expect(camp.status).toBe("draft");
    expect(camp.launch_locked).toBe(true);
    expect(camp.persona).toBe("persona_landlord");
    expect((inserts.campaign_events[0] as Record<string, unknown>).event_type).toBe("created");
  });

  it("promoteAssetToCampaign inserts pending asset + approval gate + event", async () => {
    const inserts: Record<string, unknown[]> = {};
    const { assetId } = await promoteAssetToCampaign({
      operator: "op", campaignId: "camp-1", assetType: "social_ad", title: "Ad", body: "copy", mediaUrl: null,
      client: client(inserts, { campaign_assets: "asset-1" }),
    });
    expect(assetId).toBe("asset-1");
    expect((inserts.campaign_assets[0] as Record<string, unknown>).status).toBe("pending_approval");
    expect((inserts.campaign_assets[0] as Record<string, unknown>).dispatch_locked).toBe(true);
    expect((inserts.approval_items[0] as Record<string, unknown>).campaign_asset_id).toBe("asset-1");
    expect((inserts.campaign_events[0] as Record<string, unknown>).event_type).toBe("asset_generated");
  });
});
```

- [ ] **Step 3: Run — expect PASS**

Run: `pnpm test src/lib/campaigns/create.promote.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/campaigns/create.ts src/lib/campaigns/create.promote.test.ts
git commit -m "feat(campaigns): createCampaignShell + promoteAssetToCampaign helpers"
```

---

## Task 5: Server actions (save / unsave / promote / attach campaign)

**Files:**
- Modify: `src/app/mark/actions.ts`
- Test: `src/app/mark/actions.promote.test.ts`

> The file is already `"use server"` with `requireOperator()`, `getOperatorActor()`, `isSupabaseAdminConfigured()`, `getSupabaseAdminClient()`, and `revalidatePath` in scope. Add imports from `@/lib/mark-chat/saved`, `@/lib/campaigns/create`, `@/domain` (`OFFICIAL_PERSONA_MAPPINGS`, `RESTORATION_FOCUS_VALUES`), and `assignConversationToCampaign` from `@/lib/mark-chat/persistence`.

- [ ] **Step 1: Add a pure validator + the actions**

Add to `src/app/mark/actions.ts`:

```ts
import { saveItem, removeSavedItem, getSavedItem, markPromoted, type SavedKind } from "@/lib/mark-chat/saved";
import { createCampaignShell, promoteAssetToCampaign } from "@/lib/campaigns/create";
import { assignConversationToCampaign } from "@/lib/mark-chat/persistence";
import { OFFICIAL_PERSONA_MAPPINGS, RESTORATION_FOCUS_VALUES } from "@/domain";

export type PromoteTarget =
  | { mode: "existing"; campaignId: string }
  | { mode: "new"; name: string; persona: string; restorationFocus: string };

/** Pure: validate a "new campaign" promote target. Exported for unit testing. */
export function validatePromoteTarget(target: PromoteTarget): { ok: true } | { ok: false; message: string } {
  if (target.mode === "existing") {
    return target.campaignId ? { ok: true } : { ok: false, message: "Pick a campaign." };
  }
  if (!target.name.trim()) return { ok: false, message: "Name the campaign." };
  if (!(OFFICIAL_PERSONA_MAPPINGS as readonly string[]).includes(target.persona)) return { ok: false, message: "Choose a persona." };
  if (!(RESTORATION_FOCUS_VALUES as readonly string[]).includes(target.restorationFocus)) return { ok: false, message: "Choose a restoration focus." };
  return { ok: true };
}

export type SaveItemActionInput = {
  kind: SavedKind;
  title?: string;
  body?: string;
  mediaUrl?: string;
  caption?: string;
  sourceConversationId?: string;
  sourceMessageId?: string;
  sourceCampaignId?: string;
  sourceAssetId?: string;
};

export async function saveMarkItemAction(input: SaveItemActionInput): Promise<{ ok: boolean; id?: string; message?: string }> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Connect Supabase to save items." };
  const saved = await saveItem({ operator: getOperatorActor(), ...input });
  revalidatePath("/mark/saved");
  return { ok: true, id: saved.id };
}

export async function unsaveMarkItemAction(id: string): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  await removeSavedItem(id, getOperatorActor());
  revalidatePath("/mark/saved");
}

export async function attachCampaignForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim() || null;
  if (!conversationId) return;
  await assignConversationToCampaign(conversationId, campaignId);
  revalidatePath("/mark");
}

export async function promoteSavedItemAction(
  savedItemId: string,
  target: PromoteTarget,
): Promise<{ ok: boolean; campaignId?: string; assetId?: string; message?: string }> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Connect Supabase to promote." };
  const valid = validatePromoteTarget(target);
  if (!valid.ok) return { ok: false, message: valid.message };

  const operator = getOperatorActor();
  const item = await getSavedItem(savedItemId, operator);
  if (!item) return { ok: false, message: "Saved item not found." };

  const campaignId =
    target.mode === "existing"
      ? target.campaignId
      : (await createCampaignShell({ operator, name: target.name, persona: target.persona, restorationFocus: target.restorationFocus })).campaignId;

  const assetType = item.kind === "media" ? "image_prompt" : "social_ad";
  const { assetId } = await promoteAssetToCampaign({
    operator,
    campaignId,
    assetType,
    title: item.title ?? "Promoted from Mark",
    body: item.body,
    mediaUrl: item.mediaUrl,
  });

  await markPromoted(savedItemId, { campaignId, assetId });
  revalidatePath("/campaigns");
  revalidatePath("/mark/saved");
  return { ok: true, campaignId, assetId };
}
```

- [ ] **Step 2: Write the validator test**

Create `src/app/mark/actions.promote.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validatePromoteTarget } from "./actions";

describe("validatePromoteTarget", () => {
  it("accepts an existing campaign", () => {
    expect(validatePromoteTarget({ mode: "existing", campaignId: "c1" }).ok).toBe(true);
  });
  it("rejects existing with no id", () => {
    expect(validatePromoteTarget({ mode: "existing", campaignId: "" }).ok).toBe(false);
  });
  it("accepts a valid new campaign", () => {
    expect(validatePromoteTarget({ mode: "new", name: "X", persona: "persona_landlord", restorationFocus: "flood" }).ok).toBe(true);
  });
  it("rejects new with invalid persona/focus", () => {
    expect(validatePromoteTarget({ mode: "new", name: "X", persona: "nope", restorationFocus: "flood" }).ok).toBe(false);
    expect(validatePromoteTarget({ mode: "new", name: "X", persona: "persona_landlord", restorationFocus: "nope" }).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run + lint**

Run: `pnpm test src/app/mark/actions.promote.test.ts`
Expected: PASS (4 tests).
Run: `npx eslint src/app/mark/actions.ts`
Expected: clean (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/app/mark/actions.ts src/app/mark/actions.promote.test.ts
git commit -m "feat(mark): save/unsave/promote/attach-campaign server actions"
```

---

## Task 6: Reusable ⭐ Save button

**Files:**
- Create: `src/app/mark/_components/save-star.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";

import { cx } from "@/app/_components/theme";
import { saveMarkItemAction, unsaveMarkItemAction, type SaveItemActionInput } from "../actions";

/** A small ⭐ toggle. `savedId` (if provided) means already-saved; clicking removes it.
 *  Otherwise clicking saves and flips to saved. Optimistic; silent on failure. */
export function SaveStar({ input, savedId, label = "Save" }: { input: SaveItemActionInput; savedId?: string | null; label?: string }) {
  const [id, setId] = useState<string | null>(savedId ?? null);
  const [busy, setBusy] = useState(false);
  const saved = id !== null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (saved && id) {
        const prev = id;
        setId(null);
        await unsaveMarkItemAction(prev);
      } else {
        const res = await saveMarkItemAction(input);
        if (res.ok && res.id) setId(res.id);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? "Saved — click to remove" : label}
      title={saved ? "Saved" : label}
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold transition hover:bg-[var(--surface-inset)]",
        saved ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
      )}
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5L10 14l-4.5 2.4.9-5L2.8 7.8l5-.7z" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint src/app/mark/_components/save-star.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/mark/_components/save-star.tsx
git commit -m "feat(mark): reusable SaveStar toggle"
```

---

## Task 7: Wire ⭐ into media, draft cards, and message angle

**Files:**
- Modify: `src/app/mark/_components/message-media.tsx`
- Modify: `src/app/mark/_components/action-card.tsx`
- Modify: `src/app/mark/_components/message-list.tsx`

> `MarkMedia`, `MarkActionCard`, and `MarkMessage` are the data shapes (see `@/domain` / persistence). Each ⭐ needs `sourceConversationId` (the message's `conversationId`) and `sourceMessageId` (the message's `id`). Thread these in by passing the message down. Keep changes minimal — add a `SaveStar` next to existing controls.

- [ ] **Step 1: media item ⭐** — in `message-media.tsx`, the component already maps `media` items and receives the message via props. Add the message identity to its props and render a `SaveStar` overlaid on each media item:

```tsx
import { SaveStar } from "./save-star";
// In the props type add:  conversationId: string; messageId: string;
// For each media item container (the <a>/<figure> wrapper), add a corner control:
<div className="absolute right-1.5 top-1.5 rounded-md bg-[var(--overlay)] backdrop-blur-sm">
  <SaveStar input={{ kind: "media", mediaUrl: item.url, caption: item.caption ?? undefined, conversationId, messageId } as never} label="Save media" />
</div>
```
Then update `message-list.tsx` where `<MessageMedia media={message.media} />` is rendered to pass `conversationId={message.conversationId} messageId={message.id}`.

(Use the real `SaveItemActionInput` fields — `sourceConversationId`/`sourceMessageId` — not `conversationId`/`messageId`; pass `{ kind: "media", mediaUrl: item.url, caption: item.caption ?? undefined, sourceConversationId: conversationId, sourceMessageId: messageId }`.)

- [ ] **Step 2: draft card ⭐** — in `action-card.tsx`, for `card.kind === "draft"`, add a `SaveStar` near the card title:

```tsx
import { SaveStar } from "./save-star";
// where the card renders its title row, add (needs conversationId + messageId via props):
<SaveStar
  input={{
    kind: "draft",
    title: card.title,
    body: card.preview ?? card.rows.map((r) => r.name).join("\n"),
    sourceCampaignId: card.approval?.campaignId,
    sourceAssetId: card.approval?.assetId,
    sourceConversationId,
    sourceMessageId,
  }}
  label="Save draft"
/>
```
Add `sourceConversationId: string; sourceMessageId: string;` to `ActionCard` props and pass them from `message-list.tsx` (the `Message` component maps `message.actions` — pass `message.conversationId` and `message.id`).

- [ ] **Step 3: "Save as angle"** — in `message-list.tsx`, in the Mark message action bar (the persistent copy/regenerate/feedback row), add:

```tsx
<SaveStar
  input={{ kind: "angle", title: message.body.split("\n")[0].slice(0, 80), body: message.body, sourceConversationId: message.conversationId, sourceMessageId: message.id }}
  label="Save as angle"
/>
```

- [ ] **Step 4: Build + lint**

Run: `npx eslint src/app/mark/_components/message-media.tsx src/app/mark/_components/action-card.tsx src/app/mark/_components/message-list.tsx`
Expected: clean.
Run: `pnpm build` — Expected: compiles (type-check may still be red from the unrelated concurrent `console-frame.tsx`; confirm none of YOUR files appear in `npx tsc --noEmit` output).

- [ ] **Step 5: Commit**

```bash
git add src/app/mark/_components/message-media.tsx src/app/mark/_components/action-card.tsx src/app/mark/_components/message-list.tsx
git commit -m "feat(mark): SaveStar on media, draft cards, and message angles"
```

---

## Task 8: Saved view + sidebar link

**Files:**
- Create: `src/app/mark/saved/page.tsx`
- Create: `src/app/mark/saved/_components/saved-list.tsx`
- Modify: `src/app/mark/_components/thread-sidebar.tsx`

- [ ] **Step 1: Saved page (server component)**

`src/app/mark/saved/page.tsx`:

```tsx
import { connection } from "next/server";
import Link from "next/link";

import { PageHeader, EmptyState } from "../../_components/page-header";
import { getOperatorActor } from "@/lib/auth/operator";
import { listSavedItems } from "@/lib/mark-chat/saved";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { SavedList } from "./_components/saved-list";

export default async function MarkSavedPage() {
  await connection();
  if (!isSupabaseAdminConfigured()) {
    return (
      <>
        <PageHeader eyebrow="Mark" title="Saved" description="Items you star in chat live here, ready to promote into a campaign." backHref="/mark" backLabel="Back to chat" />
        <EmptyState title="Connect Supabase to save items" detail="Saving is disabled until NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set." />
      </>
    );
  }
  const operator = getOperatorActor();
  const items = await listSavedItems(operator);
  let campaigns: { id: string; name: string }[] = [];
  try {
    const list = await getCampaignWorkspaceList();
    // getCampaignWorkspaceList returns a workspace list — map to {id,name}. Inspect its
    // shape and adapt; fall back to [] on shape mismatch.
    campaigns = (list as unknown as { campaigns?: { id: string; name: string }[] }).campaigns ?? [];
  } catch {
    campaigns = [];
  }

  return (
    <>
      <PageHeader eyebrow="Mark" title="Saved" description="Items you star in chat. Keep experimenting, or promote one into a campaign for approval." backHref="/mark" backLabel="Back to chat" />
      {items.length === 0 ? (
        <EmptyState title="Nothing saved yet" detail="In a chat with Mark, hit the star on a generated image, a draft, or a message to keep it here." />
      ) : (
        <SavedList items={items} campaigns={campaigns} />
      )}
      <p className="mt-6 text-xs text-[var(--text-muted)]">
        Promoted items land in <Link href="/campaigns" className="text-[var(--accent)] underline">Campaigns</Link> awaiting approval.
      </p>
    </>
  );
}
```

> Inspect `getCampaignWorkspaceList()`'s real return type and map it to `{ id, name }[]`. If its shape differs, adjust the mapping (do not leave the `as unknown` cast if a clean field access works).

- [ ] **Step 2: SavedList client component**

`src/app/mark/saved/_components/saved-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { SavedItem } from "@/lib/mark-chat/saved";
import { unsaveMarkItemAction } from "../../actions";
import { PromoteDialog } from "./promote-dialog";

const KIND_LABEL: Record<SavedItem["kind"], string> = { media: "Media", draft: "Drafts", angle: "Angles" };

export function SavedList({ items, campaigns }: { items: SavedItem[]; campaigns: { id: string; name: string }[] }) {
  const [promoting, setPromoting] = useState<SavedItem | null>(null);
  const groups = (["media", "draft", "angle"] as const).map((k) => ({ k, rows: items.filter((i) => i.kind === k) })).filter((g) => g.rows.length);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.k}>
          <p className="signal-eyebrow mb-2">{KIND_LABEL[g.k]}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.rows.map((item) => (
              <div key={item.id} className="signal-panel flex flex-col gap-2 p-3">
                {item.mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed GCS URL
                  <img src={item.mediaUrl} alt={item.caption ?? item.title ?? "Saved media"} className="h-32 w-full rounded-lg object-cover" />
                ) : null}
                {item.title ? <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p> : null}
                {item.body ? <p className="line-clamp-3 text-xs text-[var(--text-secondary)]">{item.body}</p> : null}
                <div className="mt-1 flex items-center gap-2">
                  {item.promotedCampaignId ? (
                    <Link href={`/campaigns/${item.promotedCampaignId}`} className="text-xs font-semibold text-[var(--ok)]">Promoted ▸</Link>
                  ) : (
                    <button type="button" onClick={() => setPromoting(item)} className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-strong)]">
                      Promote
                    </button>
                  )}
                  {item.sourceConversationId ? (
                    <Link href={`/mark?c=${item.sourceConversationId}`} className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]">
                      Continue in chat
                    </Link>
                  ) : null}
                  <button type="button" onClick={() => unsaveMarkItemAction(item.id)} className={cx("ml-auto rounded-md px-2 py-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--priority-bright)]")}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {promoting ? <PromoteDialog item={promoting} campaigns={campaigns} onClose={() => setPromoting(null)} /> : null}
    </div>
  );
}
```

- [ ] **Step 3: Sidebar "Saved" link** — in `thread-sidebar.tsx`, next to the existing "Archived" link at the bottom, add a "Saved" link:

```tsx
<Link
  href="/mark/saved"
  className="flex items-center gap-1 px-2 pb-1 pt-3 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
>
  <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5L10 14l-4.5 2.4.9-5L2.8 7.8l5-.7z" />
  </svg>
  Saved
</Link>
```
Place it just before (or beside) the `Archived` link; keep the `mt-auto` on whichever is first so they sit at the bottom.

- [ ] **Step 4: Build + lint**

Run: `npx eslint src/app/mark/saved/page.tsx src/app/mark/saved/_components/saved-list.tsx src/app/mark/_components/thread-sidebar.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/mark/saved/ src/app/mark/_components/thread-sidebar.tsx
git commit -m "feat(mark): Saved view + sidebar link"
```

---

## Task 9: Promote dialog (existing / new campaign)

**Files:**
- Create: `src/app/mark/saved/_components/promote-dialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { cx } from "@/app/_components/theme";
import type { SavedItem } from "@/lib/mark-chat/saved";
import { OFFICIAL_PERSONA_MAPPINGS, RESTORATION_FOCUS_VALUES } from "@/domain";
import { promoteSavedItemAction, type PromoteTarget } from "../../actions";

function humanize(s: string) {
  return s.replace(/^persona_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PromoteDialog({ item, campaigns, onClose }: { item: SavedItem; campaigns: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<"existing" | "new">(campaigns.length ? "existing" : "new");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [name, setName] = useState(item.title ?? "");
  const [persona, setPersona] = useState<string>(OFFICIAL_PERSONA_MAPPINGS[0]);
  const [focus, setFocus] = useState<string>(RESTORATION_FOCUS_VALUES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const target: PromoteTarget =
      tab === "existing" ? { mode: "existing", campaignId } : { mode: "new", name, persona, restorationFocus: focus };
    const res = await promoteSavedItemAction(item.id, target);
    setBusy(false);
    if (!res.ok) { setError(res.message ?? "Couldn't promote."); return; }
    onClose();
    if (res.campaignId) router.push(`/campaigns/${res.campaignId}`);
  }

  const tabCls = (active: boolean) => cx("rounded-md px-3 py-1.5 text-sm font-medium transition", active ? "bg-[var(--surface-inset)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]");
  const fieldCls = "h-9 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="Promote to campaign">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-4 shadow-[var(--elev-raised)]">
        <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">Promote to a campaign</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Creates a draft asset awaiting approval. Outbound stays locked.</p>

        <div className="mt-3 flex gap-1">
          <button type="button" onClick={() => setTab("existing")} className={tabCls(tab === "existing")} disabled={!campaigns.length}>Existing</button>
          <button type="button" onClick={() => setTab("new")} className={tabCls(tab === "new")}>New campaign</button>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {tab === "existing" ? (
            campaigns.length ? (
              <select aria-label="Campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={fieldCls}>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">No campaigns yet — use New campaign.</p>
            )
          ) : (
            <>
              <input aria-label="Campaign name" placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} />
              <select aria-label="Persona" value={persona} onChange={(e) => setPersona(e.target.value)} className={fieldCls}>
                {OFFICIAL_PERSONA_MAPPINGS.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}
              </select>
              <select aria-label="Restoration focus" value={focus} onChange={(e) => setFocus(e.target.value)} className={fieldCls}>
                {RESTORATION_FOCUS_VALUES.map((f) => <option key={f} value={f}>{humanize(f)}</option>)}
              </select>
            </>
          )}
          {error ? <p className="text-xs font-medium text-[var(--priority-bright)]">{error}</p> : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60">
            {busy ? "Promoting…" : "Promote"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint src/app/mark/saved/_components/promote-dialog.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/mark/saved/_components/promote-dialog.tsx
git commit -m "feat(mark): promote dialog (existing / new campaign)"
```

---

## Task 10: Chat settings gear + campaign attachment + header chip

**Files:**
- Create: `src/app/mark/_components/chat-settings.tsx`
- Modify: `src/app/mark/_components/mark-chat.tsx`
- Modify: `src/app/mark/page.tsx`

- [ ] **Step 1: Pass campaign context into the chat** — in `src/app/mark/page.tsx`, the active conversation already loads via `getConversation`. Pass its `campaignId` and the operator's campaign list to `MarkChat`:

```tsx
// near the other reads (guarded in the same try block):
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
// ...
let campaigns: { id: string; name: string }[] = [];
try {
  const list = await getCampaignWorkspaceList();
  campaigns = (list as unknown as { campaigns?: { id: string; name: string }[] }).campaigns ?? [];
} catch { campaigns = []; }
// pass to <MarkChat ... activeCampaignId={activeConversation?.campaignId ?? null} campaigns={campaigns} />
```
Add `activeCampaignId: string | null` and `campaigns: { id: string; name: string }[]` to `MarkChat`'s props.

- [ ] **Step 2: ChatSettings popover**

`src/app/mark/_components/chat-settings.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "@/app/_components/theme";
import type { MarkProject } from "@/lib/mark-chat/persistence";
import { attachCampaignForm, moveConversationForm } from "../actions";

export function ChatSettings({
  conversationId,
  projects,
  activeProjectId,
  campaigns,
  activeCampaignId,
}: {
  conversationId: string;
  projects: MarkProject[];
  activeProjectId: string | null;
  campaigns: { id: string; name: string }[];
  activeCampaignId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const fieldCls = "h-8 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" aria-label="Chat settings" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]">
        <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="2.5" />
          <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.5 1.5M13.5 13.5L15 15M15 5l-1.5 1.5M6.5 13.5L5 15" />
        </svg>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-9 z-30 w-60 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-3 shadow-[var(--elev-raised)]">
          <p className="signal-eyebrow mb-2">Chat context</p>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">Project</label>
          <form action={moveConversationForm}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <select name="projectId" defaultValue={activeProjectId ?? ""} aria-label="Project" onChange={(e) => e.currentTarget.form?.requestSubmit()} className={fieldCls}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </form>
          <label className="mb-1 mt-3 block text-[11px] font-medium text-[var(--text-muted)]">Campaign</label>
          <form action={attachCampaignForm}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <select name="campaignId" defaultValue={activeCampaignId ?? ""} aria-label="Campaign" onChange={(e) => e.currentTarget.form?.requestSubmit()} className={fieldCls}>
              <option value="">No campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </form>
          <p className="mt-2 text-[10px] text-[var(--text-muted)]">Saved items from this chat promote into the attached campaign by default.</p>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Mount the gear + campaign chip in the header** — in `mark-chat.tsx`, in the header's right-side controls (where `MarkConnection` and `ThreadMenu` render, only when `activeId`), add the gear and, when a campaign is attached, a chip:

```tsx
import { ChatSettings } from "./chat-settings";
// ... inside the header right cluster, when activeId:
{activeCampaignId ? (
  <Link href={`/campaigns/${activeCampaignId}`} className="hidden items-center gap-1 rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-contrast)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)] sm:inline-flex">
    {campaigns.find((c) => c.id === activeCampaignId)?.name ?? "Campaign"}
  </Link>
) : null}
<ChatSettings conversationId={activeId} projects={projects} activeProjectId={activeProjectId} campaigns={campaigns} activeCampaignId={activeCampaignId} />
```
(`Link` is already imported in `mark-chat.tsx`. Add `activeCampaignId` and `campaigns` to the destructured props + type.)

- [ ] **Step 4: Build + lint**

Run: `npx eslint src/app/mark/_components/chat-settings.tsx src/app/mark/_components/mark-chat.tsx src/app/mark/page.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/mark/_components/chat-settings.tsx src/app/mark/_components/mark-chat.tsx src/app/mark/page.tsx
git commit -m "feat(mark): chat settings gear (project + campaign attach) + header chip"
```

---

## Task 11: Full verification + guardrails

**Files:** none (verification only)

- [ ] **Step 1: Tests**

Run: `pnpm test`
Expected: PASS — including new `saved.test.ts`, `create.promote.test.ts`, `actions.promote.test.ts`, and existing `persistence.test.ts`. (If the pre-existing concurrent `use-thread-poll.test.ts` is still red, note it; it is not part of this feature.)

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no new warnings in `src/app/mark/`, `src/lib/mark-chat/`, `src/lib/campaigns/`.

- [ ] **Step 3: Type-check OUR files**

Run: `npx tsc --noEmit` then confirm none of the feature's files appear in the error list (the only acceptable remaining errors are the unrelated concurrent `console-frame.tsx` / `use-thread-poll.test.ts`).

- [ ] **Step 4: Manual smoke (dev)**

Run `pnpm dev`, then on `/mark`:
- Save a generated media item, a draft card, and a Mark message (angle); stars fill.
- `/mark/saved` lists all three groups with previews.
- Promote → Existing campaign → asset appears in `/campaigns` as pending approval; the existing Approve/Decline works.
- Promote → New campaign (name + persona + focus) → new campaign + pending asset appear; redirects to `/campaigns/<id>`.
- Continue in chat re-opens the source thread; Remove unsaves.
- Header gear: attach a Project and a Campaign; the campaign chip shows and links; with a campaign attached, the Promote dialog defaults to it.
- Supabase-unconfigured: `/mark/saved` shows the connect-Supabase empty state; saving is disabled.
- Reduced-motion: no regressions.

- [ ] **Step 5: DESIGN.md §8 guardrail diff**

Review `git diff main --stat` and the new components for: no emoji, no glow/gradient decoration, no purple/neon, no nested `signal-panel`s. Fix inline.

- [ ] **Step 6: Final commit (if any guardrail fixes)**

```bash
git add -A
git commit -m "chore(mark): save/promote guardrail polish"
```

---

## Self-Review Notes (author)

- **Spec coverage:** migration+campaign_id→T1; conversation read-model+assign→T2; `saved.ts`→T3; promote helpers→T4; actions (save/unsave/promote/attach + validation)→T5; SaveStar→T6; ⭐ on media/draft/angle→T7; Saved view+sidebar→T8; promote dialog (existing/new)→T9; chat settings gear + campaign chip + page wiring→T10; verify→T11. All spec units covered.
- **Type consistency:** `SavedItem`/`SaveItemInput` (T3) consumed by actions (T5) and UI (T6–T9); `PromoteTarget`/`validatePromoteTarget` defined (T5) and used (T9); `createCampaignShell`/`promoteAssetToCampaign` defined (T4) used (T5); `assignConversationToCampaign` defined (T2) used (T5); `campaignId` read-model (T2) used (T10). Snake/camel mapping centralised in `saved.ts` and `toConversation`.
- **Known external caveat:** `getCampaignWorkspaceList()`'s exact return shape must be inspected at T8/T10 and mapped to `{id,name}[]` — flagged inline in those tasks (don't ship the `as unknown` cast if a clean field access works).
- **No placeholders:** every code step ships real code; commands have expected output.
