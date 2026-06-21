-- Generic, org-scoped personas for the Personas console (product-wide, not
-- BSR-specific). Each org defines its own audiences; the app reads these and
-- falls back to a neutral demo set when none exist yet. Accessed via the
-- service-role admin client, like the other wired feature tables.

create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  slug text not null,
  name text not null,
  initials text not null default '',
  segment text not null default 'acquisition',
  stage text not null default 'New',
  score integer not null default 50,
  signals jsonb not null default '{}'::jsonb,
  signal_drivers jsonb not null default '{}'::jsonb,
  audience_share integer not null default 0,
  score_trend jsonb not null default '[]'::jsonb,
  live boolean not null default false,
  quote text not null default '',
  profile text not null default '',
  goals jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  angle text not null default '',
  audience text not null default '',
  cta text not null default '',
  channel text not null default '',
  best_timing text not null default '',
  next_action text not null default '',
  proof_points jsonb not null default '[]'::jsonb,
  sample_message jsonb not null default '{}'::jsonb,
  arc_activity jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug),
  constraint personas_score_range check (score between 0 and 100),
  constraint personas_segment_check check (segment in ('acquisition', 'engagement', 'retention'))
);

create index if not exists personas_org_idx on public.personas (org_id);

comment on table public.personas is
  'Org-scoped audience personas for the generic Personas console. Read via src/lib/personas/console.ts (falls back to a neutral demo set when empty); written via src/lib/personas/persistence.ts behind requireOperator().';

-- Service-role admin client bypasses RLS; deny everything else by default.
alter table public.personas enable row level security;
