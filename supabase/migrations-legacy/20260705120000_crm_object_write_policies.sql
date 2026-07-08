-- Write-side RLS for the six CRM object tables.
--
-- The org-member SELECT policies landed in
-- 20260618185612_org_member_read_policies.sql. This migration adds the matching
-- INSERT/UPDATE/DELETE policies (plus the authenticated write grants) so a
-- signed-in workspace member can mutate CRM records through a *user-scoped*
-- Supabase client (anon key + session JWT) with the DATABASE enforcing tenant
-- isolation — not just the application-layer `.eq("org_id", …)` filters.
--
-- This is the first vertical slice of DB-enforced tenancy. It closes the gap
-- where isolation depended entirely on every query remembering to filter by
-- org: with these policies, a user-scoped client physically cannot read or write
-- another organization's rows even if the app forgets a filter.
--
-- Service-role callers (lead ingestion, the Arc runner, /api/v1 bearer routes)
-- bypass RLS by design, so system write paths are unaffected. Other table
-- groups (campaigns, opportunities, vault, …) follow this same shape — see
-- docs/TENANCY.md for the rollout checklist.

grant insert, update, delete on
  public.companies,
  public.contacts,
  public.properties,
  public.leads,
  public.jobs,
  public.outcomes
to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'companies',
    'contacts',
    'properties',
    'leads',
    'jobs',
    'outcomes'
  ]
  loop
    -- Idempotent: RLS may already be enabled from the read-policy migration.
    execute format('alter table public.%I enable row level security', target_table);

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
