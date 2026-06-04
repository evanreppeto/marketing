# Campaign workflow redesign: approve the pieces → launch the campaign

**Date:** 2026-06-04
**Status:** Approved (model + deploy semantics), implementing first slice.

## Problem

The campaign approval workflow is confusing. Investigation found three root causes:

1. **Two parallel approval tracks.** `approval_items` can attach to a whole campaign
   (`campaign_id`) *or* a single deliverable (`campaign_asset_id`). Operators end up
   approving overlapping things.
2. **Synthesized duplicate deliverables.** `buildWorkspaceAssets` in the read-model
   creates "deliverables" from real `campaign_assets` **and** from approval items
   **and** from `agent_outputs`. The same email therefore appears as multiple
   competing cards — the "email deliverable not working correctly" symptom.
3. **No deployment.** The only actions are approve / decline / archive /
   request-revision; everything is permanently "outbound locked." There is no
   launch/deploy path, so "how do we deploy?" has no answer in code.

## Mental model (agreed)

> **A campaign is the goal + timeframe. Deliverables are the pieces Mark builds for
> it. You approve the pieces. You launch the campaign.** Approval ≠ deployment.

- **Approval** happens per-deliverable — one gate per piece (email, ad, SMS, media,
  landing page). No separate campaign-level approval item.
- **Campaign status is derived**, not hand-set:
  `Drafting → In review → Ready → Live → Complete`.
  - Ready = all required (gating) deliverables approved.
  - Live = operator launched.
- **Launch** is the single deploy action, enabled only when Ready.

### Deliverable lifecycle
`Draft → Needs approval → Approved` (or `Rework requested` → back to Mark).

## Deploy semantics (chosen)

Launch is a **real backend state transition + handoff**, not in-app sending:

- Set campaign `launch_locked = false`, `status = 'live'`.
- Unlock every approved deliverable (`dispatch_locked = false`).
- Record a `campaign_event` (`campaign_launched`) as the handoff signal Mark/Hermes
  consumes to perform the actual sends/publishes.
- No email/SMS/ad provider integration in this pass (wire later). Optionally support
  launching a single approved deliverable early.

## Implementation slice

### Backend
- `src/lib/campaigns/launch.ts` — `launchCampaign({campaignId, operator})`: operator
  gate + Supabase config guard; flips campaign + approved-asset locks; inserts the
  `campaign_launched` event. Pure-ish persistence module mirroring `decisions.ts`.
- `src/app/campaigns/actions.ts` — `launchCampaignAction` (`useActionState` shape);
  fix the misleading "Campaign approved" copy → "Deliverable approved."
- `read-model.ts`:
  - **Deliverables = `campaign_assets` only.** Stop synthesizing deliverables from
    outputs/approvals (fixes the duplicate email). Outputs/approvals remain as
    reasoning/record inputs, not as cards.
  - Add `launchState` to `LiveCampaignWorkspace`:
    `{ requiredCount, approvedCount, pendingCount, ready, live }`, derived from the
    gating approvals on assets + campaign `launch_locked`.
  - Derive a campaign lifecycle label (Drafting/In review/Ready/Live/Complete).

### Frontend
- **Launch tracker bar** (replaces the overview DecisionStepper): goal + timeframe +
  "X of Y approved · N need you" + **Launch campaign** (disabled until ready; shows
  "Live" state after). Pending pieces link into the deliverables list.
- **One approve location.** Deliverables tab stays the place you read + approve. The
  Approvals tab becomes a read-only **Decision log** (status records, no buttons), so
  approving isn't duplicated across two tabs.
- Header reflects the derived lifecycle status.

## Out of scope (this pass)
- Real provider sending/integration.
- Scheduling launch for future flight dates (button can exist, deferred behavior).
- DB migration — the slice reuses existing columns (`launch_locked`,
  `dispatch_locked`, `status`, asset-level `approval_items`).
