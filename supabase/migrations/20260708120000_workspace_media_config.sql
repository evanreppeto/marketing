-- supabase/migrations/20260708120000_workspace_media_config.sql
-- Per-workspace media generation config (Layer 2 of model selection — see
-- docs/MODEL-SELECTION.md). One row per workspace holding the operator's choices
-- for how Arc generates media: per-category default model (or "auto"), plus the
-- generation-default toggles (auto-pick, default aspect, prefer-real-media,
-- allow-video). Stored as a single `config` jsonb; the shape lives in the app
-- layer (src/domain/media-config.ts) and is validated on read, so the DB stays
-- stable as the config grows.
--
-- Written only by the service-role client from a requireOperator()-gated action
-- and read back by the bearer-gated runner route — same trust boundary as
-- workspace_connectors (20260623120000), whose keying (workspace_id) it mirrors.
-- Reuses the shared set_updated_at() trigger function.

create table if not exists public.workspace_media_config (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  org_id       uuid,
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id)
);

create index if not exists workspace_media_config_workspace_idx on public.workspace_media_config(workspace_id);

alter table public.workspace_media_config enable row level security;

drop trigger if exists workspace_media_config_set_updated_at on public.workspace_media_config;
create trigger workspace_media_config_set_updated_at
before update on public.workspace_media_config
for each row execute function public.set_updated_at();
