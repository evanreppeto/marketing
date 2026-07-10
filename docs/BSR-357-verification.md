# BSR-357 — Opportunity → Campaign conversion: verification record

Ticket: [BSR-357](https://linear.app/big-shoulders-restoration/issue/BSR-357).
Verifies the conversion shipped on this branch (`createCampaignFromOpportunity`,
the `campaign-from-opportunity` domain seed, `getOpportunityForCampaign`,
`markOpportunityDrafted`, the `draftCampaignFromOpportunity` action + confirm modal).

## Context correction (the ticket text was stale)

- **The migration blocker the ticket worried about is already resolved.** PR #351
  squashed the old 74-migration chain into a single canonical
  `supabase/migrations/00000000000000_baseline.sql` + a few incrementals. Scope
  item #1 ("if the 70+ migration chain fails to apply … fix the ordering") no
  longer applies.
- The conversion code was **uncommitted WIP** when verification started; it is now
  committed on `claude/opportunity-campaign-draft-5caaba`.

## What was verified, and how

Docker was unavailable in the authoring environment, so instead of `pnpm sandbox`
the persist path was exercised against the **real `marketing-staging` Postgres**
(`zheuujpxsxmisnrlsriv`) inside a single `BEGIN … ROLLBACK` transaction — real FK,
enum, NOT NULL, and CHECK constraints enforced, **nothing persisted** (staging row
counts confirmed unchanged before/after). The transaction mirrors the exact writes
`createCampaignFromOpportunity` + `markOpportunityDrafted` perform, then switches
identity to a real org-A member (`set local role authenticated` + JWT claims) so
RLS policies are enforced on the read-back.

### Results (all green)

| Acceptance criterion | Evidence |
|---|---|
| #1 migrations apply to a fresh DB | staging's applied history = `00000000000000_baseline` + incrementals, cleanly applied |
| #2 exact `campaigns` row | `status=draft`, `launch_locked=true`, `source_system=arc_opportunity`, `persona`, `restoration_focus`, `objective` (= recommended action), `audience_summary`, `lead_id` set, `campaign_phase=phase_1`; `source_signal` = `{authored_by:arc, origin:opportunity, opportunity_id, subject_type:lead, subject_id, confidence, urgency, recommended_action, recommended_campaign_type, evidence, outbound_locked:true}` |
| #3 side effects | `campaign_events` row `event_type=created`; source `opportunities` row → `status=drafted`, `campaign_id` set |
| #5 RLS (DB layer) | as an org-A member: own campaign visible (1), other org's campaign visible (0), source opportunity visible (1) → cross-tenant read denial enforced by `campaigns_org_member_select` / `opportunities_org_member_select` (`app_private.is_org_member(org_id)`) |
| #6 tests + lint | `campaign-from-opportunity`, `create-from-opportunity`, `persistence`, `read-model` → 16/16; eslint clean on the changed files |

### Still requires a running app (not provable via SQL)

- **#4** operator lands on `/campaigns/<id>` and the page renders.
- **#5 (app layer)** the `draftCampaignFromOpportunity` server action refuses a
  cross-org convert, and a cross-org campaign read returns 404.

Run these with `pnpm sandbox` on a machine with Docker (seeded BSR operator →
Opportunities → Create campaign → confirm modal → submit → assert route + a second
seeded org cannot convert/read).

## Reproduce the DB-layer proof

The rollback harness lives at
[`scripts/verify/bsr-357-opportunity-campaign.sql`](../scripts/verify/bsr-357-opportunity-campaign.sql).
Point it at any DB that has the baseline applied and at least one org with an
active member + a company (fill in the three IDs at the top). It seeds, mirrors the
conversion, asserts, and rolls back — safe to run against a shared staging DB.

## Related finding (filed separately)

`marketing-staging`'s migration history has **drifted** from the repo's
`supabase/migrations/` folder: the incrementals are renumbered
(`20260708201051…` vs local `20260708120000…`) and `app_settings_per_workspace`
is missing from staging. A fresh `supabase db push` would collide. Not a blocker
for this ticket; needs its own reconciliation.
