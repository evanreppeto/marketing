# Campaign approval roll-up — design

**Date:** 2026-06-03
**Status:** Approved for planning
**Surfaces:** `src/app/campaigns/` (list + detail), `src/lib/campaigns/read-model.ts`, `src/domain/`

## Problem

A campaign is a **container of independently-approvable pieces** — one `campaigns` row
bundles many `campaign_assets` (email/outreach, search ad, social ad, landing page, SMS,
video/image prompts, one-pager…), each of which is approved on its own via an
`approval_items` record.

But the UI collapses that whole mix into a single campaign-level status label
(`campaigns.status`), shown both as the `StatusPill` on the list card
(`campaign-gallery.tsx`) and in the detail header (`campaign-header.tsx`), and used as the
list filter chips.

The seed campaign (`scripts/seed-test-campaign.mjs`) demonstrates the mismatch exactly: on
*"Spring Flood Recovery — North Shore Property Managers"* the **email is approved**, the
**landing page and paid search ad are pending**, and the rest are draft/pending — yet the
card and header just say **"Pending approval."** One word stands in for a mixed reality, and
there is no way to express "I approved some pieces but not the whole thing."

**The grouping is not the problem** — assets are already bundled under one campaign row at
the data level. The problem is the **single status label**. This design replaces it with an
action-oriented roll-up plus a per-status breakdown, geared toward the whole campaign while
honoring per-piece approval.

## Goals

- Represent a campaign's overall approval state as an **action-first headline** plus a
  **breakdown** of its pieces, on both the list card and the detail header.
- Keep per-piece approval exactly as it is (the `DecisionStepper` remains the action surface).
- Make the list filter chips reflect the new roll-up states.

## Non-goals (later)

- A launched / live state and actual outbound send.
- Performance-tab changes.
- Any rework of the `DecisionStepper`, metric cells, or approval decision flow itself.

## Model — pieces and effective status

A campaign's **pieces** = its deliverables, one per `campaign_asset`.

The roll-up is **decision-centric**: each piece's **effective status** is the status of its
linked `approval_items` record if one exists; otherwise the piece is **draft** (Arc produced
it but never submitted it for a decision), regardless of the asset's own row status. (Linkage
is `approval_items.campaign_asset_id = campaign_assets.id`, already loaded by the read-model.)
This means an asset whose row reads `pending_approval` but has no approval item does **not**
count as pending — so the headline "N pending" tracks real pending *decisions* (matching the
DecisionStepper), not raw asset rows.

Every effective status buckets into one of four:

| Bucket | Tone | Raw statuses |
|---|---|---|
| **Approved** | green | `approved` |
| **Pending** | amber | `pending_approval`, `pending_owner_approval`, `needs_compliance` |
| **Needs changes** | red | `revision_requested`, `declined`, `rejected`, `blocked` |
| **Draft** | gray | `draft` and anything not yet submitted |

`archived` pieces are excluded from the denominator entirely.

The breakdown covers **all** deliverables (denominator = total non-archived pieces), so
"2 / 8 approved" reflects the whole campaign with drafts shown as their own segment.

## Roll-up headline — pure function

A pure, deterministic function lives in `src/domain/` (re-exported through
`src/domain/index.ts`), unit-tested in `src/domain/__tests__/`, and called by the read-model.
No I/O. This matches the project convention that roll-up logic stays deterministic and
unit-testable in the app layer rather than in Postgres.

```
deriveCampaignRollup(buckets: { approved; pending; changes; draft }) -> {
  state: "needs_review" | "ready" | "in_progress" | "changes_requested" | "drafting" | "empty";
  label: string;        // human headline, e.g. "Needs your review · 3 pending"
  pending: number;
  approved: number;
  total: number;        // non-archived pieces
}
```

Priority ladder (first match wins):

1. `pending > 0` → `needs_review` — **"Needs your review · N pending"**
2. else `total > 0 && approved === total` → `ready` — **"Ready to launch"** (outbound stays locked)
3. else `approved > 0` → `in_progress` — **"In progress · A of M approved"**
4. else `changes > 0` → `changes_requested` — **"Changes requested · N"**
5. else `draft > 0` → `drafting` — **"Drafting"**
6. else → `empty` — **"No deliverables yet"**

### Read-model changes (`src/lib/campaigns/read-model.ts`)

- Compute per-piece effective status + buckets for each campaign (list and detail).
- Add `rollup` (the `deriveCampaignRollup` result) and `breakdown`
  (`{ approved; pending; changes; draft; total }`) to `CampaignWorkspaceListItem` and to
  `CampaignWorkspaceMeta`.
- The existing `status` string stays for now (other surfaces may still read it); the UI stops
  rendering it directly.

## UI changes

### List card — `src/app/campaigns/_components/campaign-gallery.tsx`

Replace the single cover `StatusPill` and the "Awaiting approval" banner with:

- the roll-up headline chip, colored by `rollup.state`;
- a thin 4-segment progress bar (approved / pending / changes / draft);
- an "A / M approved" caption.

Thumbnail/cover behavior is otherwise unchanged.

```
 Spring Flood Recovery
 ▣ Needs review · 3 pending
 ▰▰▰▰▱▱▱▱  2/8 approved
```

### Detail header — `src/app/campaigns/_components/campaign-header.tsx`

Replace the lone `campaign.status` pill with:

- headline state + segmented bar + per-status counts;
- a **"Review next →"** affordance that jumps to the first pending decision, reusing the
  existing `onReviewApproval` / Approvals-tab path from `campaign-workspace.tsx`.

Keep the "Outbound locked" pill. The `DecisionStepper` below is untouched — the header is the
**summary**, the stepper is the **action**.

```
Spring Flood Recovery — North Shore PMs

  NEEDS YOUR REVIEW · 3 pending   [Review →]
  ▰▰▰▰▱▱▱▱  2 approved · 3 pending · 3 draft
```

### List filters — `src/app/campaigns/_components/campaign-gallery.tsx`

Swap the raw-status filter chips for roll-up states, filtering by `rollup.state`:

**All / Needs review / In progress / Ready / Drafting**

(Each chip keeps its count, as today.)

## Testing

- **Domain unit tests** for `deriveCampaignRollup`: every rung of the priority ladder, plus
  bucket edge cases (all-archived → `empty`; ties between buckets resolve by ladder order).
- **Read-model test**: the seed campaign yields the expected per-piece buckets and roll-up
  state (effective status overrides asset status where an approval item exists).

## Files touched

- `src/domain/` — new pure module + `index.ts` re-export.
- `src/domain/__tests__/` — unit tests.
- `src/lib/campaigns/read-model.ts` — compute + expose `rollup` / `breakdown`.
- `src/lib/campaigns/read-model.test.ts` — read-model assertion.
- `src/app/campaigns/_components/campaign-gallery.tsx` — card + filters.
- `src/app/campaigns/_components/campaign-header.tsx` — detail header.
