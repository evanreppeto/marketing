-- Write-side RLS for the campaign / approval surface — slice 3 of DB-enforced
-- tenancy (see docs/TENANCY.md).
--
-- Mirrors 20260705120000_crm_object_write_policies.sql. The org-member SELECT
-- policies already exist from 20260618185612_org_member_read_policies.sql; this
-- adds INSERT/UPDATE/DELETE so a signed-in workspace member can only mutate the
-- campaign approval flow (campaigns, their assets, approval items/decisions/
-- recommendations, agent outputs, events, dispatches, results) inside an org they
-- belong to — enforced by the database, not just application-layer org filters.
--
-- These tables are Arc- and operator-written today through the service-role
-- client (which bypasses RLS), so this changes no current write path. It makes
-- the surface safe for when the human approve / decline / revise writes move onto
-- the user-scoped client. The campaigns read-model itself threads `org_id` from
-- its callers, so its user-client reroute is a caller-layer follow-up (tracked in
-- docs/TENANCY.md), separate from this DB-truth change.
--
-- NOTE: this is member-level write isolation (the security property: no
-- cross-tenant writes). Finer authorization — e.g. restricting approval
-- *decisions* to reviewer/admin roles — is a later refinement layered on top.

grant insert, update, delete on
  public.campaigns,
  public.campaign_assets,
  public.approval_items,
  public.approval_decisions,
  public.approval_recommendations,
  public.agent_outputs,
  public.campaign_events,
  public.campaign_dispatches,
  public.campaign_results
to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'campaigns',
    'campaign_assets',
    'approval_items',
    'approval_decisions',
    'approval_recommendations',
    'agent_outputs',
    'campaign_events',
    'campaign_dispatches',
    'campaign_results'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table); -- idempotent

    execute format('drop policy if exists %I on public.%I', target_table || '_org_member_insert', target_table);
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check ((select app_private.is_org_member(org_id)))',
      target_table || '_org_member_insert',
      target_table
    );

    execute format('drop policy if exists %I on public.%I', target_table || '_org_member_update', target_table);
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using ((select app_private.is_org_member(org_id))) '
      || 'with check ((select app_private.is_org_member(org_id)))',
      target_table || '_org_member_update',
      target_table
    );

    execute format('drop policy if exists %I on public.%I', target_table || '_org_member_delete', target_table);
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      || 'using ((select app_private.is_org_member(org_id)))',
      target_table || '_org_member_delete',
      target_table
    );
  end loop;
end $$;
