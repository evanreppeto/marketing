-- Make agent_tasks part of the product workspace boundary.
-- Existing rows are backfilled into their campaign org when available, then
-- into that org's default workspace. New rows should be written with both ids.

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

alter table if exists public.agent_tasks
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null,
  alter column workspace_id set not null;

alter table if exists public.workspaces
  drop constraint if exists workspaces_org_id_id_key;
alter table if exists public.workspaces
  add constraint workspaces_org_id_id_key unique (org_id, id);

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

grant select on public.agent_tasks to authenticated;
grant insert, update, delete on public.agent_tasks to authenticated;
