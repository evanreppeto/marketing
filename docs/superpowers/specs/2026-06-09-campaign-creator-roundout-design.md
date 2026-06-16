# Round Out the Campaign Creator — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design); pending implementation plan
**Topic:** Editing, photo management, one-step deploy, and Arc hand-off for operator-authored campaigns

## Problem

Operator-authored campaigns (the prior feature) are **create-only**. After creation
the operator can't edit the campaign, add or remove photos, deploy in one step, or
hand it to Arc with a click. This iteration rounds out that authoring lifecycle.

## Goal

On top of the existing create flow, add four capabilities, reusing the wired
campaigns/Launch/Arc machinery:

1. **Create & deploy in one step** — create *and* Launch to the Outbox in one click.
2. **Add/remove photos later** — manage a draft campaign's photos after creation.
3. **Edit campaign fields** — change title/audience/objective/offer after creation.
4. **Send to Arc** — a one-click hand-off button.

## Decisions (confirmed)

| Decision | Choice | Rationale |
|---|---|---|
| Authoring scope | Edit / add / remove apply to **operator-authored** campaigns (`source_system='operator'`) while still a **draft** (not launched). Locked once launched. | Safe and clear; once live, outbound is committed. Arc's campaigns keep their own approve/revise flow. |
| Send to Arc scope | Available any time, on the detail page | It's just a directive message; no mutation risk. |
| Remove semantics | **Delete** the photo's `campaign_assets` row (its `approval_items` cascade via FK) + best-effort delete the Storage object; only when the asset isn't deployed (`dispatch_locked = true`). | A photo added by mistake should disappear cleanly. |
| Create & deploy precondition | Requires **≥1 photo** (deploy needs a deliverable to unlock); zero photos → clear error. | `launchCampaign` throws without an approved deliverable. |
| Editable fields | `name`, `audience_summary`, `objective`, `offer_summary` only | Persona/restoration_focus are structural; editing them post-create is low-value and riskier. (`channel` lives on assets, not the campaign.) |

## Architecture

Layering unchanged: `domain/` (pure validation) → `lib/campaigns/` (persistence) →
`app/campaigns/` (server components + actions). New code reuses the existing
`createOperatorCampaign` photo logic, the existing `launchCampaign`, and the existing
`sendArcDirective`.

## Components

### 1. Persistence — `src/lib/campaigns/create.ts` refactor + new `src/lib/campaigns/manage.ts`

- **Refactor (DRY):** extract the per-photo block in `createOperatorCampaign`
  (upload → `campaign_assets` + `approval_items` + `approval_decisions`) into a
  shared exported helper `insertPhotoAsset({ client, campaignId, operator, photo, index, channel, uploader, now })` used by both create and add-photos.
  - The stored media entry becomes `{ url, path }` (currently only `url`) so removal
    can delete the Storage object by `path`. `path` = the upload path
    `operator-campaigns/<campaignId>/<index>-<filename>`.
- **`manage.ts`:**
  - `addCampaignPhotos({ campaignId, operator, photos, client?, uploader? })` —
    asserts the campaign is operator-authored and a draft; appends photos via
    `insertPhotoAsset` (indices continue past existing assets); records a
    `campaign_events` `'asset_generated'` (existing enum value) entry. Returns the new asset ids.
  - `removeCampaignAsset({ campaignId, assetId, operator, client? })` — asserts
    operator-authored draft and the asset is not deployed (`dispatch_locked = true`);
    reads the asset's stored `path` from `audit_payload.media_assets`; best-effort
    `storage.from('campaign-media').remove([path])` (a Storage failure does not block
    the DB delete); deletes the `campaign_assets` row (its `approval_items` cascade);
    records a `campaign_events` `'archived'` entry.
  - `updateOperatorCampaign({ campaignId, operator, fields, client? })` — asserts
    operator-authored draft; updates the 4 editable columns; records a
    `campaign_events` `'created'`-class edit entry (use `'planned'` event type, an
    existing enum value, for the edit audit line). Returns the campaign id.
- **Guards** are a shared `assertOperatorDraft(client, campaignId)` helper that loads
  the campaign and throws a clear error unless `source_system='operator'` and
  `launch_locked = true` (still a draft).

### 2. Domain — `src/domain/campaign-drafts.ts`

- Add `parseCampaignEdit(payload)` → `ParsedCampaignEdit` ({ name, audienceSummary?,
  objective?, offerSummary? }). `name` required non-empty; the rest trimmed→optional.
  Reuses the existing internal `optionalTrimmed`/`asObject` helpers. Throws
  `CampaignDraftValidationError`.

### 3. Actions — `src/app/campaigns/actions.ts`

- **Extend `createCampaignAction`:** read `intent = formData.get("intent")` (`"draft"`
  | `"deploy"`). After `createOperatorCampaign`, if `intent === "deploy"`: require
  `photos.length > 0` (else return an error, before persisting — validate up front),
  then call `launchCampaign({ campaignId, operator })`; redirect either way.
- **New actions** (all `requireOperator()` + `isSupabaseAdminConfigured()` gated,
  `useActionState`-shaped `{ ok, message } | null`, `revalidatePath`):
  - `updateCampaignAction` — campaignId + fields → `parseCampaignEdit` →
    `updateOperatorCampaign`; redirect to the detail page.
  - `addCampaignPhotosAction` — campaignId + photos (reuse the existing `readPhotos`
    helper) → `addCampaignPhotos`.
  - `removeCampaignAssetAction` — campaignId + assetId → `removeCampaignAsset`.
  - `sendCampaignToMarkAction` — campaignId → `sendArcDirective` with a standard
    hand-off directive ("Operator handed off this campaign — please review the photos
    and draft/refine the creative."); returns the queued confirmation.

### 4. UI

- **Create form (`campaign-create-form.tsx`):** two submit buttons — "Create draft"
  (`intent=draft`) and "Create & deploy" (`intent=deploy`) — via `formAction` or a
  hidden `intent` field set on click. A note that deploy needs at least one photo.
- **Edit page — `src/app/campaigns/[campaignId]/edit/page.tsx`:** operator-gated;
  loads the campaign, renders a prefilled edit form (reuse a shared form component in
  "edit" mode — text fields only, wired to `updateCampaignAction`). 404/redirect if
  the campaign isn't an operator-authored draft.
- **Detail page operator panel** — a new client/server section rendered **only** when
  the campaign is `source_system='operator'` and still a draft:
  - **Edit** link → the edit page.
  - **Add photos** — a small upload form bound to `addCampaignPhotosAction`.
  - **Remove** — a per-photo `×` control (bound to `removeCampaignAssetAction`) on the
    operator photos.
  - **Send to Arc** button (bound to `sendCampaignToMarkAction`), shown regardless of
    draft state.
  - The read-model that feeds the detail page must expose `sourceSystem` and the
    per-photo `assetId`/`path` so the panel can gate itself and target removals.

### 5. Error Handling

- Authoring actions on a non-operator or non-draft campaign return a clear,
  operator-facing message (the guard throws; the action catches → `{ ok:false }`).
- `removeCampaignAsset`: a Storage delete failure is swallowed (logged), the DB row is
  still removed — the URL/asset is what users see.
- `createCampaignAction` deploy path validates "≥1 photo" before persisting, so a
  zero-photo deploy never creates an orphan draft.
- All gates degrade gracefully when Supabase isn't configured.

## Testing

- **Domain:** `parseCampaignEdit` — required name, optional-field normalization.
- **Persistence (`manage.test.ts`, mock client + fake uploader):**
  - `addCampaignPhotos` — asset+approval+decision per photo; index continues past
    existing assets; guard rejects non-operator/non-draft.
  - `removeCampaignAsset` — deletes the asset; guard rejects a deployed asset; Storage
    failure doesn't block the DB delete.
  - `updateOperatorCampaign` — updates the 4 fields; guard rejects non-operator/draft.
  - `insertPhotoAsset` shared helper exercised through the above.
- **Action:** create-with-`intent=deploy` calls `launchCampaign` (and errors with zero
  photos) — light test or covered via persistence + manual.
- **UI:** `pnpm build` + `pnpm lint`; manual walkthrough.

## Non-Goals (this iteration)

- Editing persona / restoration_focus.
- Reordering photos or per-photo headline/body copy.
- Authoring on Arc-authored campaigns or post-launch campaigns.
- Defining Arc's behavior on hand-off beyond posting the directive.
- Paste-image-URL input (still upload-only).
