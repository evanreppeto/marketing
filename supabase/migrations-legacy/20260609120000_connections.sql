-- Connections registry: the operator-facing control surface for outbound
-- integrations (Resend email today; social providers as placeholders for Spec 2).
--
-- IMPORTANT: this table NEVER stores secrets. The live secret lives in an env var
-- (named by `env_var`, e.g. RESEND_API_KEY); this row only tracks the operator
-- kill-switch (`enabled`), non-secret config (from-address), and test/use telemetry.
-- Operator-facing status (not_configured / disabled / error / connected) is COMPUTED
-- from env presence + enabled + last_test_ok in the read-model, never stored here.
--
-- Distinct from `social_accounts` (20260529120000): that table will hold per-account
-- connected social records (Spec 2); this is the higher-level provider registry/toggle.
-- Reuses the shared set_updated_at() trigger function from earlier migrations.

create type public.connection_provider as enum (
  'resend',
  'instagram',
  'facebook',
  'linkedin',
  'x'
);

create type public.connection_kind as enum (
  'email',
  'social'
);

create table public.connections (
  id              uuid primary key default gen_random_uuid(),
  provider        public.connection_provider not null unique,
  kind            public.connection_kind not null,
  label           text not null check (length(btrim(label)) > 0),
  enabled         boolean not null default false,
  env_var         text,
  config          jsonb not null default '{}'::jsonb,
  last_tested_at  timestamptz,
  last_test_ok    boolean,
  last_test_error text,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index connections_kind_idx on public.connections(kind);

alter table public.connections enable row level security;

create trigger connections_set_updated_at
before update on public.connections
for each row execute function public.set_updated_at();

-- Seed one row per registry provider. Resend is configurable today; the social
-- providers are placeholders (no env var, disabled) until Spec 2 wires transport.
insert into public.connections (provider, kind, label, env_var) values
  ('resend',    'email',  'Resend',    'RESEND_API_KEY'),
  ('instagram', 'social', 'Instagram', null),
  ('facebook',  'social', 'Facebook',  null),
  ('linkedin',  'social', 'LinkedIn',  null),
  ('x',         'social', 'X',         null);
