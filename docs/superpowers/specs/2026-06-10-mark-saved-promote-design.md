# Mark — Save & Promote ("Sandbox → Production")

**Date:** 2026-06-10
**Status:** Concept approved; spec pending user review
**Surfaces:** `src/app/mark/` (chat), `src/lib/mark-chat/`, a new Saved view, ties into `/campaigns`

## Goal

Give the operator a lightweight middle stage between casual chat exploration and the
formal campaign approval pipeline: **star Mark's good outputs, keep experimenting on
them, then promote a winner into the existing `/campaigns` approval flow.**

> **Spine:** Chat (explore) → ⭐ Saved / Sandbox (experiment) → Promote → `/campaigns` approval (production)

"Production" is deliberately **not** a new space — it is the existing `/campaigns`
draft→approval pipeline, which already gates outbound (`dispatch_locked`), has
draft/approve/decline/revision/archive states, and renders Approve/Decline controls.
Promoting reuses it so there's one source of truth for what's real.

## Non-Goals (this spec)

- No new "Production" area. Promote targets existing campaigns.
- No change to the campaign approval state machine, gating, or `/campaigns` UI beyond
  a promoted asset appearing there as `pending_approval`.
- No AI "auto-variant" generation engine — "keep experimenting" just re-seeds a chat.
- Vault is untouched (it stays the knowledge-base; Saved is a separate concern).

## Scope — Phased

### Phase 1 (MVP) — Save assets + Promote to an existing campaign

The tightest, highest-value loop: save the *creative* Mark generates (a media asset or
an ad/draft action card), revisit it, and promote it into a campaign for approval.
(Whole-thread saving already exists as sidebar **Pin to top**; angles and a cross-type
pinboard are Phase 2.)

### Phase 2 (later, not built here)

- Save arbitrary message text as a **campaign angle/strategy**.
- A unified **favorites pinboard** across assets, angles, and pinned threads.
- **Create a new campaign** from a saved item (needs a persona + restoration-focus
  capture step, since `campaigns` requires both NOT NULL).

## Data Model

New table — a dedicated pinboard, **not** a Vault note (Vault lacks `reference_*`
columns and uses static folders). Snapshots the saved content so it survives the
source message scrolling away or changing.

New migration `supabase/migrations/<ts>_mark_saved_items.sql`:

```sql
create table public.mark_saved_items (
  id uuid primary key default gen_random_uuid(),
  operator text not null,
  kind text not null check (kind in ('media','draft')),   -- Phase 2 adds 'angle'
  title text,
  body text,                       -- ad copy / draft preview
  media_url text,                  -- for kind='media'
  caption text,
  source_conversation_id uuid references public.mark_conversations(id) on delete set null,
  source_message_id uuid,          -- mark_messages.id the item came from (no hard FK; metadata-derived)
  source_campaign_id uuid,         -- existing campaign asset's campaign, if the card referenced one
  source_asset_id uuid,            -- existing campaign_assets.id, if any
  note text,                       -- operator's freeform "why I saved this"
  promoted_campaign_id uuid,       -- set on promote
  promoted_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mark_saved_items_operator_idx on public.mark_saved_items (operator, created_at desc);
create index mark_saved_items_kind_idx on public.mark_saved_items (kind);
```

Grant the data-API role select/insert/update/delete (follow the existing grant
migration pattern). Apply via a new timestamped migration; don't edit shipped ones.

## Units

### 1. Persistence — `src/lib/mark-chat/saved.ts` (new)

Pure I/O over `mark_saved_items`, guarded by `isSupabaseAdminConfigured()`:

- `type SavedItem = { id; operator; kind; title; body; mediaUrl; caption; sourceConversationId; sourceMessageId; sourceCampaignId; sourceAssetId; note; promotedCampaignId; promotedAssetId; createdAt }`
- `saveItem(input): Promise<SavedItem>` — insert.
- `listSavedItems(operator): Promise<SavedItem[]>` — newest first.
- `removeSavedItem(id, operator): Promise<void>` — unsave.
- `findSavedBySource(operator, sourceMessageId, mediaUrl|assetId): Promise<SavedItem | null>` — for toggle state.
- `markPromoted(id, { campaignId, assetId }): Promise<void>`.

Unit-tested with the same Supabase-mock pattern as `persistence.test.ts`.

### 2. Save action + star affordance — `src/app/mark/actions.ts`, `message-list.tsx`

- Server actions (operator-gated, supabase-guarded):
  - `saveMarkItemAction(input): Promise<{ ok: boolean; id?: string; message?: string }>`
  - `unsaveMarkItemAction(id): Promise<void>`
- UI: a quiet ⭐ button on
  - each **media item** in `message-media.tsx` (saves `kind:'media'`, `mediaUrl`, `caption`),
  - each **draft `ActionCard`** in `action-card.tsx` (saves `kind:'draft'`, `title`, `body`=preview, `sourceCampaignId/assetId` from `card.approval`).
- Filled star = saved (toggle to unsave). Save state seeded from server (the page
  passes a set of saved source keys), updated optimistically on click.
- Token-native, no glow; star uses `--accent` when active.

### 3. Saved view — `src/app/mark/saved/page.tsx` (new) + `_components/`

- New route `/mark/saved`, reachable from a **"Saved"** link in the thread sidebar
  footer (next to the existing **Archived** link).
- Server component: `listSavedItems(operator)`; renders cards grouped by kind
  (Media / Drafts), each showing preview, source-thread link, the operator note, and
  two actions: **Continue in chat** and **Promote**. Empty state per Signal.
- Reuses `PageHeader`/`Panel`/`EmptyState` primitives; obsidian+gold.

### 4. Keep experimenting — re-seed a chat

- **Continue in chat** opens the source conversation (`/mark?c=<sourceConversationId>`),
  or if gone, a new chat with the item quoted into the composer draft (e.g.
  `Make 3 variants of this: "<body>"` for a draft, or the media referenced as context).
- Implemented by linking to `/mark?c=…&seed=…` or passing the seed via the existing
  per-thread draft mechanism (sessionStorage `mark:draft:*`). No backend change.

### 5. Promote → existing campaign — `src/app/mark/actions.ts` + `src/lib/campaigns/`

- `promoteSavedItemAction(savedItemId, campaignId): Promise<{ ok; assetId?; message? }>`:
  1. Load the saved item (operator-gated).
  2. Insert a `campaign_assets` row under `campaignId`: `status:'pending_approval'`,
     `asset_type` inferred (`'social_ad'` default; `'image_prompt'`/`'social_ad'` for
     media), `title` from item, `draft_body` from `body`, `dispatch_locked:true`,
     `tool_source:'mark_saved'`, `audit_payload` carrying `media_url`/source ids.
  3. Insert an `approval_items` row gating it (`campaign_asset_id`, `item_type:'campaign_asset'`,
     `status:'pending_approval'`, `locked_until_approved:true`, `requested_by:operator`).
  4. Log a `campaign_events` `asset_generated` (actor=operator, detail='promoted from Mark saved').
  5. `markPromoted(savedItemId, …)`; `revalidatePath('/campaigns')` + `'/mark/saved'`.
- A new persistence helper `promoteAssetToCampaign(input)` in `src/lib/campaigns/create.ts`
  (factored from the existing `insertPhotoAsset` insert shape, but `pending_approval`
  instead of pre-approved). Reuse existing column knowledge; do not invent fields.
- **UI**: Promote opens a small picker of the operator's existing campaigns (read via
  `getCampaignWorkspaceList()`); choosing one runs the action. If the operator has no
  campaigns, the picker explains that creating a campaign-from-saved is Phase 2 and
  links to `/campaigns` to make one first.

## Data Flow

`/mark` (server) loads saved-source keys for star state → `MessageList`/`ActionCard`
render ⭐ → `saveMarkItemAction` inserts → `/mark/saved` lists items → **Promote** picks
a campaign → `promoteSavedItemAction` inserts a `pending_approval` asset+gate →
`/campaigns` shows it awaiting approval (existing Approve/Decline). **Continue in chat**
re-opens/seeds a thread. No change to the approval state machine.

## Testing

- **Unit (vitest):** `saved.ts` (save/list/remove/find/markPromoted) with the Supabase
  mock; `promoteAssetToCampaign` insert-shape test; star toggle-state derivation.
- **Manual:** save a media item + a draft card; star reflects saved; `/mark/saved`
  lists them; Promote → asset appears in `/campaigns` as pending approval and the
  existing Approve flow works; Continue-in-chat re-seeds; unsave; reduced-motion;
  Supabase-unconfigured degrades (no crash, save disabled with a note).
- **Guardrail:** DESIGN.md §8 diff check (no emoji/glow/gradient/purple/nested cards).

## Risks & Mitigations

- **Promote needs a campaign** → MVP attaches to an existing one (no persona/focus
  requirement); create-new is Phase 2. Picker handles the "no campaigns yet" case.
- **Source message changes/scrolls** → saved item snapshots title/body/media at save
  time, so it's stable; source ids are best-effort links.
- **Supabase not configured** → all save/promote paths guard with
  `isSupabaseAdminConfigured()` and degrade to disabled affordances, like the rest of
  the app.
- **Scope creep** → angles, cross-type pinboard, and create-new-campaign are explicitly
  Phase 2; Phase 1 is assets + promote-to-existing only.

## Rollout

Single branch, incremental per-unit commits (migration → persistence+tests → actions →
star UI → saved view → promote), `pnpm build`/`lint`/`test` green before finish.
