-- Agent operations scaffold draft.
-- Adds visible, accountable agent work tables. Reuses approval_items from
-- 20260528162000_hyper_personalization_layer.sql for human review gates.

create type public.agent_status as enum (
  'draft',
  'ready',
  'running',
  'paused',
  'blocked',
  'disabled'
);

create type public.agent_task_status as enum (
  'queued',
  'running',
  'blocked',
  'needs_approval',
  'completed',
  'failed',
  'canceled'
);

create type public.agent_task_priority as enum (
  'low',
  'medium',
  'high',
  'urgent'
);

create type public.agent_risk_level as enum (
  'low',
  'medium',
  'high',
  'blocked'
);

create type public.agent_permission_type as enum (
  'allowed',
  'blocked'
);

create type public.agent_run_status as enum (
  'queued',
  'running',
  'completed',
  'failed',
  'canceled'
);

create type public.agent_tool_request_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'ready_to_run',
  'running',
  'completed',
  'failed',
  'rejected',
  'archived'
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (length(btrim(key)) > 0),
  name text not null check (length(btrim(name)) > 0),
  description text,
  status public.agent_status not null default 'draft',
  allowed_actions text[] not null default '{}'::text[],
  blocked_actions text[] not null default '{}'::text[],
  default_approval_policy text not null default 'owner_required',
  system_instructions text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  status public.agent_task_status not null default 'queued',
  priority public.agent_task_priority not null default 'medium',
  objective text not null check (length(btrim(objective)) > 0),
  task_type text not null check (length(btrim(task_type)) > 0),
  source_type text,
  source_id uuid,
  campaign_id uuid references public.campaigns(id) on delete set null,
  persona_snapshot_id uuid references public.persona_snapshots(id) on delete set null,
  approval_item_id uuid references public.approval_items(id) on delete set null,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  retry_count integer not null default 0 check (retry_count >= 0),
  max_retries integer not null default 2 check (max_retries >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_task_inputs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  input_type text not null check (length(btrim(input_type)) > 0),
  source_table text,
  source_id uuid,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.agent_outputs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  approval_item_id uuid references public.approval_items(id) on delete set null,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  output_type text not null check (length(btrim(output_type)) > 0),
  title text not null check (length(btrim(title)) > 0),
  body text,
  edited_body text,
  structured_payload jsonb not null default '{}'::jsonb,
  risk_level public.agent_risk_level not null default 'medium',
  compliance_status public.approval_status not null default 'pending_approval',
  approval_status public.approval_status not null default 'pending_approval',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_run_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.agent_tasks(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  run_status public.agent_run_status not null default 'queued',
  model_provider text,
  model_name text,
  input_token_count integer check (input_token_count is null or input_token_count >= 0),
  output_token_count integer check (output_token_count is null or output_token_count >= 0),
  cost_estimate_cents integer check (cost_estimate_cents is null or cost_estimate_cents >= 0),
  reasoning_summary text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  retry_count integer not null default 0 check (retry_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.agent_permissions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  permission_key text not null check (length(btrim(permission_key)) > 0),
  permission_type public.agent_permission_type not null,
  requires_approval boolean not null default true,
  created_at timestamptz not null default now(),
  unique (agent_id, permission_key)
);

create table public.agent_tool_requests (
  id uuid primary key default gen_random_uuid(),
  agent_task_id uuid references public.agent_tasks(id) on delete cascade,
  requested_by_agent_id uuid not null references public.agents(id) on delete cascade,
  approval_item_id uuid references public.approval_items(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  persona_snapshot_id uuid references public.persona_snapshots(id) on delete set null,
  tool_name text not null check (length(btrim(tool_name)) > 0),
  handoff_type text not null check (
    handoff_type in ('code', 'video', 'image', 'copy', 'review', 'research', 'strategy', 'compliance')
  ),
  status public.agent_tool_request_status not null default 'draft',
  approval_status public.approval_status not null default 'pending_approval',
  risk_level public.agent_risk_level not null default 'medium',
  crm_source_type text,
  crm_source_id uuid,
  prompt text,
  source_payload jsonb not null default '{}'::jsonb,
  result_url text,
  result_summary text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agents_status_idx on public.agents(status);
create index agent_tasks_agent_id_idx on public.agent_tasks(agent_id);
create index agent_tasks_status_idx on public.agent_tasks(status);
create index agent_tasks_priority_idx on public.agent_tasks(priority);
create index agent_tasks_campaign_id_idx on public.agent_tasks(campaign_id);
create index agent_tasks_persona_snapshot_id_idx on public.agent_tasks(persona_snapshot_id);
create index agent_tasks_approval_item_id_idx on public.agent_tasks(approval_item_id);
create index agent_task_inputs_task_id_idx on public.agent_task_inputs(task_id);
create index agent_outputs_task_id_idx on public.agent_outputs(task_id);
create index agent_outputs_approval_item_id_idx on public.agent_outputs(approval_item_id);
create index agent_outputs_campaign_asset_id_idx on public.agent_outputs(campaign_asset_id);
create index agent_outputs_approval_status_idx on public.agent_outputs(approval_status);
create index agent_outputs_risk_level_idx on public.agent_outputs(risk_level);
create index agent_run_logs_task_id_idx on public.agent_run_logs(task_id);
create index agent_run_logs_agent_id_idx on public.agent_run_logs(agent_id);
create index agent_run_logs_status_idx on public.agent_run_logs(run_status);
create index agent_permissions_agent_id_idx on public.agent_permissions(agent_id);
create index agent_permissions_key_idx on public.agent_permissions(permission_key);
create index agent_tool_requests_task_id_idx on public.agent_tool_requests(agent_task_id);
create index agent_tool_requests_agent_id_idx on public.agent_tool_requests(requested_by_agent_id);
create index agent_tool_requests_status_idx on public.agent_tool_requests(status);
create index agent_tool_requests_approval_status_idx on public.agent_tool_requests(approval_status);
create index agent_tool_requests_campaign_id_idx on public.agent_tool_requests(campaign_id);

alter table public.agents enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.agent_task_inputs enable row level security;
alter table public.agent_outputs enable row level security;
alter table public.agent_run_logs enable row level security;
alter table public.agent_permissions enable row level security;
alter table public.agent_tool_requests enable row level security;

create trigger agents_set_updated_at
before update on public.agents
for each row execute function public.set_updated_at();

create trigger agent_tasks_set_updated_at
before update on public.agent_tasks
for each row execute function public.set_updated_at();

create trigger agent_outputs_set_updated_at
before update on public.agent_outputs
for each row execute function public.set_updated_at();

create trigger agent_tool_requests_set_updated_at
before update on public.agent_tool_requests
for each row execute function public.set_updated_at();

-- Seed the first visible agent roles. These are configuration rows only.
insert into public.agents (key, name, description, status, allowed_actions, blocked_actions, default_approval_policy, system_instructions)
values
  (
    'persona-intelligence',
    'Persona Intelligence Agent',
    'Creates and refreshes hyper-persona snapshots for CRM records and campaigns.',
    'ready',
    array['summarize_records', 'draft_persona_snapshot', 'recommend_next_best_action'],
    array['send_sms', 'send_email', 'publish_asset', 'accept_unassigned_persona_for_routing'],
    'approval_required_when_outbound_changes',
    'Use official persona tags only. unassigned_persona is internal cleanup only.'
  ),
  (
    'compliance',
    'Compliance Agent',
    'Checks generated assets for scope, insurance, claim, and approval risk.',
    'ready',
    array['flag_risks', 'suggest_safe_edits', 'recommend_approval_status'],
    array['approve_public_copy_alone', 'send_sms', 'send_email', 'publish_asset'],
    'approval_required_for_medium_high_or_blocked_risk',
    'Block coverage promises, claim approval promises, payout claims, and off-scope hail-only or wind-only campaigns.'
  ),
  (
    'campaign-strategy',
    'Campaign Strategy Agent',
    'Turns persona and performance signals into campaign briefs.',
    'ready',
    array['draft_campaign_brief', 'recommend_channels', 'propose_measurement_plan'],
    array['launch_campaign', 'generate_assets_without_approved_brief', 'target_off_scope_losses'],
    'approval_required_before_asset_generation',
    'Campaigns must stay aligned to water, flood, sewage, mold, fire, and restoration demand.'
  ),
  (
    'content-production',
    'Content Production Agent',
    'Drafts campaign assets from approved briefs.',
    'ready',
    array['draft_assets', 'create_variants', 'generate_creative_prompts'],
    array['publish_landing_pages', 'send_email', 'send_sms'],
    'approval_required_before_external_use',
    'All external-facing drafts remain pending approval until a human approves them.'
  ),
  (
    'referral-growth',
    'Referral Growth Agent',
    'Recommends partner growth actions and referral campaign materials.',
    'ready',
    array['recommend_partner_next_step', 'draft_partner_packet', 'flag_dormant_accounts'],
    array['contact_partners_directly', 'promise_referral_payments', 'modify_partner_records_without_preview'],
    'approval_required_before_outbound_communication',
    'Protect trust with insurance agents, plumbing partners, property managers, and HOA contacts.'
  );

insert into public.agent_permissions (agent_id, permission_key, permission_type, requires_approval)
select id, permission_key, permission_type::public.agent_permission_type, requires_approval
from public.agents
cross join (
  values
    ('publish_asset', 'blocked', true),
    ('send_sms', 'blocked', true),
    ('send_email', 'blocked', true),
    ('generate_email_draft', 'allowed', true),
    ('generate_sms_draft', 'allowed', true),
    ('create_campaign_brief', 'allowed', true),
    ('recommend_next_best_action', 'allowed', false)
) as seed(permission_key, permission_type, requires_approval);
