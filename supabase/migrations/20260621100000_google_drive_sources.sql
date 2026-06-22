-- Saved Google Drive folder sources for repeat Library syncs.
-- The refresh token remains in google_drive_connections/Vault; this table only
-- stores non-secret folder pointers and sync status for the current operator.

create table if not exists public.google_drive_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connected_by text not null,
  library_folder_id uuid references public.media_folders(id) on delete set null,
  drive_folder_id text not null,
  drive_folder_name text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'error')),
  last_synced_at timestamptz,
  last_error text,
  last_imported_count integer not null default 0,
  last_seen_file_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, connected_by, drive_folder_id)
);

drop trigger if exists google_drive_sources_set_updated_at on public.google_drive_sources;
create trigger google_drive_sources_set_updated_at
  before update on public.google_drive_sources
  for each row execute function public.set_updated_at();

alter table public.google_drive_sources enable row level security;

grant select, insert, update, delete on public.google_drive_sources to service_role;
