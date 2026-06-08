# Social Image Ads into the Growth-Engine App — Design

Date: 2026-06-08
Status: Direction approved by Evan (spec pending his review)

## Problem

Mark renders standalone **social-media image ads** (e.g. storm-damage square +
vertical) and submits them to the **classifier** service (`POST /campaigns`,
Supabase project `tesgvrcgcyadownahujh`). But the **growth-engine marketing app**
(`big-shoulders-growth-engine`, Supabase project `fpjvgqrfqncnudqeudee`) reads a
*different* database, so those ads never appear in the app's Campaigns / Approvals
screens. We need Mark's image ads to show up in the app as their own campaigns.

## Decisions (from brainstorming, 2026-06-08)

- **Their own campaigns:** each social image ad becomes its own campaign in the app
  (the app's outreach/CRM campaigns are a separate animal). Campaigns may be created
  with **no** company/contact/lead — confirmed nullable — so no CRM pollution.
- **Image hosting = classifier:** reuse today's classifier storage. The classifier
  exposes a permanent public image URL; the app references it. The app does not need
  its own image storage.
- Same safety model as the rest of the app: everything created **locked + pending
  human approval**; Mark never launches/sends.

## Architecture (three small pieces)

### 1. Classifier: permanent public image URL  (Python repo, `marketing-classifier-agent`)
Add `GET /campaigns/{id}/image` — **public, unauthenticated** — that looks up the
campaign_assets row, streams the stored PNG from the bucket
(`storage.fetch_image_bytes`) with `Content-Type: image/png`. This is a stable URL
(no expiry, unlike the 7-day signed link) the app can embed as `<img src>`. Marketing
creative is meant to be public, so unauthenticated read is acceptable. Also include
`image_url` (this endpoint's absolute URL) in the `/campaigns` submit and publish
responses for convenience. Missing row → 404.

### 2. App: CRM-less "social ad" ingest  (Next.js repo, `C:\Users\evanr\marketing`)
New endpoint **`POST /api/v1/hermes/social-ads`**, bearer `HERMES_AGENT_API_TOKEN`
(same auth + 400/502/503 shape as `/api/v1/hermes/runs`). New contract parser
(`src/lib/hermes/social-ad-contract.ts`, zod) and orchestrator function
(`runHermesSocialAd` in `src/lib/hermes/social-ad-orchestrator.ts`) that, in order:
1. `campaigns` — `name` (req), `persona` (official enum, req), `restoration_focus`
   (enum, req), `status='pending_approval'`, `company_id/contact_id/lead_id = null`,
   `owner=operator`, `objective`, `source_system='hermes_agent_orchestrator'`,
   `external_campaign_id`, `launch_locked=true`, audit/reasoning payloads.
2. `campaign_assets` — `asset_type='social_ad'`, `channel='social'`, `title`,
   `status='pending_owner_approval'`, `dispatch_locked=true`, and the image under
   `audit_payload.media_assets=[{url: imageUrl, type:'ad', title, thumbnail_url}]`
   (the exact key the campaigns read-model scans to render the gallery cover + the
   "Ads" section). Optional caption fields (headline/body/cta) go in `prompt_inputs`
   and `draft_body`.
3. `approval_items` — `campaign_asset_id`, `status='pending_owner_approval'`,
   `approval_required=true`, `locked_until_approved=true`, CRM ids null.
4. Back-link `campaigns.approval_item_id`; write a `campaign_events`
   `approval_submitted` row.
Reuse the existing `insertOne` helper pattern and the official persona /
restoration-focus zod enums already defined in `src/lib/hermes/contracts.ts`.
Returns `201 { ok, status:'needs_approval', result:{ campaignId, campaignAssetId,
approvalItemId } , outboundDispatchAllowed:false }`.

Request body: `{ workflow:'social_ad', name, persona, restorationFocus, objective?,
imageUrl, format?, headline?, body?, ctaLabel?, ctaPhone?, sourceCampaignId?,
operator }`.

### 3. Mark: new skill "Submit social ad to the app"
Mark's flow becomes: render PNG → `POST {CLASSIFIER_URL}/campaigns` (stores image,
returns `id` + `image_url`) → `POST {APP_URL}/api/v1/hermes/social-ads` with the
`image_url` + metadata (auth `HERMES_AGENT_API_TOKEN`). Skill drafted as a file for
Evan to drop into Mark's profile (Mark lives at `/Users/reppeto/.hermes/profiles/mark/`).
The classifier draft/approve/publish lifecycle is no longer used for app-bound social
ads — the classifier row is just image storage; the **app** now owns approval.

## Data flow

`Mark renders → classifier stores image (permanent URL) → Mark POSTs social-ad to app
→ app creates locked campaign + social_ad asset (+image) + approval_item → appears in
/campaigns + /approvals → human approves in app → (existing) human launch downstream.`

## Testing

- **App (vitest):** `social-ad-orchestrator.test.ts` — creates exactly one campaign +
  one campaign_asset (asset_type social_ad, media_assets url present) + one
  approval_item, all locked, NO companies/contacts/leads rows; status pending; bad
  payload → ZodError. `social-ad-contract.test.ts` — enum validation (persona,
  restorationFocus), required fields. Route test mirrors the `/runs` route test
  (auth/config/validation codes). Follow the existing `orchestrator.test.ts` fake-
  client pattern.
- **Classifier (pytest):** `GET /campaigns/{id}/image` returns the stored bytes +
  image/png for an existing row (inject fake fetch), 404 for a missing row; submit/
  publish responses include `image_url`.

## Out of scope (YAGNI)

Auto-posting to social/Meta; the app hosting its own image storage; migrating the two
already-published storm-damage ads (we can re-submit them through the new path as the
first live test); compliance-guardrail re-check on the caption (optional later —
default to pending_owner_approval, still human-gated).

## Risks / notes

- App depends on the classifier being reachable to display images (accepted trade-off).
- `persona` + `restoration_focus` are NOT NULL — Mark must send valid enum values
  (storm-damage ad → `persona_homeowner_emergency` + `storm_surge`).
- Public image endpoint exposes creative by URL — acceptable for marketing assets.
