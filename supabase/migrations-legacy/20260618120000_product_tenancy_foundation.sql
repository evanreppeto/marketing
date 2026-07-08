-- Product tenancy foundation: accounts, workspaces, memberships, Arc instances,
-- and audit events. This is additive and keeps the current single-workspace app
-- working while creating the security model needed for multi-tenant customers.

create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from public;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  timezone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended', 'removed')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_identity_check check (
    user_id is not null or invited_email is not null
  )
);

create unique index if not exists organization_memberships_user_unique_idx
  on public.organization_memberships(org_id, user_id)
  where user_id is not null;
create unique index if not exists organization_memberships_invite_unique_idx
  on public.organization_memberships(org_id, lower(invited_email))
  where invited_email is not null and user_id is null and status = 'invited';
create index if not exists organization_memberships_user_idx
  on public.organization_memberships(user_id)
  where user_id is not null;

drop trigger if exists organization_memberships_set_updated_at on public.organization_memberships;
create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row execute function public.set_updated_at();

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null default 'default' check (length(btrim(key)) > 0),
  slug text not null check (length(btrim(slug)) > 0),
  name text not null check (length(btrim(name)) > 0),
  workspace_type text not null default 'company'
    check (workspace_type in ('individual', 'company', 'agency')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  settings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key),
  unique (org_id, slug)
);

create index if not exists workspaces_org_status_idx on public.workspaces(org_id, status);

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

insert into public.workspaces (org_id, key, slug, name, workspace_type, settings)
select
  organizations.id,
  'default',
  organizations.slug,
  organizations.name,
  'company',
  jsonb_build_object('seededFromOrganization', organizations.slug)
from public.organizations
on conflict (org_id, key) do update
set
  slug = excluded.slug,
  name = excluded.name,
  updated_at = now();

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'marketer', 'reviewer', 'member', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended', 'removed')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_memberships_identity_check check (
    user_id is not null or invited_email is not null
  )
);

create unique index if not exists workspace_memberships_user_unique_idx
  on public.workspace_memberships(workspace_id, user_id)
  where user_id is not null;
create unique index if not exists workspace_memberships_invite_unique_idx
  on public.workspace_memberships(workspace_id, lower(invited_email))
  where invited_email is not null and user_id is null and status = 'invited';
create index if not exists workspace_memberships_user_idx
  on public.workspace_memberships(user_id)
  where user_id is not null;
create index if not exists workspace_memberships_org_idx
  on public.workspace_memberships(org_id, workspace_id);

drop trigger if exists workspace_memberships_set_updated_at on public.workspace_memberships;
create trigger workspace_memberships_set_updated_at
before update on public.workspace_memberships
for each row execute function public.set_updated_at();

create table if not exists public.arc_instances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null default 'arc' check (length(btrim(key)) > 0),
  display_name text not null default 'Arc' check (length(btrim(display_name)) > 0),
  status text not null default 'active'
    check (status in ('active', 'paused', 'disabled', 'archived')),
  memory_policy text not null default 'approval_required'
    check (memory_policy in ('approval_required', 'trusted_members', 'manual_only')),
  model_policy jsonb not null default '{}'::jsonb,
  brand_policy jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create index if not exists arc_instances_org_workspace_idx
  on public.arc_instances(org_id, workspace_id);

drop trigger if exists arc_instances_set_updated_at on public.arc_instances;
create trigger arc_instances_set_updated_at
before update on public.arc_instances
for each row execute function public.set_updated_at();

insert into public.arc_instances (org_id, workspace_id, key, display_name, memory_policy)
select workspaces.org_id, workspaces.id, 'arc', 'Arc', 'approval_required'
from public.workspaces
on conflict (workspace_id, key) do nothing;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_kind text not null default 'user'
    check (actor_kind in ('user', 'agent', 'system', 'service')),
  action text not null check (length(btrim(action)) > 0),
  subject_table text,
  subject_id uuid,
  summary text,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_org_created_idx
  on public.audit_events(org_id, created_at desc);
create index if not exists audit_events_workspace_created_idx
  on public.audit_events(workspace_id, created_at desc)
  where workspace_id is not null;
create index if not exists audit_events_actor_created_idx
  on public.audit_events(actor_user_id, created_at desc)
  where actor_user_id is not null;

alter table if exists public.agent_connections
  add column if not exists org_id uuid;

update public.agent_connections
set org_id = public.default_organization_id()
where org_id is null;

alter table if exists public.agent_connections
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table if exists public.agent_connections
  drop constraint if exists agent_connections_org_id_fkey;
alter table if exists public.agent_connections
  add constraint agent_connections_org_id_fkey
  foreign key (org_id) references public.organizations(id) on delete cascade;

alter table if exists public.agent_connections
  drop constraint if exists agent_connections_pkey;
alter table if exists public.agent_connections
  add constraint agent_connections_pkey primary key (org_id, workspace_id);

create index if not exists agent_connections_org_workspace_idx
  on public.agent_connections(org_id, workspace_id);

alter table if exists public.agent_api_tokens
  add column if not exists org_id uuid;

update public.agent_api_tokens
set org_id = public.default_organization_id()
where org_id is null;

alter table if exists public.agent_api_tokens
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table if exists public.agent_api_tokens
  drop constraint if exists agent_api_tokens_org_id_fkey;
alter table if exists public.agent_api_tokens
  add constraint agent_api_tokens_org_id_fkey
  foreign key (org_id) references public.organizations(id) on delete cascade;

create index if not exists agent_api_tokens_org_workspace_active_idx
  on public.agent_api_tokens(org_id, workspace_id)
  where revoked_at is null;

create or replace function app_private.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
$$;

create or replace function app_private.is_org_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  )
$$;

create or replace function app_private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
$$;

create or replace function app_private.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  )
$$;

grant usage on schema app_private to authenticated, service_role;
grant execute on all functions in schema app_private to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.arc_instances enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert
on public.profiles for insert
to authenticated
with check (id = (select auth.uid()));

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists organizations_member_select on public.organizations;
create policy organizations_member_select
on public.organizations for select
to authenticated
using ((select app_private.is_org_member(id)));

drop policy if exists organizations_admin_update on public.organizations;
create policy organizations_admin_update
on public.organizations for update
to authenticated
using ((select app_private.is_org_admin(id)))
with check ((select app_private.is_org_admin(id)));

drop policy if exists organization_memberships_member_select on public.organization_memberships;
create policy organization_memberships_member_select
on public.organization_memberships for select
to authenticated
using ((select app_private.is_org_member(org_id)));

drop policy if exists organization_memberships_admin_write on public.organization_memberships;
create policy organization_memberships_admin_write
on public.organization_memberships for all
to authenticated
using ((select app_private.is_org_admin(org_id)))
with check ((select app_private.is_org_admin(org_id)));

drop policy if exists workspaces_member_select on public.workspaces;
create policy workspaces_member_select
on public.workspaces for select
to authenticated
using ((select app_private.is_workspace_member(id)));

drop policy if exists workspaces_admin_update on public.workspaces;
create policy workspaces_admin_update
on public.workspaces for update
to authenticated
using ((select app_private.is_workspace_admin(id)))
with check ((select app_private.is_workspace_admin(id)));

drop policy if exists workspace_memberships_member_select on public.workspace_memberships;
create policy workspace_memberships_member_select
on public.workspace_memberships for select
to authenticated
using ((select app_private.is_workspace_member(workspace_id)));

drop policy if exists workspace_memberships_admin_write on public.workspace_memberships;
create policy workspace_memberships_admin_write
on public.workspace_memberships for all
to authenticated
using ((select app_private.is_workspace_admin(workspace_id)))
with check ((select app_private.is_workspace_admin(workspace_id)));

drop policy if exists arc_instances_member_select on public.arc_instances;
create policy arc_instances_member_select
on public.arc_instances for select
to authenticated
using ((select app_private.is_workspace_member(workspace_id)));

drop policy if exists arc_instances_admin_update on public.arc_instances;
create policy arc_instances_admin_update
on public.arc_instances for update
to authenticated
using ((select app_private.is_workspace_admin(workspace_id)))
with check ((select app_private.is_workspace_admin(workspace_id)));

drop policy if exists audit_events_member_select on public.audit_events;
create policy audit_events_member_select
on public.audit_events for select
to authenticated
using (
  (workspace_id is not null and (select app_private.is_workspace_member(workspace_id)))
  or (workspace_id is null and (select app_private.is_org_member(org_id)))
);

grant select, insert, update, delete on
  public.profiles,
  public.organization_memberships,
  public.workspaces,
  public.workspace_memberships,
  public.arc_instances,
  public.audit_events
to service_role;

grant select, insert, update on public.profiles to authenticated;
grant select on
  public.organizations,
  public.organization_memberships,
  public.workspaces,
  public.workspace_memberships,
  public.arc_instances,
  public.audit_events
to authenticated;
grant update on public.organizations, public.workspaces, public.arc_instances to authenticated;
grant insert, update, delete on public.organization_memberships, public.workspace_memberships to authenticated;

revoke all on
  public.profiles,
  public.organization_memberships,
  public.workspaces,
  public.workspace_memberships,
  public.arc_instances,
  public.audit_events
from anon;
