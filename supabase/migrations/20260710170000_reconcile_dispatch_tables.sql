-- Reconcile the two dispatch tables into one (BSR-370).
-- Decision + rationale: docs/dispatch-reconciliation.md.
--
-- campaign_dispatches (the wired lifecycle table: launch -> Outbox ->
-- transitionDispatch) becomes the single source of truth. The send-oriented
-- fields from the orphan outbound_dispatches (which had NO producer) are folded
-- in, and outbound_dispatches is retired. Empty in every environment, so no data
-- migration is needed.
--
-- Verified 2026-07-10: applied cleanly to the marketing-staging DB (real Postgres
-- 17), and an integration test confirmed the producer path (launch -> queued
-- rows) + the idempotency / send-once constraints against real seeded data.

-- 1. Fold the per-recipient / send fields onto campaign_dispatches.
alter table public.campaign_dispatches
  add column if not exists approval_item_id uuid,
  add column if not exists contact_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists last_error text;

alter table public.campaign_dispatches
  add constraint campaign_dispatches_approval_item_id_fkey
    foreign key (approval_item_id) references public.approval_items (id) on delete set null;

alter table public.campaign_dispatches
  add constraint campaign_dispatches_contact_id_fkey
    foreign key (contact_id) references public.contacts (id) on delete set null;

-- Idempotent producer: at most one dispatch per idempotency key.
create unique index if not exists campaign_dispatches_idempotency_key_idx
  on public.campaign_dispatches (idempotency_key)
  where idempotency_key is not null;

-- "Send once": at most one LIVE dispatch per (approval item x recipient x channel).
-- Mirrors outbound_dispatches_approval_once_idx. NULL contact_id (deliverable-level
-- rows with no recipient) are never in conflict, which is intended.
create unique index if not exists campaign_dispatches_approval_once_idx
  on public.campaign_dispatches (approval_item_id, contact_id, channel)
  where (
    approval_item_id is not null
    and status in ('queued', 'scheduled', 'sent', 'delivered')
  );

create index if not exists campaign_dispatches_contact_id_idx
  on public.campaign_dispatches (contact_id);

-- 2. Retire the orphan. De-reference its one inbound FK first (weather targets
--    were never produced against a real dispatch, so the column is left dangling
--    and harmless).
alter table public.weather_event_targets
  drop constraint if exists weather_event_targets_outbound_dispatch_id_fkey;

drop table if exists public.outbound_dispatches;

-- Note: the `dispatch_status` enum is intentionally left in place (harmless once
-- unused); dropping enums is fiddly and out of scope for this reconciliation.
