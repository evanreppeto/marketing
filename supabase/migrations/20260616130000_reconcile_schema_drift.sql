-- Reconcile additive schema drift between prod and the repo migrations.
--
-- Audit on 2026-06-16 (code column-usage vs a live prod column dump) found a
-- set of tables where prod has the SAME design as the repo but is missing
-- columns that were added in later (or edited-in-place) migrations. The
-- deployed code selects/writes these columns, so the affected write/read paths
-- fail in prod. Every statement here is additive and idempotent — a no-op on a
-- database that already has the column.
--
-- This migration intentionally covers ONLY tables where prod is strictly behind
-- the repo (no conflicting redesign). Tables with bidirectional/structural
-- divergence (approval_recommendations, campaign_results, engagement_events,
-- guardrail_rules, next_best_actions, persona_snapshots, vault_notes) are left
-- for a separate, deliberate reconciliation because prod uses a different shape
-- there and the correct direction is a product decision, not a blind ALTER.

-- agent_tasks: retry bookkeeping (original scaffold create, missing in prod).
alter table public.agent_tasks
  add column if not exists retry_count integer not null default 0 check (retry_count >= 0);
alter table public.agent_tasks
  add column if not exists max_retries integer not null default 2 check (max_retries >= 0);

-- agent_run_logs: retry bookkeeping (parity with the scaffold create).
alter table public.agent_run_logs
  add column if not exists retry_count integer not null default 0 check (retry_count >= 0);

-- approval_decisions: persisted edited output captured at decision time.
alter table public.approval_decisions
  add column if not exists edited_output text;

-- campaign_assets: external provider id + per-field edit tracking.
alter table public.campaign_assets
  add column if not exists external_asset_id text;
alter table public.campaign_assets
  add column if not exists edited_fields jsonb not null default '{}'::jsonb;

-- campaigns: relations + phase + approval link the read/write paths assume.
alter table public.campaigns
  add column if not exists property_id uuid references public.properties(id) on delete set null;
alter table public.campaigns
  add column if not exists external_campaign_id text;
alter table public.campaigns
  add column if not exists campaign_phase text not null default 'phase_1'
    check (campaign_phase in ('phase_1', 'phase_2', 'evergreen', 'storm_triggered', 'partner_reactivation'));
alter table public.campaigns
  add column if not exists approval_item_id uuid references public.approval_items(id) on delete set null;
