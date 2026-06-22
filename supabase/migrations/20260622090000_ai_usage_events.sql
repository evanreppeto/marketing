-- AI usage ledger: one row per AI action the app runs (Arc/Claude turns + Gemini
-- media generations), scoped by workspace + org. Cost is computed at write time
-- by the app layer and stored, so historical rows stay correct after price changes.
-- Pure observability — no outbound behavior depends on this table.

create type public.ai_usage_service as enum ('arc_claude', 'gemini_image', 'gemini_video');

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  actor_user text,
  service public.ai_usage_service not null,
  model text not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  units integer check (units is null or units >= 0),
  cost_estimate_cents integer not null default 0 check (cost_estimate_cents >= 0),
  task_id uuid references public.agent_tasks(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index ai_usage_events_workspace_occurred_idx
  on public.ai_usage_events (workspace_id, occurred_at desc);
create index ai_usage_events_org_occurred_idx
  on public.ai_usage_events (org_id, occurred_at desc);
create index ai_usage_events_service_idx
  on public.ai_usage_events (service);

-- Keep RLS enabled with no permissive policies (server code uses service_role).
-- Every other public table does this; without it the anon grant below would
-- expose the whole cross-workspace ledger via the PostgREST data API.
alter table public.ai_usage_events enable row level security;

-- Mirror the data-API role grants used by the rest of the public schema.
grant select, insert, update, delete on public.ai_usage_events to service_role;
grant select on public.ai_usage_events to anon, authenticated;
