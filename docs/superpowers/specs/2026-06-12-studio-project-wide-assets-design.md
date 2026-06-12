# Studio: Project-Wide Asset Library

**Date:** 2026-06-12
**Status:** Approved (design)
**Area:** `src/app/mark` (Mark chat + Studio)

## Problem

The Studio (the persistent right-side workspace in the Mark chat, `work-canvas.tsx`)
shows the asset library for the **current conversation only**. Its assets are derived
purely from the active chat's message `actions` via `collectAssets(messages)`. When an
operator works on the same body of work across several chats inside one Mark Project,
each chat has its own isolated asset library, so previously generated assets are not
visible from a sibling chat.

We want the Studio's **Assets** library to aggregate every asset Mark has generated
across all chats that belong to the **same Mark Project** (`mark_conversations.project_id`).

## Scope (decided)

- **Asset scope:** the **Mark Project group**. All active conversations sharing the
  active chat's `project_id` contribute to one shared asset library. A chat with **no
  project** (`project_id IS NULL`) behaves exactly as today — it shows only its own assets.
- **Tab scope:** **only the Assets tab** (library grid + the campaign-cover asset count)
  becomes project-wide. `Now` (the live build / latest draft), `Building`, and `Audience`
  stay scoped to the **current chat**. Audience may become project-wide in a later pass;
  out of scope here.
- **Cross-chat assets:** show a small "from &lt;chat title&gt;" source chip on tiles that
  originate in a different conversation, and remain reviewable/approvable in place (the
  approval action keys on `assetId`/`campaignId`, independent of the originating chat).

## Approach (chosen: A)

Aggregate from sibling-chat messages. Assets are already message-derived, so we load the
asset-bearing Mark messages from the other conversations in the project and feed them into
the same `collectAssets` pipeline. Rejected alternatives:

- **B — campaigns-table read-model:** more "correct" data modeling, but the Studio's assets
  include non-campaign drafts that only exist as message actions, so it both misses data and
  is a large rewrite. Overkill.
- **C — lazy client fetch on tab open:** the per-project payload is small enough to load with
  the page; an extra endpoint + loading state adds complexity for little gain.

## Design

### 1. Persistence — `src/lib/mark-chat/persistence.ts`

Add:

```ts
export async function listProjectAssetMessages(
  projectId: string,
  operator: string,
  options: { excludeConversationId?: string; limit?: number } = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkMessage[]>
```

Behavior:
- Resolve the active conversation IDs in the project: `mark_conversations` where
  `operator = operator`, `project_id = projectId`, `status = 'active'`.
- Optionally drop `excludeConversationId` (the active chat — its messages already arrive
  live via `initialMessages` + polling, so we don't double-load them).
- Return `mark_messages` for those conversation IDs where `role = 'mark'` and `actions`
  is non-empty, ordered `created_at DESC`, capped at `limit` (default ~100), mapped through
  the existing `toMessage`.
- Returns `[]` for no sibling conversations. Reuses `MESSAGE_COLUMNS` / `toMessage`; no new
  row shape.

If filtering `actions` non-empty in SQL is awkward (JSONB), select role='mark' messages and
filter `m.actions.length > 0` in JS after `toMessage` — still bounded by `limit`.

### 2. Page wiring — `src/app/mark/page.tsx`

In `loadLiveMarkChatProps`, after resolving `activeConversation`:
- If `activeConversation?.projectId` is set, call
  `listProjectAssetMessages(projectId, operator, { excludeConversationId: activeConversation.id })`
  inside the existing try/timeout posture (non-fatal: on error, fall back to `[]`).
- Add `projectMessages: MarkMessage[]` to the returned `MarkChatProps`.

Demo path (`getDemoChat`) passes `projectMessages: []` — behavior unchanged without backend.

### 3. Component plumbing — `src/app/mark/_components/mark-chat.tsx`

- Add `projectMessages: MarkMessage[]` to `MarkChat`'s props (default `[]`).
- Pass `projectMessages` to both `WorkCanvas` instances (docked + drawer).
- No change to `messages` / `displayMessages` — those remain the current chat and continue
  to drive the chat thread, `Now`, `Building`, and `Audience`.

### 4. Studio — `src/app/mark/_components/work-canvas.tsx`

- Add `projectMessages?: MarkMessage[]` prop (default `[]`).
- Build the Assets-tab source set by merging current + project messages and collecting once:
  `const assets = useMemo(() => collectAssets([...messages, ...projectMessages]), ...)`
  (inside `WorkCanvas` the active-chat prop is named `messages`; the parent passes
  `displayMessages` into it)
  where `collectAssets` already dedupes by asset id (`approval.assetId` or `messageId-index`).
  Current-chat assets win on collision because they're listed first.
- `Now` / `Building` / `Audience` continue to read from `messages` only (unchanged).
- The Assets count badge and `CampaignCover` asset count reflect the merged set.

### 5. Source chip — `src/app/mark/_components/asset-library.tsx`

- `StudioAsset` already carries `conversationId`. Pass an optional
  `currentConversationId` and a `conversationTitles: Record<string, string>` (id → title)
  into `AssetLibrary` so a tile whose `conversationId !== currentConversationId` can render a
  small "from &lt;title&gt;" chip. `WorkCanvas` derives the title map from
  `projectMessages` + the active chat. Tiles from the current chat show no chip.
- Chip is presentational only; selecting a tile still opens it in place via the existing
  `onSelect` → `AssetDetail` path.

## Data flow summary

```
page.tsx (server)
  activeConversation.projectId?
    -> listProjectAssetMessages(projectId, operator, {excludeConversationId})
    -> projectMessages
MarkChat (client)
  messages (active chat, live-polled)      -> chat thread, Now, Building, Audience
  projectMessages (siblings, static)       -> Studio Assets only
WorkCanvas
  Assets tab: collectAssets([...messages, ...projectMessages])  (deduped)
```

## Edge cases

- **No project:** `projectMessages = []` → identical to today.
- **Demo mode:** `projectMessages = []` (no backend).
- **Dedup:** an asset present in both sets shows once; current-chat copy wins.
- **Liveness:** sibling-chat assets refresh on navigation/`router.refresh`, not via the
  active-chat poll — acceptable, since they aren't changing during this session. The current
  chat's new assets still appear live (they come from `messages`).
- **Load bound:** `limit` (~100 newest asset-bearing messages) caps the query.
- **Review in place:** approval action keys on `assetId`/`campaignId`, so cross-chat assets
  approve/decline/revise without leaving the current chat.

## Testing

- Unit: `collectAssets` dedup across merged current+project messages (current wins).
- Unit: `listProjectAssetMessages` query shape — filters by project/operator/active,
  excludes the active conversation, drops messages with empty `actions`, respects `limit`.
  (Follow existing persistence test patterns / mocked Supabase client if present.)
- Manual: two chats in one project; assets from chat A appear in chat B's Studio with a
  "from A" chip and approve in place; a no-project chat shows only its own assets.

## Out of scope

- Project-wide Audience aggregation.
- Persisting assets to a dedicated table / campaigns read-model (Approach B).
- Cross-chat navigation from a tile (we review in place, not jump chats).
