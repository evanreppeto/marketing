-- Append-only ledger of the Arc/Arc agent's recommendations on approval
-- items. Arc may advise but NEVER decides: approval_items.status and the
-- approval_decisions ledger are untouched by the agent API. This table records
-- guidance only — outbound stays locked behind the human approval gate.
--
-- Grants come from the schema-wide `alter default privileges` in
-- 20260529133000_data_api_role_grants.sql (service_role gets full DML; anon /
-- authenticated get select), so no per-table grant is needed here.

create table public.approval_recommendations (
  id uuid primary key default gen_random_uuid(),
  approval_item_id uuid not null references public.approval_items(id) on delete cascade,
  agent text not null default 'arc' check (length(btrim(agent)) > 0),
  recommendation text not null check (length(btrim(recommendation)) > 0),
  rationale text,
  risk_flags text[] not null default '{}',
  suggested_edits text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index approval_recommendations_item_idx
  on public.approval_recommendations (approval_item_id, created_at desc);

alter table public.approval_recommendations enable row level security;
