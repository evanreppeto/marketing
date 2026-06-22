-- Make vault_notes part of the org tenant boundary.
--
-- vault_notes shipped without an org_id, so notes were global: they leaked across
-- orgs through the Vault list, the Arc @-mention catalog, and the needs-review
-- badge. (Confirmed 2026-06-22: prod vault_notes has no org_id column, so this is
-- a real additive change, not a no-op.) Backfill existing notes into the default
-- org, then require org_id and scope slug uniqueness per org.
--
-- NOTE: the slug-unique constraint dropped below is the one Postgres auto-named
-- for `slug text not null unique` at table creation (vault_notes_slug_key). If a
-- target DB named it differently, verify before applying.

alter table public.vault_notes
  add column if not exists org_id uuid;

update public.vault_notes
set org_id = public.default_organization_id()
where org_id is null;

alter table public.vault_notes
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table public.vault_notes
  drop constraint if exists vault_notes_org_id_fkey;
alter table public.vault_notes
  add constraint vault_notes_org_id_fkey
  foreign key (org_id) references public.organizations(id) on delete cascade;

-- Slug is unique per org, not globally, so two orgs can both have e.g.
-- "emergency-homeowner-playbook".
alter table public.vault_notes drop constraint if exists vault_notes_slug_key;
create unique index if not exists vault_notes_org_slug_key
  on public.vault_notes(org_id, slug);

create index if not exists vault_notes_org_idx on public.vault_notes(org_id);

-- Complete the org RLS boundary (20260618185612 tried to add this policy but
-- couldn't, since org_id didn't exist yet). The app reads via service-role and
-- also scopes in app code; this is defense-in-depth for direct authenticated access.
grant select on public.vault_notes to authenticated;
drop policy if exists vault_notes_org_member_select on public.vault_notes;
create policy vault_notes_org_member_select
on public.vault_notes for select
to authenticated
using ((select app_private.is_org_member(org_id)));
