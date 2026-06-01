-- Phase 1A: activity events, routing decisions, integrity findings.
-- Reuses set_updated_at() defined in 20260527131500_initial_growth_engine_schema.sql.

create type public.event_subject_type as enum (
  'company',
  'contact',
  'property',
  'lead',
  'job',
  'outcome'
);

create type public.routing_decision_kind as enum (
  'mitigation',
  'review',
  'out_of_scope',
  'archived'
);

create type public.integrity_severity as enum (
  'info',
  'warning',
  'blocking'
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  actor text not null check (length(btrim(actor)) > 0),
  subject_type public.event_subject_type not null,
  subject_id uuid not null,
  type text not null check (length(btrim(type)) > 0),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index events_subject_idx on public.events(subject_type, subject_id, occurred_at desc);
create index events_type_idx on public.events(type, occurred_at desc);
create index events_occurred_at_idx on public.events(occurred_at desc);

create table public.routing_decisions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  decision public.routing_decision_kind not null,
  confidence integer not null check (confidence between 0 and 100),
  sla_target_minutes integer check (sla_target_minutes is null or sla_target_minutes >= 0),
  decided_by text not null check (length(btrim(decided_by)) > 0),
  decided_at timestamptz not null default now(),
  rationale jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index routing_decisions_lead_id_idx on public.routing_decisions(lead_id, decided_at desc);
create index routing_decisions_decision_idx on public.routing_decisions(decision, decided_at desc);

create table public.integrity_findings (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null check (length(btrim(rule_key)) > 0),
  subject_type public.event_subject_type not null,
  subject_id uuid not null,
  severity public.integrity_severity not null default 'warning',
  detail jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrity_findings_resolved_after_detected_check check (
    resolved_at is null or resolved_at >= detected_at
  )
);

create unique index integrity_findings_open_unique_idx
  on public.integrity_findings(rule_key, subject_type, subject_id)
  where resolved_at is null;

create index integrity_findings_subject_idx
  on public.integrity_findings(subject_type, subject_id);

create index integrity_findings_severity_idx
  on public.integrity_findings(severity)
  where resolved_at is null;

create trigger integrity_findings_set_updated_at
before update on public.integrity_findings
for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.routing_decisions enable row level security;
alter table public.integrity_findings enable row level security;
