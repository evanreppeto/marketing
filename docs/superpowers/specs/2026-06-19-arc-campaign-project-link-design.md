# Arc Campaign → Chat Project Link — Design

**Date:** 2026-06-19
**Status:** Approved (design) — pending spec review
**Scope:** When Arc creates or works in a campaign inside a chat, automatically give that chat a **project** (create-if-none, reuse-if-present) and set the chat's current campaign — so campaign work is organized into a project tied to the conversation.

## Problem

A conversation (`arc_conversations`) can belong to a project (`project_id` → `arc_projects`) and a campaign (`campaign_id`), but when Arc creates a campaign (via `create_campaign_draft` or the `generate_image`/`generate_video` tools) nothing creates a project or links the current chat. The operator has to organize manually. We want Arc's campaign work to auto-organize: the chat gets a project workspace and its current campaign reflects what Arc just did.

## Current model (confirmed)

- `arc_projects` (id, operator, title, status, timestamps). `arc_conversations.project_id` → `arc_projects(id)` (on delete set null); `arc_conversations.campaign_id`.
- **Campaigns have no `project_id`** — the link is conversation→project and conversation→campaign. The project effectively groups a chat + its campaign(s).
- `src/lib/arc-chat/persistence.ts` already has `createProject({operator,title})`, `createConversation({operator,title,projectId?})`, `listProjects`, `renameProject` — but **no function to update an existing conversation's `project_id`/`campaign_id`**.
- `POST /api/v1/arc/campaigns/draft-asset` (the one route all campaign-creating tools hit) calls `createCampaignShell` / `promoteAssetToCampaign` and best-effort `markOpportunityDrafted` — it does NOT receive the conversation id today.
- Runner: `ToolContext = { opportunityId?, level? }`; `runArcTurn` builds it as `{ level }`; `payload.conversationId` is available but not threaded into tools.

## Behavior

On any campaign-creating/attaching draft (chat-originated only):
1. If the conversation has **no** `project_id` → create an `arc_projects` row (title = campaign name) and set `conversation.project_id`.
2. If it **already has** a project → reuse it (no duplicate, no re-point).
3. Set `conversation.campaign_id` to the campaign just created/worked-on (the chat's current campaign).

Automatic side-effect of campaign work — not a new Arc tool (reliable; doesn't depend on Arc choosing to call it). Opportunity-draft wakes are excluded.

## Architecture

### a. Runner — thread the conversation id
- Add `conversationId?: string` to `ToolContext` (`apps/arc-runner/src/tools/index.ts`).
- `runArcTurn` (`arc.ts`): set `toolContext: { level: payload.route, conversationId: payload.conversationId }`. `runArcOpportunityDraft`: leave `conversationId` unset (opportunity drafts aren't chats → no project link).
- `create_campaign_draft` (`tools/drafts.ts`) and `generate_image`/`generate_video` (`tools/media.ts`): include `conversation_id: ctx.conversationId` in the `apiPost` body to `/api/v1/arc/campaigns/draft-asset` (omit when undefined).

### b. App route — best-effort link
`draft-asset/route.ts`: read `conversation_id` from the body. After the campaign is created/resolved (`campaignId` known), if `conversation_id` is present, call the new helper inside a `.catch(() => undefined)` (mirrors `markOpportunityDrafted` — a link failure must never turn a successful 201 into a 502). The campaign name for the project title: use the `name` field when a new shell was created; for an existing `campaign_id`, look it up (cheap) or fall back to a default.

### c. Persistence — link helper
New in `src/lib/arc-chat/persistence.ts`:
`linkConversationToCampaign(conversationId, campaignId, projectTitle, client?)`:
1. Load the conversation (operator, project_id).
2. If `project_id` is null → `createProject({ operator, title: projectTitle })` → set the new project id.
3. `update arc_conversations set project_id = <project>, campaign_id = <campaignId> where id = <conversationId>` (project_id only changes when it was null; campaign_id always set to the worked campaign).
Org/operator scoping follows the existing conversation persistence (service-role client).

## Data flow

```
Arc (chat) creates a campaign → create_campaign_draft / generate_image|video
  → POST /api/v1/arc/campaigns/draft-asset { ..., conversation_id }
  → createCampaignShell/promote → campaignId
  → linkConversationToCampaign(conversation_id, campaignId, name)  [best-effort]
       → project created if none (title=campaign name) → conversation.project_id + campaign_id set
  → 201 { campaignId, assetId }   (unchanged on link failure)
```

## Safety & scope

- No change to approval gating / outbound lock — organizes records only.
- Best-effort link: never fails the draft.
- Reuse-if-present: never duplicates or silently re-points an existing project.
- Excludes opportunity-draft wakes (no real conversation).
- **No `campaigns.project_id` schema column** — link stays conversation→project (matches current schema; YAGNI). No migration.
- The `/arc` composer project selector reflects the new `project_id` automatically — no UI change.

## Testing

- **Persistence** (`linkConversationToCampaign`): creates + links a project when conversation has none (title = passed name); reuses when `project_id` set (no new project); always sets `campaign_id`. (Mock Supabase.)
- **Route**: with `conversation_id` → helper called with the resolved `campaignId`; without it (opportunity path) → not called; helper throwing still yields 201.
- **Runner**: `runArcTurn` threads `conversationId` into `ToolContext`; `runArcOpportunityDraft` does not; the three draft tools include `conversation_id` in their POST when present.
- Runner suite + `pnpm build`.

## Deploy

App (route + persistence) → Vercel. Runner (tool-context threading) → Cloud Build trigger. Both halves are needed for the end-to-end behavior.

## Out of scope

- A `campaigns.project_id` column / many campaigns formally grouped under a project beyond the conversation link.
- Renaming the project when later campaigns are created in the same chat (project keeps its first title).
- Any new UI (the existing project selector surfaces the link).
- Letting Arc *choose* the project explicitly via a tool (automatic only).
