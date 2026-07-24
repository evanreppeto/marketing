-- Waitlist for the public landing page: pre-pricing interest capture.
-- Service-role only — the public API route writes through the admin client;
-- no anon/authenticated access (RLS on, no policies).
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'landing',
  created_at timestamptz not null default now()
);

create unique index if not exists waitlist_signups_email_key
  on public.waitlist_signups (lower(email));

alter table public.waitlist_signups enable row level security;

revoke all on public.waitlist_signups from anon, authenticated;
