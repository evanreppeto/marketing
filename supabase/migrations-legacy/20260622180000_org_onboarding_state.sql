-- First-run activation state, one row per organization. Tracks whether the owner
-- has captured their brand during setup and whether they've dismissed the home
-- "finish setting up" checklist. The other checklist items (media, campaign, team)
-- are derived from real data by the app layer, so they are not stored here.
-- Pure setup bookkeeping — no outbound behavior depends on this table.

create table public.org_onboarding_state (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  brand_captured_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep RLS enabled with no permissive policies (server code uses service_role).
-- Mirrors every other public table; without it the anon grant below would expose
-- onboarding state across orgs via the PostgREST data API.
alter table public.org_onboarding_state enable row level security;

-- Mirror the data-API role grants used by the rest of the public schema.
grant select, insert, update, delete on public.org_onboarding_state to service_role;
grant select on public.org_onboarding_state to anon, authenticated;
