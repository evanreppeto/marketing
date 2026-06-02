# Campaigns tab — design spec

**Date:** 2026-06-02
**Status:** Approved (brainstorm) → building
**Branch:** `feat/campaigns-tab`

## Goal

Make **Campaigns** the single visible tab. It shows every campaign Mark (Hermes)
creates, lets the operator preview creative (ads, video, physical, virtual),
see what leads/tools/reasoning produced each campaign, and prompt Mark inline to
request a revision — all detailed but uncluttered. **Outbound stays locked**;
prompting Mark creates a revision request, never a send.

## Decisions (from brainstorm)

- **Layout:** Library (gallery) → full-screen workspace with sub-tabs + a
  persistent Mark rail. (Direction A structure + Direction C persistent Mark.)
- **Rebuild UI fresh**, keep the intact `src/lib/campaigns/read-model.ts`.
- **Data:** live-only. No Supabase / no campaigns → clean empty state.
- **Revision scope:** per-asset.
- **Mark prompt = revision request** (deterministic Mark; no live LLM rewrite).

## Routes

- `/` → redirect to `/campaigns`.
- `/campaigns` — library. `getCampaignWorkspaceList()`. Gallery of campaign
  cards (thumbnail, asset-type chips, status pill, counts), metric strip, status
  filter, empty/unavailable states.
- `/campaigns/[campaignId]` — workspace. `getCampaignWorkspaceDetail(id)`. Wide
  content column with sub-tabs + persistent Mark rail. Handles `not_found` /
  `unavailable`.

## Sub-tabs (client state, default Creative)

1. **Creative** — assets grouped Physical / Virtual / Ads / Media (read-model
   already classifies). `AssetPreview` renders by type: copy → formatted body;
   image → `<Image>`; video/embed → player; file/link → link card. Each asset
   card has an "Ask Mark to revise" affordance that targets it in the rail.
2. **Overview** — objective, audience & offer, persona, restoration focus,
   status, counts.
3. **Audience & Leads** — leads/companies/contacts used (`sources`), persona
   snapshot, evidence URLs.
4. **Reasoning** — why Mark built it, recommended action, **tools used**,
   prompt inputs, guardrail flags.
5. **Approvals** — approval items, risk, status, decision history; link to
   `/approvals`.

## Mark rail (persistent, right column, client)

Shows current campaign context (leads, tools, persona, "why built"). Per-asset
revision form: target asset (set by clicking an asset, or a dropdown) +
instruction textarea + submit. Uses `useActionState` for inline result.

## "Prompt Mark" write sequence

Server action `requestRevisionAction` in `src/app/campaigns/actions.ts`
(`"use server"`), gated by `requireOperator()` + `isSupabaseAdminConfigured()`,
delegating to `requestAssetRevision()` in `src/lib/campaigns/revisions.ts`:

1. Validate instruction via `validateRevisionInstruction` (domain): trimmed,
   3..2000 chars.
2. Find the asset's `approval_item` (by `campaign_asset_id`). If present:
   - insert `approval_decisions` (`decision='revision_requested'`,
     `decided_by`, `decision_notes=instruction`, prev→`next_status='revision_requested'`)
   - update `approval_items` → `status='revision_requested'`, `decision_notes`,
     `reviewed_by/at`.
3. Update `campaign_assets` → `status='revision_requested'`. **Do not touch
   `dispatch_locked` (stays true).**
4. Insert `campaign_events` → `event_type='approval_decided'`, actor,
   `detail="Revision requested: …"`, payload.
5. Look up `agents` by `key='hermes'`. If found, insert `agent_tasks`
   (`status='queued'`, `priority='high'`, `task_type='campaign_asset_revision'`,
   `source_type='campaign_asset'`, `source_id=assetId`, `campaign_id`,
   `approval_item_id`) + `agent_task_inputs` row carrying the instruction.
6. `revalidatePath('/campaigns/[id]')` + `'/campaigns'`. Action returns
   `{ ok, message }`.

No migration needed — all enums (`revision_requested`, `approval_decided`,
`campaign_asset_revision` is free-text `task_type`) already exist.

## Read-model extension (`src/lib/campaigns/read-model.ts`)

- Add `toolSource: string | null` to `CampaignWorkspaceAsset`.
- Add `reasoning: CampaignWorkspaceReasoning` to the live detail:
  `{ whyBuilt, recommendedAction, guardrailFlags[], toolsUsed[], promptInputs[] }`,
  built by a pure `buildReasoning(campaign, assets)` helper (unit-tested).

## Components (`src/app/campaigns/_components/`)

`campaign-gallery.tsx`, `campaign-workspace.tsx` (client; owns `activeTab` +
`targetAssetId`), `creative-tab.tsx`, `overview-tab.tsx`,
`audience-leads-tab.tsx`, `reasoning-tab.tsx`, `approvals-tab.tsx`,
`asset-preview.tsx`, `mark-rail.tsx` (client; form → action). Reuse
`WorkspaceHeader/WorkspacePanel/MetricStrip/DetailStack` +
`StatusPill/buttonClasses/EmptyState`. Follow `DESIGN.md`.

## Nav

Add single `{ label: "Campaigns", href: "/campaigns", ... }` to
`console-frame.tsx` `navItems`.

## Testing

- `validateRevisionInstruction` — domain unit tests.
- `buildReasoning` — pure unit test.
- `requestAssetRevision` — write sequence against a mocked Supabase client
  (mirror `orchestrator`/`agent-operations/read-model` test style).

## Out of scope (YAGNI)

Live LLM rewriting, inline copy editing, sending/launching, campaign creation
from UI, analytics/results tab.
