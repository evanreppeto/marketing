-- Enforce Arc task tenancy after the live workspace backfill.
-- This migration is intentionally repeatable: it backfills any late rows,
-- proves no null scope remains, and then locks the database boundary.

alter table if exists public.agent_tasks
  add column if not exists org_id uuid,
  add column if not exists workspace_id uuid;

update public.agent_tasks as task
set org_id = campaign.org_id
from public.campaigns as campaign
where task.org_id is null
  and task.campaign_id = campaign.id
  and campaign.org_id is not null;

update public.agent_tasks
set org_id = public.default_organization_id()
where org_id is null;

update public.agent_tasks as task
set workspace_id = workspace.id
from public.workspaces as workspace
where task.workspace_id is null
  and workspace.org_id = task.org_id
  and workspace.key = 'default'
  and workspace.status = 'active';

with first_active_workspace as (
  select distinct on (org_id)
    org_id,
    id
  from public.workspaces
  where status = 'active'
  order by org_id, created_at asc
)
update public.agent_tasks as task
set workspace_id = first_active_workspace.id
from first_active_workspace
where task.workspace_id is null
  and first_active_workspace.org_id = task.org_id;

do $$
begin
  if exists (select 1 from public.agent_tasks where org_id is null) then
    raise exception 'agent_tasks.org_id still has null rows; run the workspace backfill before enforcing tenancy.';
  end if;

  if exists (select 1 from public.agent_tasks where workspace_id is null) then
    raise exception 'agent_tasks.workspace_id still has null rows; run the workspace backfill before enforcing tenancy.';
  end if;
end $$;

alter table if exists public.agent_tasks
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null,
  alter column workspace_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspaces_org_id_id_key'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint workspaces_org_id_id_key unique (org_id, id);
  end if;
end $$;

alter table if exists public.agent_tasks
  drop constraint if exists agent_tasks_org_id_fkey;
alter table if exists public.agent_tasks
  add constraint agent_tasks_org_id_fkey
  foreign key (org_id) references public.organizations(id) on delete cascade;

alter table if exists public.agent_tasks
  drop constraint if exists agent_tasks_workspace_org_fkey;
alter table if exists public.agent_tasks
  add constraint agent_tasks_workspace_org_fkey
  foreign key (org_id, workspace_id) references public.workspaces(org_id, id) on delete cascade;

create index if not exists agent_tasks_org_workspace_status_idx
  on public.agent_tasks(org_id, workspace_id, status, updated_at desc);

create index if not exists agent_tasks_workspace_updated_idx
  on public.agent_tasks(workspace_id, updated_at desc);

alter table if exists public.agent_tasks enable row level security;

drop policy if exists agent_tasks_workspace_member_select on public.agent_tasks;
create policy agent_tasks_workspace_member_select
on public.agent_tasks for select
to authenticated
using ((select app_private.is_workspace_member(workspace_id)));

drop policy if exists agent_tasks_workspace_admin_insert on public.agent_tasks;
create policy agent_tasks_workspace_admin_insert
on public.agent_tasks for insert
to authenticated
with check ((select app_private.is_workspace_admin(workspace_id)));

drop policy if exists agent_tasks_workspace_admin_update on public.agent_tasks;
create policy agent_tasks_workspace_admin_update
on public.agent_tasks for update
to authenticated
using ((select app_private.is_workspace_admin(workspace_id)))
with check ((select app_private.is_workspace_admin(workspace_id)));

drop policy if exists agent_tasks_workspace_admin_delete on public.agent_tasks;
create policy agent_tasks_workspace_admin_delete
on public.agent_tasks for delete
to authenticated
using ((select app_private.is_workspace_admin(workspace_id)));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.agent_tasks to authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.agent_tasks to service_role;
  end if;
end $$;

create or replace function public.check_agent_task_tenancy_constraints()
returns table(check_name text, ok boolean, detail text)
language sql
security invoker
stable
set search_path = public, pg_catalog
as $$
  with
    columns as (
      select column_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'agent_tasks'
        and column_name in ('org_id', 'workspace_id')
    ),
    task_nulls as (
      select
        count(*) filter (where org_id is null) as null_org_id,
        count(*) filter (where workspace_id is null) as null_workspace_id
      from public.agent_tasks
    ),
    constraints as (
      select conname, contype, pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname in (
        'workspaces_org_id_id_key',
        'agent_tasks_org_id_fkey',
        'agent_tasks_workspace_org_fkey'
      )
    ),
    indexes as (
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'agent_tasks'
        and indexname in (
          'agent_tasks_org_workspace_status_idx',
          'agent_tasks_workspace_updated_idx'
        )
    ),
    policies as (
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'agent_tasks'
        and policyname in (
          'agent_tasks_workspace_member_select',
          'agent_tasks_workspace_admin_insert',
          'agent_tasks_workspace_admin_update',
          'agent_tasks_workspace_admin_delete'
        )
    ),
    grants as (
      select grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'agent_tasks'
        and grantee in ('authenticated', 'service_role')
        and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    )
  select
    'agent_tasks.org_id_not_null',
    exists (select 1 from columns where column_name = 'org_id' and is_nullable = 'NO'),
    coalesce((select 'is_nullable=' || is_nullable from columns where column_name = 'org_id'), 'missing column')
  union all
  select
    'agent_tasks.workspace_id_not_null',
    exists (select 1 from columns where column_name = 'workspace_id' and is_nullable = 'NO'),
    coalesce((select 'is_nullable=' || is_nullable from columns where column_name = 'workspace_id'), 'missing column')
  union all
  select
    'agent_tasks.org_id_default',
    exists (select 1 from columns where column_name = 'org_id' and column_default ilike '%default_organization_id%'),
    coalesce((select column_default from columns where column_name = 'org_id'), 'missing default')
  union all
  select
    'agent_tasks.no_null_tenant_rows',
    (select null_org_id = 0 and null_workspace_id = 0 from task_nulls),
    (select 'null_org_id=' || null_org_id || ', null_workspace_id=' || null_workspace_id from task_nulls)
  union all
  select
    'workspaces.org_id_id_unique',
    exists (select 1 from constraints where conname = 'workspaces_org_id_id_key' and contype = 'u'),
    coalesce((select definition from constraints where conname = 'workspaces_org_id_id_key'), 'missing constraint')
  union all
  select
    'agent_tasks.org_fk',
    exists (
      select 1
      from constraints
      where conname = 'agent_tasks_org_id_fkey'
        and contype = 'f'
        and definition like '%FOREIGN KEY (org_id)%'
    ),
    coalesce((select definition from constraints where conname = 'agent_tasks_org_id_fkey'), 'missing constraint')
  union all
  select
    'agent_tasks.workspace_org_fk',
    exists (
      select 1
      from constraints
      where conname = 'agent_tasks_workspace_org_fkey'
        and contype = 'f'
        and definition like '%FOREIGN KEY (org_id, workspace_id)%'
    ),
    coalesce((select definition from constraints where conname = 'agent_tasks_workspace_org_fkey'), 'missing constraint')
  union all
  select
    'agent_tasks.org_workspace_status_index',
    exists (select 1 from indexes where indexname = 'agent_tasks_org_workspace_status_idx'),
    case when exists (select 1 from indexes where indexname = 'agent_tasks_org_workspace_status_idx') then 'present' else 'missing index' end
  union all
  select
    'agent_tasks.workspace_updated_index',
    exists (select 1 from indexes where indexname = 'agent_tasks_workspace_updated_idx'),
    case when exists (select 1 from indexes where indexname = 'agent_tasks_workspace_updated_idx') then 'present' else 'missing index' end
  union all
  select
    'agent_tasks.rls_enabled',
    exists (
      select 1
      from pg_class
      where oid = 'public.agent_tasks'::regclass
        and relrowsecurity
    ),
    coalesce((select 'relrowsecurity=' || relrowsecurity from pg_class where oid = 'public.agent_tasks'::regclass), 'missing table')
  union all
  select
    'agent_tasks.rls_policies',
    (select count(*) = 4 from policies),
    (select 'policy_count=' || count(*) from policies)
  union all
  select
    'agent_tasks.authenticated_grants',
    (
      select count(*) = 4
      from grants
      where grantee = 'authenticated'
    ),
    (
      select 'grant_count=' || count(*)
      from grants
      where grantee = 'authenticated'
    )
  union all
  select
    'agent_tasks.service_role_grants',
    (
      select count(*) = 4
      from grants
      where grantee = 'service_role'
    ),
    (
      select 'grant_count=' || count(*)
      from grants
      where grantee = 'service_role'
    );
$$;

revoke all on function public.check_agent_task_tenancy_constraints() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.check_agent_task_tenancy_constraints() from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.check_agent_task_tenancy_constraints() from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.check_agent_task_tenancy_constraints() to service_role;
  end if;
end $$;
