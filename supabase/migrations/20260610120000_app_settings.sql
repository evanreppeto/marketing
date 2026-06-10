-- App settings: a small key/value store for operator-editable app preferences
-- (workspace name, support email, Mark webhook on/off). Extensible — new settings
-- are new keys, no schema change.
--
-- NEVER stores secrets. Deployment secrets (API tokens, Supabase keys, operator
-- credentials) stay in environment variables. Reuses the shared set_updated_at()
-- trigger from earlier migrations.

create table public.app_settings (
  key        text primary key check (length(btrim(key)) > 0),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

-- Seed defaults so the rows exist; the read-model also falls back to these.
insert into public.app_settings (key, value) values
  ('workspace_name',      '"Big Shoulders Restoration M&P"'::jsonb),
  ('support_email',       '""'::jsonb),
  ('mark_webhook_enabled', 'true'::jsonb)
on conflict (key) do nothing;
