# Dispatch reconciliation (BSR-370)

**Status:** in progress · **Decision date:** 2026-07-10 · **Ticket:** BSR-370

## Problem

The app had **two unreconciled dispatch tables**:

| Table | Role | Reality |
|---|---|---|
| `campaign_dispatches` | Operator-driven lifecycle — what `launchCampaign` enqueues and the Outbox reads (`getOutboxList`, `transitionDispatch`). | **Wired.** One row per approved deliverable. Carries `channel`/`recipient_summary`/`payload` but no per-recipient send data. |
| `outbound_dispatches` | The unit `executeResendDispatch` actually sends from. | **Orphan.** Has `approval_item_id` + `payload{to,subject,html}` + `idempotency_key` + an approval-gate CHECK, but **no producer** ever inserts into it, and there was **no audience resolution**. |

Result: an approved campaign could be launched (rows land in `campaign_dispatches`), but the real send path (`outbound_dispatches` → `executeResendDispatch`) was fed by nothing. `execute-resend.ts:12` flagged the reconciliation as known debt.

## Decision

**Keep `campaign_dispatches` as the single source of truth; fold in the send-oriented fields from `outbound_dispatches`; retire the orphan.**

Rationale: `campaign_dispatches` is the table that is already wired end-to-end (launch → Outbox → `transitionDispatch` → read-model → UI). Migrating *onto* the orphan would mean re-wiring all of that; migrating the orphan's few extra fields onto the live table is far less churn and preserves the working path.

### Schema changes (added to `campaign_dispatches`)

| Column | Purpose |
|---|---|
| `approval_item_id uuid` (FK `approval_items` ON DELETE SET NULL) | Links a dispatch to the approval that authorized it — the per-send approval gate BSR-369 enforces. |
| `contact_id uuid` (FK `contacts` ON DELETE SET NULL) | The recipient. The reconciled grain is **per-(deliverable × recipient)**, not per-deliverable. |
| `idempotency_key text` (unique when non-null) | Makes the producer idempotent — re-running launch never double-queues the same (approval × contact × channel). |
| `provider text`, `provider_message_id text` | Set by the connector (BSR-369) after a real send. |
| `last_error text` | Failure detail for the Failed lane / retry. |

Carried over from the orphan's safety properties:
- **"Send once" uniqueness** — a partial unique index on `(approval_item_id, contact_id, channel)` for live rows, mirroring `outbound_dispatches_approval_once_idx`.
- The existing `campaign_dispatch_status` enum (`queued/scheduled/sent/delivered/failed/canceled`) is kept — it already models the lifecycle; the connector moves `queued → sent`.

`outbound_dispatches` is dropped (it is empty in every environment — no producer). Its one inbound FK, `weather_event_targets.outbound_dispatch_id`, is de-referenced first.

## Grain change

Before: `enqueueDispatchesForAssets` wrote **one row per approved asset**.
After: the **producer** writes **one row per (approved asset × resolved recipient)**, each with `approval_item_id`, `contact_id`, a built `payload{to,subject,html}`, and an `idempotency_key`, in `queued` — ready for a connector to send. Deliverable-level rows with no recipient (e.g. a printed piece) remain supported (`contact_id` null).

## Producer contract

`launchCampaign` → for each approved, gating deliverable:
1. resolve recipients with `resolveCampaignAudience(campaign, contacts, channel)` (`src/domain/audience-resolution.ts`);
2. build the payload from the approved asset (`renderBrandedEmail` / `buildResendEmailPayload`);
3. upsert one `queued` `campaign_dispatches` row per recipient, keyed by `idempotency_key`.

It **never sends** — that is BSR-369, gated per-send on `approval_item_id`'s approval.

## What stays working (regression surface)

`launch.ts` enqueue, `getOutboxList` / `getCampaignDispatches` read-models, `transitionDispatch`, and the Outbox UI all continue against the reconciled `campaign_dispatches`. `executeResendDispatch` is repointed from `outbound_dispatches` to `campaign_dispatches` (its per-send approval assertion is preserved).
