-- Agent Connection: promotes the env-only agent "port" into operator-managed,
-- DB-backed config. Effective values resolve as env ?? db ?? default, so env-only
-- deployments are unaffected. workspace_id is a singleton ("default") today and
-- the only seam for future multi-tenancy.
--
-- Secrets policy: the app-issued API token is stored ONLY as a SHA-256 hash. The
-- outbound webhook signing secret is NOT stored here — it lives in Supabase Vault
-- (webhook_secret_ref) or in env. No plaintext secrets in application tables.

create extension if not exists supabase_vault with schema vault;

create table public.agent_connections (
  workspace_id        text primary key check (length(btrim(workspace_id)) > 0),
  display_name        text,
  agent_key           text,
  webhook_url         text,
  webhook_secret_ref  uuid,
  enabled             boolean not null default true,
  last_seen_at        timestamptz,
  last_status         text check (last_status in ('ok','error','unreachable')),
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.agent_connections enable row level security;

create trigger agent_connections_set_updated_at
before update on public.agent_connections
for each row execute function public.set_updated_at();

create table public.agent_api_tokens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  text not null default 'default',
  token_hash    text not null unique,
  prefix        text not null,
  label         text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

-- Partial index: only non-revoked tokens are ever looked up (active-token scans).
create index agent_api_tokens_active_idx
  on public.agent_api_tokens (workspace_id)
  where revoked_at is null;

alter table public.agent_api_tokens enable row level security;

-- Seed the singleton connection row so reads/upserts always have a target.
insert into public.agent_connections (workspace_id) values ('default')
on conflict (workspace_id) do nothing;
