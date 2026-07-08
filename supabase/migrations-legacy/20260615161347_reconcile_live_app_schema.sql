-- Reconcile the configured live Supabase database with the tables and columns
-- currently used by the app. This migration is intentionally additive and
-- idempotent because the live database has drifted from the historical local
-- migration chain: several existing tables use text status fields and org_id
-- defaults rather than the older enum-only definitions.

alter table if exists public.agent_tasks
  add column if not exists description text,
  add column if not exists owner_kind text not null default 'human'
    check (owner_kind in ('human', 'agent', 'system')),
  add column if not exists owner_label text not null default 'Operator'
    check (length(btrim(owner_label)) > 0),
  add column if not exists driver_kind text not null default 'agent'
    check (driver_kind in ('human', 'agent', 'system')),
  add column if not exists driver_agent_id uuid references public.agents(id) on delete set null,
  add column if not exists driver_label text not null default 'Arc'
    check (length(btrim(driver_label)) > 0),
  add column if not exists approver_label text not null default 'Owner'
    check (length(btrim(approver_label)) > 0);

create index if not exists agent_tasks_owner_kind_idx on public.agent_tasks(owner_kind);
create index if not exists agent_tasks_driver_kind_idx on public.agent_tasks(driver_kind);
create index if not exists agent_tasks_driver_agent_id_idx on public.agent_tasks(driver_agent_id);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete restrict,
  actor text not null check (length(btrim(actor)) > 0),
  subject_type text not null check (subject_type in ('company', 'contact', 'property', 'lead', 'job', 'outcome')),
  subject_id uuid not null,
  type text not null check (length(btrim(type)) > 0),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists events_org_occurred_at_idx on public.events(org_id, occurred_at desc);
create index if not exists events_subject_idx on public.events(subject_type, subject_id, occurred_at desc);
create index if not exists events_type_idx on public.events(type, occurred_at desc);

create table if not exists public.routing_decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete cascade,
  decision text not null check (decision in ('mitigation', 'review', 'out_of_scope', 'archived')),
  confidence numeric(5,4) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  sla_target_minutes integer check (sla_target_minutes is null or sla_target_minutes >= 0),
  decided_by text not null check (length(btrim(decided_by)) > 0),
  decided_at timestamptz not null default now(),
  rationale jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists routing_decisions_org_decided_at_idx on public.routing_decisions(org_id, decided_at desc);
create index if not exists routing_decisions_lead_id_idx on public.routing_decisions(lead_id, decided_at desc);
create index if not exists routing_decisions_decision_idx on public.routing_decisions(decision, decided_at desc);

create table if not exists public.integrity_findings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete restrict,
  rule_key text not null check (length(btrim(rule_key)) > 0),
  subject_type text not null check (subject_type in ('company', 'contact', 'property', 'lead', 'job', 'outcome')),
  subject_id uuid not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'blocking')),
  detail jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrity_findings_resolved_after_detected_check check (
    resolved_at is null or resolved_at >= detected_at
  )
);

create unique index if not exists integrity_findings_open_unique_idx
  on public.integrity_findings(rule_key, subject_type, subject_id)
  where resolved_at is null;
create index if not exists integrity_findings_org_detected_at_idx on public.integrity_findings(org_id, detected_at desc);
create index if not exists integrity_findings_subject_idx on public.integrity_findings(subject_type, subject_id);
create index if not exists integrity_findings_severity_idx on public.integrity_findings(severity) where resolved_at is null;

drop trigger if exists integrity_findings_set_updated_at on public.integrity_findings;
create trigger integrity_findings_set_updated_at
before update on public.integrity_findings
for each row execute function public.set_updated_at();

create table if not exists public.campaign_dispatches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete restrict,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  channel text,
  status text not null default 'queued'
    check (status in ('queued', 'scheduled', 'sent', 'delivered', 'failed', 'canceled')),
  scheduled_for timestamptz,
  dispatched_at timestamptz,
  recipient_summary text,
  audience_count integer check (audience_count is null or audience_count >= 0),
  result_note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.campaign_dispatches
  add column if not exists org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete restrict;

create index if not exists campaign_dispatches_org_updated_at_idx on public.campaign_dispatches(org_id, updated_at desc);
create index if not exists campaign_dispatches_campaign_idx on public.campaign_dispatches(campaign_id);
create index if not exists campaign_dispatches_status_idx on public.campaign_dispatches(status);

drop trigger if exists campaign_dispatches_set_updated_at on public.campaign_dispatches;
create trigger campaign_dispatches_set_updated_at
before update on public.campaign_dispatches
for each row execute function public.set_updated_at();

create table if not exists public.outbound_dispatches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete restrict,
  approval_item_id uuid references public.approval_items(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null check (length(btrim(channel)) > 0),
  status text not null default 'queued'
    check (status in ('blocked_pending_approval', 'blocked_compliance', 'queued', 'dispatched', 'delivered', 'failed', 'skipped', 'canceled')),
  idempotency_key text not null default gen_random_uuid()::text unique check (length(btrim(idempotency_key)) > 0),
  provider text,
  provider_message_id text,
  scheduled_for timestamptz,
  dispatched_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists outbound_dispatches_approval_once_idx
  on public.outbound_dispatches(approval_item_id, channel)
  where approval_item_id is not null and status in ('queued', 'dispatched');
create index if not exists outbound_dispatches_org_updated_at_idx on public.outbound_dispatches(org_id, updated_at desc);
create index if not exists outbound_dispatches_status_idx on public.outbound_dispatches(status, scheduled_for);
create index if not exists outbound_dispatches_contact_id_idx on public.outbound_dispatches(contact_id);

drop trigger if exists outbound_dispatches_set_updated_at on public.outbound_dispatches;
create trigger outbound_dispatches_set_updated_at
before update on public.outbound_dispatches
for each row execute function public.set_updated_at();

create table if not exists public.arc_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete restrict,
  operator text not null default 'Operator' check (length(btrim(operator)) > 0),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists arc_projects_org_operator_idx on public.arc_projects(org_id, operator, created_at);
create index if not exists arc_projects_operator_idx on public.arc_projects(operator, created_at);

drop trigger if exists arc_projects_set_updated_at on public.arc_projects;
create trigger arc_projects_set_updated_at
before update on public.arc_projects
for each row execute function public.set_updated_at();

alter table if exists public.arc_conversations
  add column if not exists project_id uuid references public.arc_projects(id) on delete set null,
  add column if not exists pinned_at timestamptz,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

create index if not exists arc_conversations_pin_idx
  on public.arc_conversations(operator, pinned_at desc nulls last, last_message_at desc);

create table if not exists public.arc_saved_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete restrict,
  operator text not null check (length(btrim(operator)) > 0),
  kind text not null check (kind in ('media', 'draft', 'angle')),
  title text,
  body text,
  media_url text,
  caption text,
  source_conversation_id uuid references public.arc_conversations(id) on delete set null,
  source_message_id uuid references public.arc_messages(id) on delete set null,
  source_campaign_id uuid references public.campaigns(id) on delete set null,
  source_asset_id uuid references public.campaign_assets(id) on delete set null,
  note text,
  promoted_campaign_id uuid references public.campaigns(id) on delete set null,
  promoted_asset_id uuid references public.campaign_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists arc_saved_items_org_operator_idx on public.arc_saved_items(org_id, operator, created_at desc);
create index if not exists arc_saved_items_operator_idx on public.arc_saved_items(operator, created_at desc);
create index if not exists arc_saved_items_kind_idx on public.arc_saved_items(kind);

drop trigger if exists arc_saved_items_set_updated_at on public.arc_saved_items;
create trigger arc_saved_items_set_updated_at
before update on public.arc_saved_items
for each row execute function public.set_updated_at();

create table if not exists public.agent_task_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete restrict,
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  actor_kind text not null check (actor_kind in ('human', 'agent', 'system', 'approval')),
  actor_label text not null check (length(btrim(actor_label)) > 0),
  event_type text not null check (
    event_type in (
      'comment',
      'instruction',
      'property_changed',
      'status_changed',
      'output_created',
      'approval_event',
      'system_event'
    )
  ),
  title text not null check (length(btrim(title)) > 0),
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_task_events_org_created_at_idx on public.agent_task_events(org_id, created_at desc);
create index if not exists agent_task_events_task_id_created_at_idx on public.agent_task_events(task_id, created_at desc);
create index if not exists agent_task_events_type_idx on public.agent_task_events(event_type);

alter table public.events enable row level security;
alter table public.routing_decisions enable row level security;
alter table public.integrity_findings enable row level security;
alter table public.campaign_dispatches enable row level security;
alter table public.outbound_dispatches enable row level security;
alter table public.arc_projects enable row level security;
alter table public.arc_saved_items enable row level security;
alter table public.agent_task_events enable row level security;

grant select, insert, update, delete on
  public.events,
  public.routing_decisions,
  public.integrity_findings,
  public.campaign_dispatches,
  public.outbound_dispatches,
  public.arc_projects,
  public.arc_saved_items,
  public.agent_task_events
to service_role;

grant select on
  public.events,
  public.routing_decisions,
  public.integrity_findings,
  public.campaign_dispatches,
  public.outbound_dispatches,
  public.arc_projects,
  public.arc_saved_items,
  public.agent_task_events
to anon, authenticated;
