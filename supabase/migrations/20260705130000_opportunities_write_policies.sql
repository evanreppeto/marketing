-- Write-side RLS for the opportunities inbox — slice 2 of DB-enforced tenancy.
--
-- Mirrors 20260705120000_crm_object_write_policies.sql (see docs/TENANCY.md).
-- The org-member SELECT policy already exists from
-- 20260618185612_org_member_read_policies.sql; this adds INSERT/UPDATE/DELETE so
-- a signed-in workspace member can only mutate opportunities in an org they
-- belong to, with the database enforcing it.
--
-- Opportunities are Arc-written today (scan / propose, via the service-role
-- runner, which bypasses RLS), so this changes no current write path — it makes
-- the table safe for when human triage moves onto the user-scoped client.

grant insert, update, delete on public.opportunities to authenticated;

alter table public.opportunities enable row level security; -- idempotent

drop policy if exists opportunities_org_member_insert on public.opportunities;
create policy opportunities_org_member_insert on public.opportunities
  for insert to authenticated
  with check ((select app_private.is_org_member(org_id)));

drop policy if exists opportunities_org_member_update on public.opportunities;
create policy opportunities_org_member_update on public.opportunities
  for update to authenticated
  using ((select app_private.is_org_member(org_id)))
  with check ((select app_private.is_org_member(org_id)));

drop policy if exists opportunities_org_member_delete on public.opportunities;
create policy opportunities_org_member_delete on public.opportunities
  for delete to authenticated
  using ((select app_private.is_org_member(org_id)));
