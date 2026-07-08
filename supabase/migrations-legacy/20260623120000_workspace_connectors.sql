-- supabase/migrations/20260623120000_workspace_connectors.sql
-- Per-workspace connector enablement + credential ref. The credential itself
-- lives in Supabase Vault (vault.create_secret); this row stores only the ref
-- (credential_ref) plus operator state and test telemetry. Operator-facing
-- status (not_configured/disabled/error/connected) is COMPUTED in the read-model
-- (credential presence x enabled x last_test_ok), never stored here.
--
-- Distinct from the global `connections` table (20260609120000): that is the
-- single-tenant env-var outbound registry; this is multi-tenant connectors with
-- per-workspace keys. Reuses the shared set_updated_at() trigger function.

create table public.workspace_connectors (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  org_id          uuid,
  connector_key   text not null check (length(btrim(connector_key)) > 0),
  enabled         boolean not null default false,
  config          jsonb not null default '{}'::jsonb,
  credential_ref  uuid,
  last_tested_at  timestamptz,
  last_test_ok    boolean,
  last_test_error text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, connector_key)
);

create index workspace_connectors_workspace_idx on public.workspace_connectors(workspace_id);

alter table public.workspace_connectors enable row level security;

create trigger workspace_connectors_set_updated_at
before update on public.workspace_connectors
for each row execute function public.set_updated_at();
