-- Growth Engine V2 baseline.
-- Fresh Supabase project only.
--
-- Seed policy:
-- - Seed Big Shoulders Restoration as the only organization.
-- - Seed required persona taxonomy, connection registry, app settings, and Arc connection.
-- - Do not seed placeholder companies, contacts, leads, campaigns, approvals, messages, or analytics.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  slug text not null unique check (length(btrim(slug)) > 0),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  branding jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

insert into public.organizations (name, slug, branding)
values (
  'Big Shoulders Restoration',
  'big-shoulders-restoration',
  '{"brandShortName":"BSR"}'::jsonb
);

create or replace function public.default_organization_id()
returns uuid
language sql
stable
as $$
  select id
  from public.organizations
  where slug = 'big-shoulders-restoration'
  limit 1
$$;


create type public.company_status as enum ('active', 'inactive', 'archived');
create type public.contact_status as enum ('active', 'inactive', 'do_not_contact', 'archived');
create type public.lead_status as enum ('new', 'validated', 'needs_review', 'qualified', 'converted', 'lost', 'archived');
create type public.routing_recommendation as enum ('target', 'elevated', 'downgraded', 'isolated', 'archived');
create type public.job_status as enum ('pending', 'scheduled', 'in_progress', 'completed', 'canceled');
create type public.outcome_status as enum ('pending', 'won', 'lost', 'paid', 'written_off');
create type public.crm_entity_type as enum ('company', 'contact', 'property', 'lead', 'job', 'outcome', 'campaign');
create type public.actor_kind as enum ('human', 'agent', 'system');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.task_status as enum ('open', 'in_progress', 'completed', 'canceled');
create type public.crm_activity_type as enum (
  'note_added',
  'status_changed',
  'call_logged',
  'email_logged',
  'sms_logged',
  'meeting_logged',
  'task_created',
  'task_completed',
  'record_created',
  'record_updated',
  'ai_recommendation',
  'approval_requested',
  'approval_decided',
  'converted',
  'file_added'
);

-- ---------- Foundation ----------

create table public.app_settings (
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  key text primary key check (length(btrim(key)) > 0),
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

create table public.connections (
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  provider text primary key check (provider in ('resend', 'instagram', 'facebook', 'linkedin', 'x')),
  kind text not null check (kind in ('email', 'social')),
  label text not null check (length(btrim(label)) > 0),
  enabled boolean not null default false,
  env_var text,
  config jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger connections_set_updated_at
before update on public.connections
for each row execute function public.set_updated_at();

create table public.agent_connections (
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  workspace_id text primary key default 'default',
  display_name text,
  agent_key text,
  webhook_url text,
  webhook_secret_ref text,
  enabled boolean not null default true,
  last_seen_at timestamptz,
  last_status text check (last_status is null or last_status in ('ok', 'error', 'unreachable')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger agent_connections_set_updated_at
before update on public.agent_connections
for each row execute function public.set_updated_at();

create table public.agent_api_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  workspace_id text not null default 'default',
  token_hash text not null unique,
  prefix text not null,
  label text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.persona_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  key text not null,
  label text not null,
  audience_type text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create trigger persona_definitions_set_updated_at
before update on public.persona_definitions
for each row execute function public.set_updated_at();

-- ---------- Brand Kit ----------

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  display_name text not null default '',
  legal_name text,
  tagline text,
  description text,
  industry text,
  website_url text,
  logo_url text,
  favicon_url text,
  short_mark text,
  service_areas jsonb not null default '[]'::jsonb,
  time_zone text,
  accent text not null default '#C8A24B',
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  motion text not null default 'standard' check (motion in ('standard', 'reduced')),
  tone text not null default 'balanced',
  voice_guidance text,
  preferred_phrases jsonb not null default '[]'::jsonb,
  banned_phrases jsonb not null default '[]'::jsonb,
  services jsonb not null default '[]'::jsonb,
  proof_points jsonb not null default '[]'::jsonb,
  guardrails jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

create trigger business_profiles_set_updated_at
before update on public.business_profiles
for each row execute function public.set_updated_at();

-- ---------- CRM core ----------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  persona text not null default 'unassigned_persona',
  status public.company_status not null default 'active',
  website_url text,
  phone text,
  email text,
  partner_tier text check (partner_tier is null or partner_tier in ('A', 'B', 'C')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  persona text not null default 'unassigned_persona',
  status public.contact_status not null default 'active',
  first_name text,
  last_name text,
  full_name text generated always as (
    nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) stored,
  email text,
  phone text,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_name_or_channel_check check (
    length(btrim(coalesce(first_name, ''))) > 0
    or length(btrim(coalesce(last_name, ''))) > 0
    or length(btrim(coalesce(email, ''))) > 0
    or length(btrim(coalesce(phone, ''))) > 0
  )
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  persona text not null default 'unassigned_persona',
  street_line_1 text not null check (length(btrim(street_line_1)) > 0),
  street_line_2 text,
  city text not null check (length(btrim(city)) > 0),
  state text not null check (length(btrim(state)) = 2),
  postal_code text not null check (length(btrim(postal_code)) > 0),
  property_type text check (
    property_type is null
    or property_type in ('single_family', 'multi_family', 'condo', 'commercial', 'industrial', 'hoa', 'other')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  persona text not null default 'unassigned_persona',
  restoration_focus text,
  status text not null default 'draft',
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid,
  owner text,
  objective text,
  audience_summary text,
  offer_summary text,
  compliance_notes text,
  launch_locked boolean not null default true,
  source_signal jsonb not null default '{}'::jsonb,
  source_system text,
  reasoning_payload jsonb not null default '{}'::jsonb,
  audit_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  persona text not null,
  status public.lead_status not null default 'new',
  routing_recommendation public.routing_recommendation not null default 'target',
  source text not null check (length(btrim(source)) > 0),
  external_lead_id text,
  loss_summary text,
  loss_signals text[] not null default '{}'::text[],
  matched_target_keywords text[] not null default '{}'::text[],
  matched_non_target_keywords text[] not null default '{}'::text[],
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  attributed_campaign_id uuid references public.campaigns(id) on delete set null,
  attributed_asset_id uuid,
  attribution_channel text,
  attribution_method text,
  attribution_utm jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_persona_not_unassigned_check check (persona <> 'unassigned_persona'),
  constraint leads_relationship_present_check check (
    contact_id is not null
    or property_id is not null
    or company_id is not null
  )
);

alter table public.campaigns
  add constraint campaigns_lead_id_fkey foreign key (lead_id) references public.leads(id) on delete set null;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  persona text not null default 'unassigned_persona',
  status public.job_status not null default 'pending',
  job_number text unique,
  scheduled_at timestamptz,
  completed_at timestamptz,
  estimated_revenue_cents bigint check (estimated_revenue_cents is null or estimated_revenue_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_completion_after_schedule_check check (
    completed_at is null
    or scheduled_at is null
    or completed_at >= scheduled_at
  )
);

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  persona text not null default 'unassigned_persona',
  status public.outcome_status not null default 'pending',
  gross_revenue_cents bigint check (gross_revenue_cents is null or gross_revenue_cents >= 0),
  gross_margin_cents bigint,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outcomes_source_present_check check (
    job_id is not null
    or lead_id is not null
  )
);

create trigger companies_set_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger contacts_set_updated_at before update on public.contacts for each row execute function public.set_updated_at();
create trigger properties_set_updated_at before update on public.properties for each row execute function public.set_updated_at();
create trigger campaigns_set_updated_at before update on public.campaigns for each row execute function public.set_updated_at();
create trigger leads_set_updated_at before update on public.leads for each row execute function public.set_updated_at();
create trigger jobs_set_updated_at before update on public.jobs for each row execute function public.set_updated_at();
create trigger outcomes_set_updated_at before update on public.outcomes for each row execute function public.set_updated_at();

-- ---------- CRM activity ----------

create table public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type not null,
  entity_id uuid not null,
  body text not null check (length(btrim(body)) > 0),
  is_pinned boolean not null default false,
  is_internal boolean not null default true,
  author_kind public.actor_kind not null default 'human',
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type,
  entity_id uuid,
  title text not null check (length(btrim(title)) > 0),
  description text,
  due_at timestamptz,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'open',
  assignee_kind public.actor_kind,
  assignee_name text,
  completed_at timestamptz,
  author_kind public.actor_kind not null default 'human',
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_tasks_entity_pairing check (
    (entity_type is null and entity_id is null)
    or (entity_type is not null and entity_id is not null)
  )
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type not null,
  entity_id uuid not null,
  activity_type public.crm_activity_type not null,
  summary text not null check (length(btrim(summary)) > 0),
  detail text,
  actor_kind public.actor_kind not null default 'human',
  actor_name text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.engagement_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type,
  entity_id uuid,
  event_type text not null,
  channel text,
  summary text,
  occurred_at timestamptz not null default now(),
  source_system text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create trigger crm_notes_set_updated_at before update on public.crm_notes for each row execute function public.set_updated_at();
create trigger crm_tasks_set_updated_at before update on public.crm_tasks for each row execute function public.set_updated_at();

-- ---------- Campaigns and approvals ----------

create table public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  asset_type text not null,
  channel text,
  title text not null,
  status text not null default 'draft',
  tool_source text,
  source_system text,
  prompt_input text,
  prompt_inputs jsonb not null default '{}'::jsonb,
  draft_body text,
  edited_body text,
  approved_body text,
  approved_by text,
  approved_at timestamptz,
  dispatch_locked boolean not null default true,
  compliance_notes text,
  reasoning_payload jsonb not null default '{}'::jsonb,
  audit_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads
  add constraint leads_attributed_asset_id_fkey foreign key (attributed_asset_id) references public.campaign_assets(id) on delete set null;

create table public.approval_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  item_type text not null,
  status text not null default 'pending_approval',
  approval_required boolean not null default true,
  locked_until_approved boolean not null default true,
  prompt_inputs jsonb not null default '{}'::jsonb,
  draft_output text,
  edited_output text,
  requested_by text,
  reviewed_by text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  risk_level text not null default 'medium',
  compliance_notes text,
  decision_notes text,
  reasoning_payload jsonb not null default '{}'::jsonb,
  audit_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  approval_item_id uuid not null references public.approval_items(id) on delete cascade,
  decision text not null,
  decided_by text,
  decided_at timestamptz not null default now(),
  decision_notes text,
  previous_status text,
  next_status text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.approval_recommendations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  approval_item_id uuid not null references public.approval_items(id) on delete cascade,
  recommendation text not null,
  confidence_score numeric,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  event_type text not null,
  actor text,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.campaign_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  provider text,
  external_id text,
  channel text,
  occurred_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create trigger campaign_assets_set_updated_at before update on public.campaign_assets for each row execute function public.set_updated_at();
create trigger approval_items_set_updated_at before update on public.approval_items for each row execute function public.set_updated_at();

-- ---------- Agents, Arc, and Vault ----------

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  status text not null default 'active',
  allowed_actions jsonb not null default '[]'::jsonb,
  blocked_actions jsonb not null default '[]'::jsonb,
  default_approval_policy text not null default 'approval_required',
  system_instructions text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  status text not null default 'queued',
  priority text not null default 'normal',
  objective text not null,
  task_type text,
  source_type text,
  source_id uuid,
  campaign_id uuid references public.campaigns(id) on delete set null,
  persona_snapshot_id uuid,
  approval_item_id uuid references public.approval_items(id) on delete set null,
  due_at timestamptz,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_task_inputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  input_type text not null,
  source_table text,
  source_id uuid,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.agent_outputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  task_id uuid references public.agent_tasks(id) on delete cascade,
  approval_item_id uuid references public.approval_items(id) on delete set null,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  output_type text not null,
  title text,
  body text,
  edited_body text,
  structured_payload jsonb not null default '{}'::jsonb,
  risk_level text not null default 'low',
  compliance_status text not null default 'not_checked',
  approval_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_run_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  task_id uuid references public.agent_tasks(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  run_status text not null,
  model_provider text,
  model_name text,
  input_token_count integer,
  output_token_count integer,
  cost_estimate_cents integer,
  reasoning_summary text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table public.arc_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  operator text not null,
  title text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  project_id uuid,
  campaign_id uuid references public.campaigns(id) on delete set null,
  pinned_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.arc_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.arc_conversations(id) on delete cascade,
  role text not null check (role in ('operator', 'arc', 'system')),
  body text not null default '',
  status text not null default 'sent' check (status in ('sent', 'pending', 'complete', 'failed')),
  agent_task_id uuid references public.agent_tasks(id) on delete set null,
  mentions jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.vault_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  slug text not null,
  title text not null,
  body text not null default '',
  collection text,
  pinned boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create trigger agents_set_updated_at before update on public.agents for each row execute function public.set_updated_at();
create trigger agent_tasks_set_updated_at before update on public.agent_tasks for each row execute function public.set_updated_at();
create trigger agent_outputs_set_updated_at before update on public.agent_outputs for each row execute function public.set_updated_at();
create trigger arc_conversations_set_updated_at before update on public.arc_conversations for each row execute function public.set_updated_at();
create trigger vault_notes_set_updated_at before update on public.vault_notes for each row execute function public.set_updated_at();

-- ---------- Knowledge and guardrails ----------

create table public.persona_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type not null,
  entity_id uuid not null,
  persona text not null,
  hyper_persona_summary text,
  relationship_stage text,
  value_tier text,
  dominant_loss_pattern text,
  preferred_channel text,
  message_posture text,
  recommended_offer text,
  next_best_action text,
  confidence_score numeric,
  risk_flags text[] not null default '{}'::text[],
  situation_context jsonb not null default '{}'::jsonb,
  relationship_context jsonb not null default '{}'::jsonb,
  behavior_context jsonb not null default '{}'::jsonb,
  value_context jsonb not null default '{}'::jsonb,
  channel_context jsonb not null default '{}'::jsonb,
  message_context jsonb not null default '{}'::jsonb,
  capacity_context jsonb not null default '{}'::jsonb,
  reasoning_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_tasks
  add constraint agent_tasks_persona_snapshot_id_fkey foreign key (persona_snapshot_id) references public.persona_snapshots(id) on delete set null;

create table public.persona_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  persona text not null,
  entry_type text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.next_best_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type not null,
  entity_id uuid not null,
  action_type text not null,
  title text not null,
  rationale text,
  status text not null default 'suggested',
  priority text not null default 'normal',
  source_agent_id uuid references public.agents(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guardrail_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  key text not null,
  label text not null,
  severity text not null default 'medium',
  pattern text,
  instructions text,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create trigger persona_snapshots_set_updated_at before update on public.persona_snapshots for each row execute function public.set_updated_at();
create trigger persona_knowledge_entries_set_updated_at before update on public.persona_knowledge_entries for each row execute function public.set_updated_at();
create trigger next_best_actions_set_updated_at before update on public.next_best_actions for each row execute function public.set_updated_at();
create trigger guardrail_rules_set_updated_at before update on public.guardrail_rules for each row execute function public.set_updated_at();

-- ---------- Indexes ----------

create index companies_org_id_idx on public.companies(org_id);
create index companies_persona_idx on public.companies(persona);
create index companies_status_idx on public.companies(status);
create index contacts_org_id_idx on public.contacts(org_id);
create index contacts_company_id_idx on public.contacts(company_id);
create index contacts_persona_idx on public.contacts(persona);
create index contacts_email_idx on public.contacts(email) where email is not null;
create index properties_org_id_idx on public.properties(org_id);
create index properties_company_id_idx on public.properties(company_id);
create index properties_contact_id_idx on public.properties(contact_id);
create index properties_address_idx on public.properties(city, state, postal_code);
create index leads_org_id_idx on public.leads(org_id);
create index leads_company_id_idx on public.leads(company_id);
create index leads_contact_id_idx on public.leads(contact_id);
create index leads_property_id_idx on public.leads(property_id);
create index leads_persona_idx on public.leads(persona);
create index leads_status_idx on public.leads(status);
create index leads_received_at_idx on public.leads(received_at desc);
create unique index leads_source_external_id_idx on public.leads(org_id, source, external_lead_id) where external_lead_id is not null;
create index jobs_org_id_idx on public.jobs(org_id);
create index jobs_lead_id_idx on public.jobs(lead_id);
create index outcomes_org_id_idx on public.outcomes(org_id);
create index outcomes_lead_id_idx on public.outcomes(lead_id);
create index campaigns_org_id_idx on public.campaigns(org_id);
create index campaigns_status_idx on public.campaigns(status);
create index campaigns_updated_at_idx on public.campaigns(updated_at desc);
create index campaign_assets_campaign_id_idx on public.campaign_assets(campaign_id);
create index approval_items_status_idx on public.approval_items(org_id, status, submitted_at desc);
create index approval_items_campaign_id_idx on public.approval_items(campaign_id);
create index approval_decisions_item_idx on public.approval_decisions(approval_item_id, decided_at desc);
create index campaign_events_campaign_idx on public.campaign_events(campaign_id, occurred_at desc);
create index campaign_results_campaign_idx on public.campaign_results(campaign_id, occurred_at desc);
create index crm_notes_entity_idx on public.crm_notes(org_id, entity_type, entity_id, created_at desc);
create index crm_tasks_entity_idx on public.crm_tasks(org_id, entity_type, entity_id, due_at);
create index crm_tasks_status_idx on public.crm_tasks(org_id, status, due_at);
create index crm_activities_entity_idx on public.crm_activities(org_id, entity_type, entity_id, occurred_at desc);
create index engagement_events_entity_idx on public.engagement_events(org_id, entity_type, entity_id, occurred_at desc);
create index agent_tasks_status_idx on public.agent_tasks(org_id, status, priority, created_at desc);
create index agent_outputs_task_idx on public.agent_outputs(task_id, created_at desc);
create index arc_conversations_operator_idx on public.arc_conversations(org_id, operator, status, last_message_at desc);
create index arc_messages_conversation_idx on public.arc_messages(conversation_id, created_at);
create index persona_snapshots_entity_idx on public.persona_snapshots(org_id, entity_type, entity_id, updated_at desc);
create index next_best_actions_entity_idx on public.next_best_actions(org_id, entity_type, entity_id, status, created_at desc);

-- ---------- RLS and explicit grants ----------

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'organizations',
    'app_settings',
    'connections',
    'agent_connections',
    'agent_api_tokens',
    'persona_definitions',
    'business_profiles',
    'companies',
    'contacts',
    'properties',
    'campaigns',
    'leads',
    'jobs',
    'outcomes',
    'crm_notes',
    'crm_tasks',
    'crm_activities',
    'engagement_events',
    'campaign_assets',
    'approval_items',
    'approval_decisions',
    'approval_recommendations',
    'campaign_events',
    'campaign_results',
    'agents',
    'agent_tasks',
    'agent_task_inputs',
    'agent_outputs',
    'agent_run_logs',
    'arc_conversations',
    'arc_messages',
    'vault_notes',
    'persona_snapshots',
    'persona_knowledge_entries',
    'next_best_actions',
    'guardrail_rules'
  ] loop
    execute format('alter table public.%I enable row level security;', tbl);
    execute format('grant select, insert, update, delete on public.%I to service_role;', tbl);
  end loop;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- ---------- Allowed seed rows ----------

insert into public.app_settings (key, value) values
  ('workspace_name', '"Big Shoulders"'::jsonb),
  ('product_label', '"Marketing"'::jsonb),
  ('assistant_name', '"Arc"'::jsonb),
  ('brand_short_name', '"BSR"'::jsonb),
  ('brand_favicon_url', '"/icon.svg"'::jsonb),
  ('arc_default_mode', '"act"'::jsonb),
  ('arc_default_route', '"fast"'::jsonb),
  ('appearance_accent', '"gold"'::jsonb),
  ('appearance_density', '"comfortable"'::jsonb),
  ('appearance_motion', '"standard"'::jsonb);

insert into public.connections (provider, kind, label, env_var, config) values
  ('resend', 'email', 'Resend', 'RESEND_API_KEY', '{"requiredEnvVars":["RESEND_API_KEY"]}'::jsonb),
  ('instagram', 'social', 'Instagram', 'META_PAGE_ACCESS_TOKEN', '{"requiredEnvVars":["META_APP_ID","META_APP_SECRET","META_IG_USER_ID","META_PAGE_ACCESS_TOKEN"]}'::jsonb),
  ('facebook', 'social', 'Facebook', 'META_PAGE_ACCESS_TOKEN', '{"requiredEnvVars":["META_APP_ID","META_APP_SECRET","META_PAGE_ID","META_PAGE_ACCESS_TOKEN"]}'::jsonb),
  ('linkedin', 'social', 'LinkedIn', 'LINKEDIN_ACCESS_TOKEN', '{"requiredEnvVars":["LINKEDIN_ACCESS_TOKEN","LINKEDIN_ORG_URN"]}'::jsonb),
  ('x', 'social', 'X', 'X_API_KEY', '{"requiredEnvVars":["X_API_KEY","X_API_SECRET","X_ACCESS_TOKEN","X_ACCESS_TOKEN_SECRET"]}'::jsonb);

insert into public.agent_connections (workspace_id, display_name, agent_key, enabled)
values ('default', 'Arc', 'arc', true);

insert into public.persona_definitions (key, label, audience_type, sort_order) values
  ('persona_homeowner_emergency', 'Homeowner Emergency', 'homeowner', 10),
  ('persona_homeowner_preventative', 'Homeowner Preventative', 'homeowner', 20),
  ('persona_homeowner_rebuild', 'Homeowner Rebuild', 'homeowner', 30),
  ('persona_landlord', 'Landlord', 'property', 40),
  ('persona_hoa_board', 'HOA Board', 'property', 50),
  ('persona_property_manager', 'Property Manager', 'property', 60),
  ('persona_insurance_agent', 'Insurance Agent', 'insurance', 70),
  ('persona_listing_agent', 'Listing Agent', 'real_estate', 80),
  ('persona_buyers_agent', 'Buyer''s Agent', 'real_estate', 90),
  ('persona_plumbing_partner', 'Plumbing Partner', 'trade_partner', 100),
  ('persona_hvac_roof_electrical_partner', 'HVAC, Roof, Electrical Partner', 'trade_partner', 110),
  ('persona_gc_remodeler_partner', 'GC / Remodeler Partner', 'trade_partner', 120);

insert into public.agents (key, name, description, blocked_actions, default_approval_policy)
values (
  'arc',
  'Arc',
  'Default Growth Engine assistant for internal marketing operations.',
  '["send_email","send_sms","publish_social","launch_ads","modify_public_site"]'::jsonb,
  'approval_required'
);
