-- Brand Kit foundation: per-org business profile + persona definitions.
-- Industry-agnostic. Does NOT relax the persona_mapping enum (see spec §3.3);
-- arbitrary per-org persona keys arrive with the v2 baseline cutover.

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  display_name text not null default '',
  legal_name text,
  tagline text,
  description text,
  industry text,
  website_url text,
  logo_url text,
  favicon_url text,
  short_mark text,
  service_areas jsonb not null default '[]'::jsonb,
  time_zone text,
  accent text not null default '#C8A24B',
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  motion text not null default 'standard' check (motion in ('standard', 'reduced')),
  tone text not null default 'balanced',
  voice_guidance text,
  preferred_phrases jsonb not null default '[]'::jsonb,
  banned_phrases jsonb not null default '[]'::jsonb,
  services jsonb not null default '[]'::jsonb,
  proof_points jsonb not null default '[]'::jsonb,
  guardrails jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_profiles_set_updated_at
  before update on public.business_profiles
  for each row execute function public.set_updated_at();

-- Mirrors the v2 baseline persona_definitions shape. On legacy/prod these rows
-- describe the existing 12 enum persona keys; the enum itself is unchanged.
create table public.persona_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  label text not null,
  audience_type text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create trigger persona_definitions_set_updated_at
  before update on public.persona_definitions
  for each row execute function public.set_updated_at();

-- Isolation is enforced in the app layer via the service-role client (which
-- bypasses RLS). Enable RLS as defense-in-depth and grant the app role.
alter table public.business_profiles enable row level security;
alter table public.persona_definitions enable row level security;

grant select, insert, update, delete on public.business_profiles to service_role;
grant select, insert, update, delete on public.persona_definitions to service_role;
grant select on public.business_profiles, public.persona_definitions to anon, authenticated;
