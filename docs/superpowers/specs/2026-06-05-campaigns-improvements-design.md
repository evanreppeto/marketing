# Campaigns improvements + Outbox — Design

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan
**Branch:** `campaigns-workspace`

## Summary

Five requested changes to the campaigns experience, grouped into three tiers by
scope and dependency:

- **Tier A** — three UI/read-model improvements on data already stored (no schema
  changes): nav entry, inline triage strip, revision diff.
- **Tier B** — a new backend subsystem: the **Outbox**, a durable dispatch
  record + state machine layered on the existing launch handoff.
- **Tier C (deferred)** — Measurement with real data. Blocked on Tier B: there is
  no post-launch data until the Outbox produces dispatch/delivery events.
  Out of scope for this cycle; a `campaign_results` table already exists as its
  future substrate.

Sequencing: A1 → A2 → A3 (each independently shippable), then B. Each tier is its
own commit; B may be its own PR.

## Context (current state)

- `/campaigns` list (`src/app/campaigns/page.tsx`) is an operator console: command
  header, gallery with segments/sort/card+table views, persona/status/query
  filters, pagination. It is **not** in `navItems` — reachable only by URL.
- `/campaigns/[id]` workspace has 7 tabs (Deliverables, Media, Decision log,
  Audience & sources, Talk to Mark, Measurement, Audit), executive overview,
  launch-state lifecycle, and per-deliverable approve/decline/revise/archive.
- `/approvals` ("Activity") already provides a **cross-campaign** approval queue +
  decision history over `approval_items`. The Tier A queue must not duplicate it.
- `launchCampaign` / `deployAsset` (`src/lib/campaigns/launch.ts`) already verify
  all gating approvals are decided, unlock approved assets (`dispatch_locked →
  false`), mark the campaign live (`launch_locked → false`), and emit a
  `campaign_launched` / `asset_deployed` event "handed off to Mark/Hermes to do
  the actual sends." The module never sends anything itself.
- `campaign_events` (migration `20260528162000_hyper_personalization_layer.sql`)
  uses a `campaign_event_type` enum; new event types require an enum-extension
  migration (the established pattern).
- A `campaign_results` table already exists (channel/period/impressions) — the
  substrate for deferred Measurement.

Product posture (per CLAUDE.md): backend/control plane for the Hermes agent
(surfaced as **Mark**). Build durable APIs, records, queues, approvals, logs,
state transitions first. "Outbound stays locked" is a core principle — the app
does not send, publish, or contact anyone.

## Tier A — `/campaigns` improvements (no schema changes)

### A1. Nav entry

Add a Campaigns entry to `navItems` in `src/app/_data/growth-engine.ts`, placed
after "Activity" (same operator workflow). Use an existing icon key already
handled by `src/app/_components/app-shell.tsx` (verify the available keys during
implementation; do not introduce a new icon asset unless required).

### A2. Inline triage strip on `/campaigns`

A compact section at the top of the list showing campaigns with `lifecycle ===
"In review"` and their pending deliverables, each with inline Approve / Decline.

- **Reuses** the existing per-deliverable decision action in
  `src/app/campaigns/actions.ts` — no new approval logic, no new persistence.
- Reuses `pendingCount` already computed by the list read-model
  (`getCampaignWorkspaceList`).
- Collapses to an "All decided" state when nothing is pending.
- Distinct from `/approvals`: campaign-centric and in-context (operator sees the
  campaign while deciding its pieces); `/approvals` remains the global firehose.

### A3. Revision diff in the Deliverables tab

For a deliverable where `draft_body` differs from `edited_body` /`approved_body`,
render a collapsible "What changed" line-level diff (original → current).

- Pure diff helper in `src/lib/campaigns/` (unit-tested in the existing
  `__tests__` style).
- Small client component rendered from `creative-tab.tsx`.
- Read-only: visualizes data already persisted (`draft_body`, `edited_body`,
  `approved_body` on `campaign_assets`). No editing capability is added.

## Tier B — Outbox (new subsystem)

### Data model

New migration adding `public.campaign_dispatches`:

| column              | type                         | notes                                            |
| ------------------- | ---------------------------- | ------------------------------------------------ |
| `id`                | uuid pk                      | `gen_random_uuid()`                              |
| `campaign_id`       | uuid not null fk → campaigns | `on delete cascade`                              |
| `campaign_asset_id` | uuid fk → campaign_assets    | `on delete set null`                             |
| `channel`           | text                         | derived from the asset                           |
| `status`            | enum `campaign_dispatch_status` | `queued → scheduled → sent → delivered → failed → canceled` |
| `scheduled_for`     | timestamptz null             | when a send is planned                           |
| `dispatched_at`     | timestamptz null             | when marked sent                                 |
| `recipient_summary` | text                         | e.g. "Atlas Restoration + 11 leads"              |
| `audience_count`    | integer (>= 0)               | size of the target audience snapshot             |
| `result_note`       | text null                    | delivery/failure note                            |
| `payload`           | jsonb not null default `{}`  | provenance / handoff details                     |
| `created_at`        | timestamptz not null default now() |                                            |
| `updated_at`        | timestamptz not null default now() |                                            |

- New enum `campaign_dispatch_status` for `status`.
- Extend the existing `campaign_event_type` enum with dispatch event types:
  `dispatch_queued`, `dispatch_sent`, `dispatch_delivered`, `dispatch_failed`
  (same enum-extension migration pattern already used).
- Grant the data-API role the same access pattern as sibling tables.

**Granularity:** one dispatch row per deliverable (`campaign_asset`), **not** per
recipient. Per-recipient tracking is deferred (no real send exists to justify it).

### Persistence — `src/lib/dispatch/`

Follows the wired vault/campaigns shape (gated by `requireOperator()` +
`isSupabaseAdminConfigured()`, degrades gracefully without Supabase):

- `read-model.ts` — `getOutboxList()` (cross-campaign, grouped by status) and
  `getCampaignDispatches(campaignId)`.
- Actions in a new `src/app/outbox/actions.ts`: `markDispatchSent`,
  `markDelivered`, `markFailed`, `cancelDispatch`, `reschedule`. Each is a real
  backend state transition that emits a `campaign_event` and calls
  `revalidatePath`.
- Pure status-grouping / ordering helpers unit-tested in `__tests__`.

### Enqueue on launch

Extend `launchCampaign` / `deployAsset` in `src/lib/campaigns/launch.ts`: after
unlocking approved assets, insert a `campaign_dispatches` row per unlocked
deliverable in `queued` status. This is the only change to existing wired code —
additive, inside the same flow that already unlocks and emits the launch event.

### Page — `/outbox`

New top-level route added to `navItems`: a cross-campaign dispatch console grouped
by status (Queued / Scheduled / Sent / Delivered / Failed). Each row shows
campaign, deliverable, channel, recipient/audience summary, timestamps, and the
state-transition controls (operator-driven). A per-campaign dispatch panel also
surfaces on the campaign detail view.

### Explicitly NOT building (YAGNI)

- Real send integrations (ESP/SMS/ad platforms). "Outbound stays locked."
- Per-recipient dispatch rows.
- An external dispatch API for Mark/Hermes to drive transitions — a clean future
  extension, noted but not built. The state machine is operator-driven for now.

## Testing

- Pure functions (revision diff, dispatch status grouping/ordering, any launch
  helpers touched) unit-tested in the existing `src/**/__tests__/` style.
- Persistence paths guarded behind `isSupabaseAdminConfigured()` so the app
  degrades gracefully without Supabase env vars, matching the rest of the app.
- No change to the lead-ingestion contract or scoring/routing determinism.

## Out of scope (this cycle)

- **Tier C — Measurement with real data.** Deferred until the Outbox produces
  dispatch/delivery events. Will consume `campaign_dispatches` + the existing
  `campaign_results` table and downstream CRM outcomes for attribution. Its own
  spec → plan → implementation cycle later.
