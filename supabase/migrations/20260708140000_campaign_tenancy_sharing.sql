-- supabase/migrations/20260708140000_campaign_tenancy_sharing.sql
-- Per-person ownership + sharing for campaigns, mirroring arc_conversations
-- (20260623090000). Reuses the resource-agnostic access resolver (resolveResourceAccess).
--
-- KEY DIFFERENCE FROM CHATS: chats are private-by-default; campaigns are a shared
-- workspace asset today (org-scoped, everyone sees them). To stay non-breaking,
-- visibility DEFAULTS TO 'workspace' with 'collaborate' — existing and new
-- campaigns remain visible to the whole workspace exactly as before. Making a
-- campaign 'private' or sharing it with specific members is now an OPTION on top.

alter table public.campaigns
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'workspace'
    check (visibility in ('private', 'workspace')),
  add column if not exists workspace_permission text not null default 'collaborate'
    check (workspace_permission in ('view', 'collaborate'));

create table if not exists public.campaign_shares (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null default 'view' check (permission in ('view', 'collaborate')),
  shared_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create index if not exists campaigns_owner_idx on public.campaigns (owner_id, updated_at desc);
create index if not exists campaigns_workspace_visibility_idx on public.campaigns (workspace_id, visibility);
