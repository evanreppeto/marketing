-- Write-side RLS for the remaining wired human-editable surfaces — slice 4 of
-- DB-enforced tenancy (see docs/TENANCY.md).
--
-- Mirrors the CRM / opportunities / campaign write-policy migrations. The
-- org-member SELECT policies already exist from
-- 20260618185612_org_member_read_policies.sql; this adds INSERT/UPDATE/DELETE so
-- a signed-in workspace member can only mutate these rows inside an org they
-- belong to, enforced by the database:
--
--   vault_notes                          — the Obsidian-style vault notebook
--   crm_notes / crm_tasks / crm_activities — record-attached CRM interactions
--   media_assets / media_folders          — the creative library
--
-- These are the three fully-wired human write paths in the app today (vault,
-- CRM interactions, media library) — the surfaces where humans, not just Arc,
-- create and edit records. Together with the CRM object, opportunity, and
-- campaign policies already merged, every wired human-editable surface is now
-- write-isolated at the database.
--
-- Writes still flow through the service-role client today (which bypasses RLS),
-- so no current write path changes; this makes the surfaces safe for when those
-- human writes move onto the user-scoped client. All nine tables of the campaign
-- surface plus these six share the identical is_org_member(org_id) predicate, so
-- supabase/tests/rls_crm_isolation.sql remains representative.

grant insert, update, delete on
  public.vault_notes,
  public.crm_notes,
  public.crm_tasks,
  public.crm_activities,
  public.media_assets,
  public.media_folders
to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'vault_notes',
    'crm_notes',
    'crm_tasks',
    'crm_activities',
    'media_assets',
    'media_folders'
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
