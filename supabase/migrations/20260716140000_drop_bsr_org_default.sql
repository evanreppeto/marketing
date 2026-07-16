-- Drop the hardcoded Big Shoulders org default from every org_id column.
--
-- WHY: default_organization_id() is `select id from organizations where slug =
-- 'big-shoulders-restoration'`. As a column default it removes the safe failure
-- mode: an INSERT that forgets org_id does not raise a not-null violation, it
-- silently writes the row into BSR's tenant and looks fine. There is no error to
-- catch and no red test -- the failure is silent by construction.
--
-- This was harmless while BSR was the only tenant (every wrong answer was also
-- the right answer). Making the product multi-tenant is precisely the change
-- that converts it into silent cross-tenant data mixing, so the default goes now,
-- while there is still exactly one org and nothing to clean up afterwards.
--
-- SAFETY: every one of these columns is already NOT NULL and every existing row
-- already has a value. Dropping a default does not touch existing rows and does
-- not rewrite the table -- it is a catalog-only change. The only behaviour that
-- changes is that a future INSERT which omits org_id now fails loudly instead of
-- misfiling. Callers were fixed first; see docs/ORG-SCOPING-AUDIT.md.
--
-- DEPLOY ORDER -- THIS ONE IS LOAD-BEARING: ship the application code FIRST, then
-- apply this migration. This is a breaking change for any build that still relies
-- on the default: the moment it lands, an org-less INSERT from the previously
-- deployed code starts raising instead of quietly succeeding. Applying it ahead of
-- the deploy would break Arc chat, dispatch logging and agent runs on the running
-- app. There is no reverse hazard -- new code passes org_id explicitly, which is
-- correct both before and after this migration -- so code-then-migration has a
-- safe window in one direction only.

alter table public.agent_api_tokens          alter column org_id drop default;
alter table public.agent_connections         alter column org_id drop default;
alter table public.agent_outputs             alter column org_id drop default;
alter table public.agent_run_logs            alter column org_id drop default;
alter table public.agent_task_events         alter column org_id drop default;
alter table public.agent_task_inputs         alter column org_id drop default;
alter table public.agent_tasks               alter column org_id drop default;
alter table public.agents                    alter column org_id drop default;
alter table public.app_settings              alter column org_id drop default;
alter table public.approval_decisions        alter column org_id drop default;
alter table public.approval_items            alter column org_id drop default;
alter table public.approval_recommendations  alter column org_id drop default;
alter table public.arc_conversations         alter column org_id drop default;
alter table public.arc_messages              alter column org_id drop default;
alter table public.arc_projects              alter column org_id drop default;
alter table public.arc_saved_items           alter column org_id drop default;
alter table public.campaign_assets           alter column org_id drop default;
alter table public.campaign_dispatches       alter column org_id drop default;
alter table public.campaign_events           alter column org_id drop default;
alter table public.campaign_results          alter column org_id drop default;
alter table public.campaigns                 alter column org_id drop default;
alter table public.competitor_campaigns      alter column org_id drop default;
alter table public.connections               alter column org_id drop default;
alter table public.engagement_events         alter column org_id drop default;
alter table public.events                    alter column org_id drop default;
alter table public.guardrail_rules           alter column org_id drop default;
alter table public.integrity_findings        alter column org_id drop default;
alter table public.next_best_actions         alter column org_id drop default;
alter table public.persona_knowledge_entries alter column org_id drop default;
alter table public.persona_snapshots         alter column org_id drop default;
alter table public.routing_decisions         alter column org_id drop default;
alter table public.vault_notes               alter column org_id drop default;

-- Fail the migration if any column still carries it (guards against a table
-- added between the audit and this migration landing).
do $$
declare
  stragglers text;
begin
  select string_agg(table_name || '.' || column_name, ', ' order by table_name)
    into stragglers
  from information_schema.columns
  where table_schema = 'public'
    and column_default like '%default_organization_id%';

  if stragglers is not null then
    raise exception 'org_id columns still default to the BSR org: %', stragglers;
  end if;
end
$$;

-- The function itself is now unreferenced. Dropping it is the ratchet: the
-- default cannot be reintroduced by copy-paste without consciously recreating
-- this. RESTRICT (the default) means this statement fails rather than cascades
-- if anything still depends on it.
drop function if exists public.default_organization_id();

-- This diagnostic asserted that the BSR default EXISTS on agent_tasks.org_id.
-- Restated with that one assertion inverted, so it now guards against the
-- default coming back instead of requiring it. Body is otherwise verbatim.
CREATE OR REPLACE FUNCTION public.check_agent_task_tenancy_constraints()
 RETURNS TABLE(check_name text, ok boolean, detail text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
    'agent_tasks.org_id_default_absent',
    not exists (select 1 from columns where column_name = 'org_id' and column_default ilike '%default_organization_id%'),
    coalesce((select 'UNEXPECTED default: ' || column_default from columns where column_name = 'org_id'), 'no default (correct)')
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
$function$
;
