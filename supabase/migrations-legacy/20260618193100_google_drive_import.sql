-- Google Drive manual imports for Library.
-- Operators connect Drive via OAuth, selected files are copied into media_assets,
-- and the refresh token itself lives in Supabase Vault.

create extension if not exists supabase_vault with schema vault;

do $$
begin
  if exists (select 1 from pg_type where typname = 'connection_kind') then
    alter type public.connection_kind add value if not exists 'storage';
  end if;
end $$;

alter table if exists public.connections
  drop constraint if exists connections_provider_check;

alter table if exists public.connections
  add constraint connections_provider_check
  check (provider in ('resend','instagram','facebook','linkedin','x','google_drive'));

alter table if exists public.connections
  drop constraint if exists connections_kind_check;

alter table if exists public.connections
  add constraint connections_kind_check
  check (kind in ('email','social','storage'));

insert into public.connections (provider, kind, label, env_var, config)
values (
  'google_drive',
  'storage',
  'Google Drive',
  'GOOGLE_DRIVE_CLIENT_ID',
  '{}'::jsonb
)
on conflict (provider) do update
set
  kind = excluded.kind,
  label = excluded.label,
  env_var = excluded.env_var,
  updated_at = now();

create table if not exists public.google_drive_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connected_by text not null,
  refresh_token_ref uuid not null,
  scopes text[] not null default '{}',
  connected_email text,
  connected_at timestamptz not null default now(),
  last_import_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, connected_by)
);

drop trigger if exists google_drive_connections_set_updated_at on public.google_drive_connections;
create trigger google_drive_connections_set_updated_at
  before update on public.google_drive_connections
  for each row execute function public.set_updated_at();

alter table public.google_drive_connections enable row level security;

grant select, insert, update, delete on public.google_drive_connections to service_role;
grant select on public.google_drive_connections to anon, authenticated;

alter table public.media_assets
  drop constraint if exists media_assets_source_check;

alter table public.media_assets
  add constraint media_assets_source_check
  check (source in ('uploaded','ai_generated','composite','stock','external','google_drive'));
