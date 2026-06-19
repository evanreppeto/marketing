-- Add organization scope to competitor campaign intelligence.
-- Arc tokens now send org-scoped competitor intel writes through the API.

alter table if exists public.competitor_campaigns
  add column if not exists org_id uuid;

update public.competitor_campaigns
set org_id = public.default_organization_id()
where org_id is null;

alter table if exists public.competitor_campaigns
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table if exists public.competitor_campaigns
  drop constraint if exists competitor_campaigns_org_id_fkey;

alter table if exists public.competitor_campaigns
  add constraint competitor_campaigns_org_id_fkey
  foreign key (org_id) references public.organizations(id) on delete restrict;

create index if not exists competitor_campaigns_org_captured_idx
  on public.competitor_campaigns(org_id, captured_at desc);
