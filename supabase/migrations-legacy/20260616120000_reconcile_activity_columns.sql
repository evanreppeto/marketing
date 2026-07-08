-- Reconcile prod schema drift surfaced by the unified activity feed.
--
-- The activity read-model (src/lib/activity/read-model.ts) selects
-- agent_run_logs.created_at and campaign_events.approval_item_id. Both columns
-- are defined inline at table creation in earlier migrations:
--   - agent_run_logs.created_at      -> 20260528193000_agent_operations_scaffold.sql
--   - campaign_events.approval_item_id -> 20260528162000_hyper_personalization_layer.sql
-- but at least one deployed database was built from an older revision of those
-- files and is missing the columns, which made every activity query 400 and
-- collapsed the whole page to its "unavailable" empty state.
--
-- These statements are additive and idempotent: they bring drifted databases
-- back in line and are a no-op on databases that already have the columns.

alter table public.agent_run_logs
  add column if not exists created_at timestamptz not null default now();

alter table public.campaign_events
  add column if not exists approval_item_id uuid
    references public.approval_items(id) on delete set null;
