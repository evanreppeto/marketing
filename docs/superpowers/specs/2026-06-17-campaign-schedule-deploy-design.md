# Schedule Campaign Deploys — Design

**Date:** 2026-06-17
**Status:** Approved (pending spec review)
**Area:** `src/app/campaigns/[campaignId]` deploy flow + `src/lib/campaigns` + `src/lib/dispatch` + `src/domain`

## Problem

The Deploy & Share launchpad can only deploy **now**: `deployAsset` (one piece) and
`launchCampaign` (whole campaign) call `enqueueDispatchesForAssets`, which inserts
`campaign_dispatches` rows with `status: "queued"` and no time. There is no way to say
"deploy this on Thursday at 9am."

The substrate for scheduling already exists and is unused at deploy time:
- `campaign_dispatches.scheduled_for` column + the `"scheduled"` `DispatchStatus`
  (`src/lib/dispatch/status.ts`) — **no migration needed**.
- The Outbox can already move a dispatch to `"scheduled"` / cancel it
  (`scheduleDispatchAction`, `cancelDispatchAction` → `transitionDispatch`, which sets
  `scheduled_for`).
- `DispatchView.scheduledFor` is already surfaced.

So this feature wires a **Now / Schedule** choice into the existing deploy path.

## Goals

- Let the operator schedule a deploy for a future time, at both granularities that
  deploy already supports: a **single piece** and the **whole campaign**.
- Record scheduling as real backend state: the dispatch is enqueued `"scheduled"` with
  `scheduled_for`, and the handoff event notes the time.
- Preserve the non-negotiable: **the app never sends.** Scheduling records intent and
  hands off to Arc/Hermes to send at that time; the operator's click is the approval.
- Deploy-now behavior is unchanged.

## Non-Goals

- No scheduler/runner that performs the send at the scheduled time — that's Arc/Hermes
  (out of scope). This records the scheduled intent only.
- No reschedule/cancel UI on the campaign page — reuse the existing **Outbox** controls.
  The launchpad's scheduled state links to `/outbox`.
- No per-campaign timezone setting — the picker uses the browser's local time, stored
  as an ISO/UTC string.
- No schema/migration changes (`scheduled_for` + `"scheduled"` already exist).
- No recurring/repeating schedules.

## Design

### Behavior

Each deploy control on the launchpad gains a **Now / Schedule for later** choice:
- **Now** → identical to today (enqueue `"queued"`).
- **Schedule** → reveals a `datetime-local` input (min = current time). On submit, the
  dispatch(es) are enqueued `"scheduled"` with `scheduled_for`, and the piece shows a
  **"Scheduled for <time>"** state afterward (from `DispatchView.scheduledFor`), linking
  to the Outbox to change or cancel.

### Domain (pure, tested)

New `src/domain/dispatch-scheduling.ts`, re-exported through `@/domain`:
```ts
export class ScheduledForError extends Error {}
/**
 * Validate an operator-supplied schedule time. Returns the normalized ISO string.
 * `now` is injected for testability. Throws ScheduledForError when the value is
 * absent/blank, unparseable, or not in the future.
 */
export function validateScheduledFor(value: unknown, now: Date): string;
```
- Accepts a string (e.g. `datetime-local` value or ISO); parses to a Date; rejects
  `NaN` and any time `<= now` (with a small allowance, e.g. must be strictly after
  `now`). Returns `date.toISOString()`.
- Deploy-now does **not** call this (no value to validate).

### Persistence (`src/lib/dispatch/persistence.ts`)

`enqueueDispatchesForAssets` gains optional `scheduledFor?: string` on its input:
- When `scheduledFor` is present: insert rows with `status: "scheduled"` and
  `scheduled_for: scheduledFor`; the event is `dispatch_scheduled` with detail noting
  the time.
- When absent: unchanged (`status: "queued"`, `dispatch_queued` event).
- Add `scheduled: "dispatch_scheduled"` to the `EVENT_FOR_STATUS` map for consistency.

### Launch flow (`src/lib/campaigns/launch.ts`)

`DeployAssetInput` and `LaunchCampaignInput` gain optional `scheduledFor?: string`,
threaded into the `enqueueDispatchesForAssets` calls. The `asset_deployed` /
`campaign_launched` handoff event detail reads "scheduled for <time>" when present,
otherwise "handed off … for dispatch" as today. Approval/launch-lock gating is
unchanged — scheduling only affects the enqueued dispatch's status/time.

### Actions (`src/app/campaigns/actions.ts`)

`deployAssetAction` and `launchCampaignAction` read an optional `scheduledFor` form
field. When non-blank, validate via `validateScheduledFor(value, new Date())`
(returning the action's error state on `ScheduledForError`), then pass it into
`deployAsset` / `launchCampaign`. When blank/absent → deploy now (unchanged). Success
message reflects scheduling: "Scheduled for <time> — handed to <agent>."

### UI (`src/app/campaigns/_components/campaign-deploy-launchpad.tsx`)

- `DeployPieceButton` and `DeployCampaignButton` get a small **schedule toggle**
  (a client `useState` "mode": `"now" | "schedule"`). In `"schedule"` mode, render a
  `datetime-local` input named `scheduledFor` with `min` set to the current local time;
  the submit button label switches to "Schedule deploy". `"now"` mode submits no
  `scheduledFor` (deploy-now).
- A piece whose dispatch is already `scheduled` shows a "Scheduled for <time>" pill +
  "Manage in Outbox" link (reuses the existing deployed-state pattern in
  `PieceActions`, driven by `DispatchView.scheduledFor` for that asset).

### Data flow

```
launchpad form (mode=schedule, scheduledFor=<local dt>)
  → deployAssetAction / launchCampaignAction
      validateScheduledFor(value, new Date())  // domain, throws → inline error
  → deployAsset / launchCampaign ({ ..., scheduledFor })
  → enqueueDispatchesForAssets ({ ..., scheduledFor })
      insert campaign_dispatches { status: "scheduled", scheduled_for }
      campaign_events { event_type: "dispatch_scheduled" }
  → handoff event ("scheduled for <time>") for Arc/Hermes to send at that time
```

### Error handling

- Past/blank/invalid time → `ScheduledForError` → action returns
  `{ ok: false, message }`, surfaced inline like other deploy errors. Nothing enqueued.
- No Supabase → existing "Supabase isn't configured" path, unchanged.
- Deploy-now path never validates, so it can't regress.

## Testing

- **`dispatch-scheduling.test.ts`** (domain, primary): `validateScheduledFor` — future
  ISO accepted + normalized; past rejected; `now` exactly rejected; blank/undefined/
  non-string rejected; garbage string rejected. (Inject a fixed `now`.)
- **`persistence` test**: `enqueueDispatchesForAssets` with `scheduledFor` inserts
  `status: "scheduled"` + `scheduled_for` and a `dispatch_scheduled` event; without it,
  inserts `"queued"` (existing behavior preserved). (Mirror the existing dispatch
  persistence test's client stub.)
- `pnpm build` (types), `pnpm lint` (changed files), `pnpm test` (full).
- Manual: schedule a piece for +1h → Outbox shows it `Scheduled` with the time;
  launchpad shows "Scheduled for <time>"; deploy-now still enqueues `Queued`; past time
  shows inline error.

## Files

**New**
- `src/domain/dispatch-scheduling.ts` + `src/domain/__tests__/dispatch-scheduling.test.ts`

**Edited**
- `src/domain/index.ts` — re-export the new validator/error
- `src/lib/dispatch/persistence.ts` — optional `scheduledFor` in `enqueueDispatchesForAssets`
- `src/lib/dispatch/persistence.test.ts` — scheduled vs queued coverage
- `src/lib/campaigns/launch.ts` — thread `scheduledFor` through `deployAsset`/`launchCampaign`
- `src/app/campaigns/actions.ts` — read + validate `scheduledFor` in the two deploy actions
- `src/app/campaigns/_components/campaign-deploy-launchpad.tsx` — Now/Schedule toggle + scheduled state

**Reused unchanged**
- `transitionDispatch` / `scheduleDispatchAction` / `cancelDispatchAction` (Outbox edit/cancel),
  `DispatchView.scheduledFor`, the `"scheduled"` status + `scheduled_for` column.

## Non-Negotiable Compliance

Scheduling records intent and hands off; the app performs no send at any time. The
operator's deploy/schedule click is the human approval. No automatic outbound behavior
is introduced. Reschedule/cancel remains operator-driven via the Outbox.
