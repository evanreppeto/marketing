-- Reconcile STRUCTURAL drift between prod and the repo migrations.
--
-- Audit on 2026-06-16 found a cluster of tables where prod was built to a
-- different (newer/polymorphic, multi-tenant) shape than the deployed code
-- expects: prod has columns the repo never defined (entity_type/entity_id,
-- metrics jsonb, collection/pinned, key/label, confidence_score/reason) AND is
-- missing the columns the code selects/writes. The deployed code is broken
-- against all of these (Vault, Persona Intelligence, Performance, Partners,
-- Guardrails, approval recommendations, persona knowledge).
--
-- Direction chosen: additive reconciliation. We ADD the columns the code needs
-- and leave prod's existing columns untouched (non-destructive). To guarantee
-- this can never fail on existing rows, every added column is NULLABLE with no
-- CHECK/NOT NULL, and enum-typed columns are added as plain `text` (the app and
-- PostgREST treat these as strings regardless). The code supplies values on
-- insert; reads tolerate nulls. A later migration can tighten types and backfill
-- prod's old columns into the new ones (see the optional backfill block at the
-- end) once the product direction on these tables is settled.

-- ── vault_notes ───────────────────────────────────────────────────────────────
alter table public.vault_notes add column if not exists folder text;
alter table public.vault_notes add column if not exists tags text[] default '{}'::text[];
alter table public.vault_notes add column if not exists author text default 'Operator';
alter table public.vault_notes add column if not exists status text default 'draft';

-- ── persona_knowledge_entries ─────────────────────────────────────────────────
alter table public.persona_knowledge_entries add column if not exists section_key text;
alter table public.persona_knowledge_entries add column if not exists priority integer default 50;
alter table public.persona_knowledge_entries add column if not exists status text default 'active';
alter table public.persona_knowledge_entries add column if not exists source_reference text;

-- ── approval_recommendations ──────────────────────────────────────────────────
alter table public.approval_recommendations add column if not exists agent text default 'mark';
alter table public.approval_recommendations add column if not exists rationale text;
alter table public.approval_recommendations add column if not exists risk_flags text[] default '{}'::text[];
alter table public.approval_recommendations add column if not exists suggested_edits text;

-- ── next_best_actions ─────────────────────────────────────────────────────────
alter table public.next_best_actions add column if not exists persona_snapshot_id uuid references public.persona_snapshots(id) on delete cascade;
alter table public.next_best_actions add column if not exists approval_item_id uuid references public.approval_items(id) on delete set null;
alter table public.next_best_actions add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
alter table public.next_best_actions add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.next_best_actions add column if not exists contact_id uuid references public.contacts(id) on delete cascade;
alter table public.next_best_actions add column if not exists property_id uuid references public.properties(id) on delete cascade;
alter table public.next_best_actions add column if not exists lead_id uuid references public.leads(id) on delete cascade;
alter table public.next_best_actions add column if not exists approval_required boolean default false;
alter table public.next_best_actions add column if not exists recommendation text;
alter table public.next_best_actions add column if not exists reason text;
alter table public.next_best_actions add column if not exists due_at timestamptz;
alter table public.next_best_actions add column if not exists reasoning_payload jsonb default '{}'::jsonb;
alter table public.next_best_actions add column if not exists audit_payload jsonb default '{}'::jsonb;

-- ── persona_snapshots ─────────────────────────────────────────────────────────
alter table public.persona_snapshots add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.persona_snapshots add column if not exists contact_id uuid references public.contacts(id) on delete cascade;
alter table public.persona_snapshots add column if not exists property_id uuid references public.properties(id) on delete cascade;
alter table public.persona_snapshots add column if not exists lead_id uuid references public.leads(id) on delete cascade;
alter table public.persona_snapshots add column if not exists job_id uuid references public.jobs(id) on delete cascade;
alter table public.persona_snapshots add column if not exists outcome_id uuid references public.outcomes(id) on delete cascade;
alter table public.persona_snapshots add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;
alter table public.persona_snapshots add column if not exists is_current boolean default true;
alter table public.persona_snapshots add column if not exists snapshot_version integer default 1;
alter table public.persona_snapshots add column if not exists source_events jsonb default '[]'::jsonb;
alter table public.persona_snapshots add column if not exists source_hash text;
alter table public.persona_snapshots add column if not exists audit_payload jsonb default '{}'::jsonb;

-- ── engagement_events ─────────────────────────────────────────────────────────
alter table public.engagement_events add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.engagement_events add column if not exists contact_id uuid references public.contacts(id) on delete cascade;
alter table public.engagement_events add column if not exists property_id uuid references public.properties(id) on delete cascade;
alter table public.engagement_events add column if not exists lead_id uuid references public.leads(id) on delete cascade;
alter table public.engagement_events add column if not exists job_id uuid references public.jobs(id) on delete cascade;
alter table public.engagement_events add column if not exists outcome_id uuid references public.outcomes(id) on delete cascade;
alter table public.engagement_events add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
alter table public.engagement_events add column if not exists campaign_asset_id uuid references public.campaign_assets(id) on delete set null;
alter table public.engagement_events add column if not exists direction text;
alter table public.engagement_events add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.engagement_events add column if not exists reasoning_payload jsonb default '{}'::jsonb;
alter table public.engagement_events add column if not exists external_event_id text;

-- ── guardrail_rules ───────────────────────────────────────────────────────────
alter table public.guardrail_rules add column if not exists rule_key text;
alter table public.guardrail_rules add column if not exists scope text;
alter table public.guardrail_rules add column if not exists status text default 'active';
alter table public.guardrail_rules add column if not exists failure_message text;
alter table public.guardrail_rules add column if not exists matcher_payload jsonb default '{}'::jsonb;
-- The code upserts with onConflict("rule_key"); that needs a unique index on it.
-- Multiple NULLs are allowed (Postgres treats NULLs as distinct), so this is safe
-- even though existing rows have a NULL rule_key.
create unique index if not exists guardrail_rules_rule_key_key on public.guardrail_rules(rule_key);

-- ── campaign_results ──────────────────────────────────────────────────────────
-- Prod stores metrics as a `metrics` jsonb blob; the code expects columnar counts.
-- Added nullable so existing rows are valid; see backfill note below.
alter table public.campaign_results add column if not exists period_start date;
alter table public.campaign_results add column if not exists period_end date;
alter table public.campaign_results add column if not exists impressions integer;
alter table public.campaign_results add column if not exists clicks integer;
alter table public.campaign_results add column if not exists calls integer;
alter table public.campaign_results add column if not exists forms integer;
alter table public.campaign_results add column if not exists leads integer;
alter table public.campaign_results add column if not exists jobs integer;
alter table public.campaign_results add column if not exists won_revenue_cents bigint;
alter table public.campaign_results add column if not exists spend_cents bigint;
alter table public.campaign_results add column if not exists metadata jsonb default '{}'::jsonb;

-- ── OPTIONAL BACKFILL (review before running) ─────────────────────────────────
-- The statements above only make the columns EXIST. Where prod already holds data
-- in its old-shape columns, that data won't surface until it's copied across.
-- These are illustrative and commented out — confirm the source columns/keys for
-- your data before running:
--
--   update public.vault_notes set folder = coalesce(folder, collection, 'Inbox') where folder is null;
--   update public.campaign_results
--     set impressions = coalesce(impressions, (metrics->>'impressions')::int),
--         clicks      = coalesce(clicks,      (metrics->>'clicks')::int)
--     where metrics is not null;
