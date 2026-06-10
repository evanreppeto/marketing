# Mark — Save & Promote ("Sandbox → Production")

**Date:** 2026-06-10
**Status:** Concept approved; spec pending user review
**Surfaces:** `src/app/mark/` (chat), `src/lib/mark-chat/`, a new Saved view, a chat-settings popover (attach project + campaign), ties into `/campaigns`

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

### Phase 1 (MVP) — Save assets + angles, Promote to existing OR new campaign

Save the *creative* Mark generates (a media asset or an ad/draft action card) **and**
arbitrary message text as a **campaign angle/strategy**; revisit any of them in a Saved
view; and promote a winner into the campaign approval flow — either attached to an
**existing** campaign or by **creating a new** campaign (capturing persona +
restoration-focus). (Whole-thread saving already exists as sidebar **Pin to top**.)

### Phase 2 (later, not built here)

- A unified **favorites pinboard** that also folds in pinned threads as a saved kind.
- AI "make variants" generation from a saved item (beyond re-seeding a chat).

## Data Model

New table — a dedicated pinboard, **not** a Vault note (Vault lacks `reference_*`
columns and uses static folders). Snapshots the saved content so it survives the
source message scrolling away or changing.

New migration `supabase/migrations/<ts>_mark_saved_items.sql`:

```sql
create table public.mark_saved_items (
  id uuid primary key default gen_random_uuid(),
  operator text not null,
  kind text not null check (kind in ('media','draft','angle')),
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

**Attach a campaign to a conversation** (same or a second migration):

```sql
alter table public.mark_conversations
  add column campaign_id uuid references public.campaigns(id) on delete set null;
```

`mark_conversations` already has `project_id`. The conversation read-model
(`CONVERSATION_COLUMNS`, `toConversation`) gains `campaignId`, mirroring `projectId`.

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
  - each **draft `ActionCard`** in `action-card.tsx` (saves `kind:'draft'`, `title`, `body`=preview, `sourceCampaignId/assetId` from `card.approval`),
  - each **Mark message** (the message action bar in `message-list.tsx`) as a
    **campaign angle** (saves `kind:'angle'`, `body`=message text, `title`=first line).
- Filled star = saved (toggle to unsave). Save state seeded from server (the page
  passes a set of saved source keys), updated optimistically on click.
- Token-native, no glow; star uses `--accent` when active.

### 3. Saved view — `src/app/mark/saved/page.tsx` (new) + `_components/`

- New route `/mark/saved`, reachable from a **"Saved"** link in the thread sidebar
  footer (next to the existing **Archived** link).
- Server component: `listSavedItems(operator)`; renders cards grouped by kind
  (Media / Drafts / Angles), each showing preview, source-thread link, the operator
  note, and two actions: **Continue in chat** and **Promote**. Empty state per Signal.
- Reuses `PageHeader`/`Panel`/`EmptyState` primitives; obsidian+gold.

### 4. Keep experimenting — re-seed a chat

- **Continue in chat** opens the source conversation (`/mark?c=<sourceConversationId>`),
  or if gone, a new chat with the item quoted into the composer draft (e.g.
  `Make 3 variants of this: "<body>"` for a draft, or the media referenced as context).
- Implemented by linking to `/mark?c=…&seed=…` or passing the seed via the existing
  per-thread draft mechanism (sessionStorage `mark:draft:*`). No backend change.

### 5. Promote → existing OR new campaign — `src/app/mark/actions.ts` + `src/lib/campaigns/`

One action with a discriminated target:

```ts
type PromoteTarget =
  | { mode: "existing"; campaignId: string }
  | { mode: "new"; name: string; persona: string; restorationFocus: RestorationFocus };

promoteSavedItemAction(savedItemId: string, target: PromoteTarget): Promise<{ ok; campaignId?; assetId?; message? }>
```

Steps:
  1. Load the saved item (operator-gated). The Promote dialog **defaults its target to
     the saved item's source conversation's attached `campaignId`** when present, so an
     attached-campaign chat promotes straight there.
  2. **Resolve the campaign.** `existing` → use `campaignId`. `new` → insert a
     `campaigns` row (`status:'draft'`, `launch_locked:true`, `persona`,
     `restoration_focus`, `name`, `owner:operator`, `source_system:'mark_saved'`) and a
     `campaign_events` `created`. Validate `persona` ∈ `OFFICIAL_PERSONA_MAPPINGS`
     (`@/domain`) and `restorationFocus` ∈ the `restoration_focus` enum; reject otherwise.
  3. Insert a `campaign_assets` row under the resolved campaign: `status:'pending_approval'`,
     `asset_type` inferred (media → `'image_prompt'`, draft → `'social_ad'`, angle →
     `'social_ad'`), `title` from item, `draft_body` from `body`, `dispatch_locked:true`,
     `tool_source:'mark_saved'`, `audit_payload` carrying `media_url`/source ids.
  4. Insert an `approval_items` row gating it (`campaign_asset_id`, `campaign_id`,
     `item_type:'campaign_asset'`, `status:'pending_approval'`, `locked_until_approved:true`,
     `requested_by:operator`).
  5. Log a `campaign_events` `asset_generated` (actor=operator, detail='promoted from Mark saved').
  6. `markPromoted(savedItemId, { campaignId, assetId })`; `revalidatePath('/campaigns')` + `'/mark/saved'`.
- New persistence helpers in `src/lib/campaigns/create.ts`:
  - `createCampaignShell(input): Promise<{ campaignId }>` — the `campaigns`-row insert
    above (factored from `createOperatorCampaign`'s campaign insert; reuse its column shape).
  - `promoteAssetToCampaign(input): Promise<{ assetId }>` — the asset + approval_item +
    event inserts (factored from `insertPhotoAsset`, but `pending_approval`, not pre-approved).
  Reuse existing column knowledge; do not invent fields.
- **UI** (`_components/promote-dialog.tsx`): a small dialog with two tabs —
  **Existing** (a picker of the operator's campaigns via `getCampaignWorkspaceList()`)
  and **New** (name input + persona `<select>` from `OFFICIAL_PERSONA_MAPPINGS` +
  restoration-focus `<select>` from the enum). Submitting runs `promoteSavedItemAction`
  with the matching target. Token-native; reuses input/select styles.

### 6. Chat settings (gear) + campaign attachment — `mark-chat.tsx`, new `_components/chat-settings.tsx`, `actions.ts`, persistence

- **Header gear**: a settings button in the chat header (next to `MarkConnection` /
  `ThreadMenu`) opens a small **Chat settings** popover (same hand-rolled popover
  pattern as `ThreadMenu` — outside-click + Esc close). It is the home for attaching
  context to this chat:
  - **Project** — the same project list; sets `mark_conversations.project_id`
    (reuses `moveConversationForm` / `assignConversationToProject`).
  - **Campaign** — pick from the operator's campaigns (`getCampaignWorkspaceList()`);
    sets `mark_conversations.campaign_id`.
- **Persistence**: `assignConversationToCampaign(conversationId, campaignId | null)` in
  `src/lib/mark-chat/persistence.ts` (mirrors `assignConversationToProject`); read-model
  exposes `campaignId`.
- **Action**: `attachCampaignForm(formData)` (operator-gated, supabase-guarded) →
  `assignConversationToCampaign`; `revalidatePath('/mark')`.
- **Header chip**: when a campaign is attached, the header shows a small campaign chip
  linking to `/campaigns/<id>` (so "it goes there" is visible and navigable).
- **Routing effect**: the attached `campaignId` is the Promote default (Unit 5). Mark's
  worker-side auto-creation of drafts directly under the attached campaign is a noted
  **follow-on** (the enqueue already carries conversation context; passing `campaignId`
  through `enqueueMarkChatTask` so Mark files outputs there is out of scope for Phase 1).
- The composer-footer **Project** selector (already shipped) stays; the settings popover
  is the fuller context panel (project + campaign together).

## Data Flow

`/mark` (server) loads saved-source keys for star state → `MessageList`/`ActionCard`
render ⭐ → `saveMarkItemAction` inserts → `/mark/saved` lists items → **Promote** picks
a campaign → `promoteSavedItemAction` inserts a `pending_approval` asset+gate →
`/campaigns` shows it awaiting approval (existing Approve/Decline). **Continue in chat**
re-opens/seeds a thread. No change to the approval state machine.

## Testing

- **Unit (vitest):** `saved.ts` (save/list/remove/find/markPromoted) with the Supabase
  mock; `createCampaignShell` + `promoteAssetToCampaign` insert-shape tests; promote
  persona/focus validation (rejects invalid); star toggle-state derivation.
- **Manual:** save a media item, a draft card, and a message as an angle; star
  reflects saved; `/mark/saved` lists all three groups; Promote → **existing** campaign
  → asset appears in `/campaigns` pending approval; Promote → **new** campaign (pick
  persona + focus) → new campaign + pending asset both appear; existing Approve flow
  works; Continue-in-chat re-seeds; unsave; reduced-motion; Supabase-unconfigured
  degrades (no crash, save disabled with a note).
- **Chat settings:** header gear opens the settings popover; attach a project and a
  campaign; header shows the campaign chip linking to `/campaigns/<id>`; with a campaign
  attached, the Promote dialog defaults its target to it; detach (set to none) clears it.
- **Guardrail:** DESIGN.md §8 diff check (no emoji/glow/gradient/purple/nested cards).

## Risks & Mitigations

- **Promote needs a campaign** → the dialog offers both attach-to-existing and
  create-new (with persona + restoration-focus capture, validated against `@/domain`).
  The "no existing campaigns yet" case still works via the New tab.
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
