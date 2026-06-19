-- Product hardening: Google Drive is connected by the current operator/user,
-- not as a single hardcoded company-wide Drive account.

alter table if exists public.google_drive_connections
  add column if not exists connected_by text not null default 'workspace';

alter table if exists public.google_drive_connections
  drop constraint if exists google_drive_connections_org_id_key;

create unique index if not exists google_drive_connections_org_user_unique_idx
  on public.google_drive_connections (org_id, connected_by);
