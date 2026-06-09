# Operator-Authored Campaigns — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design); pending implementation plan
**Topic:** Manual, operator-initiated campaign creation (title, photos, audience, etc.), deployable by the operator and optionally handed to Mark

## Problem

Today every campaign is created by Mark/Hermes (the orchestrator) or by seeds —
there is **no operator-facing way to author a campaign by hand**. The operator
wants to create a campaign themselves (a title, reference photos, who it's for, an
audience, an objective/offer), own it end-to-end (including deploy), and *optionally*
point Mark at it. Mark should be able to see operator-authored campaigns regardless.

## Goal

Add an operator create flow that reuses the existing campaigns machinery:
**create a draft → (optionally) add photos → deploy it yourself via the existing
Launch/Outbox path → optionally notify Mark.** No new dispatch or approval
subsystem; reuse what is already wired.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data model | **Reuse `campaigns` + `campaign_assets`** tagged `source_system='operator'` | Schema already fits (name, persona, audience_summary, objective, offer_summary, draft status). Operator campaigns flow into the existing list/detail/media-board/economics/Outbox surfaces for free. |
| Photo input | **Upload from device** → `campaign-media` Storage bucket | Matches "photos we want to use"; reuses the exact injectable-uploader pattern Mark's social ads use. |
| Photo asset model | **`campaign_assets` rows, `asset_type='social_ad'`, URL in `audit_payload.media_assets[]`** | Identical shape to Mark's assets, so the existing media board renders them with no new code. |
| Deploy | **Reuse the existing Launch action → Outbox**; operator assets created **already `approved`** + an `approval_decision` recorded | The operator is the approving authority for their own campaign, so deploy needs no separate approval dance. Audit trail preserved. The app stages dispatches; it never sends. |
| Mark handoff | **Opt-in "Send to Mark" button** → existing `notify.ts` webhook push | Pointing to Mark is optional. Mark already sees these campaigns (same tables) without any handoff. |

## Architecture

Layering follows the project convention: `domain/` (pure validation) →
`lib/campaigns/` (persistence/I/O) → `app/campaigns/` (server-component views +
actions). New code is intentionally small; everything downstream of a created
campaign reuses wired surfaces.

## Data Flow

1. Operator opens `/campaigns/new` (a "New campaign" button on the `/campaigns` list).
2. Operator fills the form (title, persona, restoration_focus, audience, objective,
   offer, channel) and uploads photos.
3. `createCampaignAction` (operator-gated) validates via `parseCampaignDraft`
   (pure), then persists: a `campaigns` row + one `campaign_assets` row per photo,
   uploading each photo to `campaign-media`.
4. Operator lands on the campaign detail page, sees the photos in the media board.
5. Operator clicks the existing **Launch** action → dispatches are staged into the
   **Outbox** (app hands off; never sends).
6. Optionally, operator clicks **Send to Mark** → `notify.ts` webhook push with the
   campaign link. Mark can also see the campaign passively at any time.

## Components

### 1. Domain — `src/domain/campaign-drafts.ts` (pure, unit-tested; no I/O)

- `parseCampaignDraft(payload)` → validates + normalizes the operator create
  payload into a typed `ParsedCampaignDraft`. Throws `CampaignDraftValidationError`
  on bad input. Rules:
  - `name` (title): required, trimmed, non-empty.
  - `persona`: required; must be one of the 12 official personas
    (`OFFICIAL_PERSONA_MAPPINGS`); `unassigned_persona` rejected.
  - `restorationFocus`: required; one of the `restoration_focus` enum values
    (flood, water_backup, burst_pipe, storm_surge, standing_water, mold, sewage,
    fire — full set mirrored from the migration).
  - `audienceSummary`, `objective`, `offerSummary`, `channel`: optional trimmed
    strings.
  - `leadId` / `companyId`: optional UUIDs (validated when present).
  - `photoCount`: number of photos (0+ allowed; photos themselves are handled by
    the action, not the pure parser).
- Re-exported through `src/domain/index.ts`.

### 2. Persistence — `src/lib/campaigns/create.ts`

- `createOperatorCampaign({ draft, photos, client, uploader })`:
  - Inserts a `campaigns` row: the parsed fields plus `status='draft'`,
    `source_system='operator'`, `launch_locked=true`, `owner=<operator email>`.
  - For each photo: upload bytes to the `campaign-media` bucket via an **injectable
    `ImageUploader`** (default: real Supabase Storage; tests inject a fake), then
    insert a `campaign_assets` row: `asset_type='social_ad'`, `channel`, `title`,
    `status='approved'`, `source_system='operator'`,
    `audit_payload={ media_assets: [{ url }], outbound_locked: true }`.
  - Record an `approval_decision` (operator-authored = approved) and a
    `campaign_events` 'created' entry for the audit trail.
  - Returns `{ campaignId, assetIds }`.
- `ImageUploader` type mirrors the one in `social-ad-orchestrator.ts`
  (`(path, bytes, contentType) => Promise<string>`).

### 3. Action — `createCampaignAction` in `src/app/campaigns/actions.ts`

- `"use server"`, gated by `requireOperator()` + `isSupabaseAdminConfigured()`.
- Reads the multipart form (fields + photo `File`s), converts photos to bytes,
  calls `parseCampaignDraft` then `createOperatorCampaign`.
- On success: `revalidatePath('/campaigns')` + `redirect` to the new campaign's
  detail page. On validation error: return a typed error the form renders.

### 4. UI

- **`src/app/campaigns/new/page.tsx`** — operator-gated server component hosting the
  create form. Follows `DESIGN.md` (Command Charcoal / Canvas White / Restoration
  Red; no emojis; labels above inputs).
- **`src/app/campaigns/_components/campaign-create-form.tsx`** — client component:
  text inputs, persona/restoration_focus/channel selects, a multi-file photo
  picker with previews, submit + inline validation feedback.
- **"New campaign" button** on the `/campaigns` list page linking to `/campaigns/new`.
- **"Send to Mark" button** on the campaign detail page (opt-in) wired to a
  `notifyMarkAction` that calls `notify.ts`. (If a Mark-notify affordance already
  exists on the detail page, reuse it instead of adding a duplicate.)

### 5. Storage

- Photos go to the existing `campaign-media` bucket. The plan must verify the bucket
  exists (Mark's social ads already use it) and, if a migration is the right place to
  ensure it, create it idempotently; otherwise document the manual bucket setup.

## Error Handling

- Validation failures (`parseCampaignDraft`) return a `400`-style typed error to the
  form; the campaign is not created.
- A photo upload failure aborts the create and surfaces the error (no partial
  campaign with missing assets) — or, if any photo succeeds, the failure is reported
  and the operator can retry; the plan picks one and makes it explicit (default:
  upload all photos first, then insert rows, so a failed upload aborts cleanly before
  any DB write).
- Without Supabase configured, the action degrades like the rest of the app
  (no write; clear message).

## Testing

- **Domain unit tests** (`src/domain/__tests__/campaign-drafts.test.ts`): required
  fields, persona validation (official vs unassigned), restoration_focus validation,
  optional-field normalization, UUID validation for lead/company.
- **Persistence tests** (`src/lib/campaigns/create.test.ts`): via
  `createSupabaseQueryMock` + an injected fake uploader — asserts the `campaigns`
  insert shape (`source_system='operator'`, `status='draft'`), one asset insert per
  photo with the media-asset URL in `audit_payload.media_assets`, asset
  `status='approved'`, and the recorded `approval_decision` / `campaign_events`.

## Non-Goals (this iteration)

- New dispatch/approval machinery — deploy reuses the existing Launch → Outbox flow.
- A dedicated "reference photo" asset type — photos are modeled as `social_ad`
  assets (matches Mark's pattern).
- Editing an existing campaign's core fields via this form (create-only for now;
  the existing detail page handles post-create management).
- Paste-image-URL input (upload-from-device only this round).
- Defining new Mark behavior on handoff — "Send to Mark" is a notification; what Mark
  does is conversation-driven and out of scope here.
