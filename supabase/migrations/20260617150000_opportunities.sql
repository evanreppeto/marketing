-- Opportunity Inbox: source-backed opportunities Arc detects for human review.
-- Org-scoped; nothing here goes outbound. status drives the inbox lifecycle.
create type public.opportunity_kind as enum ('crm_inactivity');
create type public.opportunity_urgency as enum ('low', 'medium', 'high');
create type public.opportunity_status as enum ('pending', 'drafting', 'drafted', 'dismissed', 'snoozed');

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.opportunity_kind not null,
  subject_type public.crm_entity_type not null,
  subject_id uuid not null,
  title text not null check (length(btrim(title)) > 0),
  summary text not null default '',
  confidence integer not null default 0 check (confidence between 0 and 100),
  urgency public.opportunity_urgency not null default 'medium',
  evidence jsonb not null default '{}'::jsonb,
  recommended_action text not null default '',
  recommended_campaign_type text,
  status public.opportunity_status not null default 'pending',
  campaign_id uuid references public.campaigns(id) on delete set null,
  agent_task_id uuid,
  detected_by text not null default 'arc',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dismissed_at timestamptz,
  snoozed_until timestamptz
);

-- One OPEN opportunity per (org, kind, subject) — dedup safety net for re-scans.
create unique index opportunities_open_unique
  on public.opportunities (org_id, kind, subject_type, subject_id)
  where status in ('pending', 'drafting', 'drafted');

create index opportunities_inbox_idx
  on public.opportunities (org_id, status, urgency, created_at desc);

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

alter table public.opportunities enable row level security;
grant select, insert, update, delete on public.opportunities to service_role;
