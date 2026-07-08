-- Growth Engine hyper-personalization layer draft.
-- Extends the six-object CRM with persona snapshots, engagement timelines,
-- campaign production, approval locks, next-best actions, integrations, and
-- competitor/software intelligence.

create type public.restoration_focus as enum (
  'flood',
  'water_backup',
  'burst_pipe',
  'storm_surge',
  'standing_water',
  'mold',
  'sewage',
  'fire'
);

create type public.campaign_status as enum (
  'draft',
  'briefing',
  'generating',
  'pending_approval',
  'approved',
  'active',
  'paused',
  'archived',
  'blocked'
);

create type public.campaign_asset_type as enum (
  'landing_page',
  'search_ad',
  'social_ad',
  'display_ad',
  'google_business_post',
  'email',
  'sms',
  'video_prompt',
  'image_prompt',
  'one_pager',
  'referral_packet',
  'review_response',
  'script',
  'other'
);

create type public.approval_status as enum (
  'draft',
  'needs_compliance',
  'pending_approval',
  'pending_owner_approval',
  'approved',
  'declined',
  'rejected',
  'revision_requested',
  'blocked',
  'needs_revision',
  'archived'
);

create type public.next_best_action_status as enum (
  'open',
  'accepted',
  'snoozed',
  'completed',
  'dismissed'
);

create type public.integration_status as enum (
  'planned',
  'ready',
  'connected',
  'needs_auth',
  'blocked',
  'disabled'
);

create type public.approval_decision_kind as enum (
  'approved',
  'declined',
  'revision_requested',
  'archived',
  'blocked'
);

create type public.campaign_event_type as enum (
  'created',
  'brief_created',
  'asset_generated',
  'approval_submitted',
  'approval_decided',
  'exported',
  'launched',
  'paused',
  'archived',
  'result_recorded'
);

create type public.intake_audit_status as enum (
  'accepted',
  'rejected',
  'archived',
  'needs_review'
);

create table public.integration_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  provider text not null check (length(btrim(provider)) > 0),
  category text not null check (length(btrim(category)) > 0),
  status public.integration_status not null default 'planned',
  sync_direction text check (
    sync_direction is null
    or sync_direction in ('inbound', 'outbound', 'bidirectional', 'launch_only')
  ),
  owner text,
  connection_notes text,
  config jsonb not null default '{}'::jsonb,
  audit_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competitor_apps (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  category text not null check (length(btrim(category)) > 0),
  target_user text,
  pricing_notes text,
  research_status text not null default 'researching' check (
    research_status in ('researching', 'reviewed', 'borrow_pattern', 'ignore', 'monitor')
  ),
  takeaways text,
  audit_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competitor_features (
  id uuid primary key default gen_random_uuid(),
  competitor_app_id uuid not null references public.competitor_apps(id) on delete cascade,
  feature_name text not null check (length(btrim(feature_name)) > 0),
  feature_category text,
  observed_pattern text,
  growth_engine_application text,
  adoption_status text not null default 'candidate' check (
    adoption_status in ('candidate', 'planned', 'adapted', 'rejected', 'already_covered')
  ),
  reasoning_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.software_research_notes (
  id uuid primary key default gen_random_uuid(),
  competitor_app_id uuid references public.competitor_apps(id) on delete cascade,
  source_name text,
  source_url text,
  note_type text not null default 'research' check (
    note_type in ('research', 'demo', 'screenshot', 'pricing', 'ticket', 'decision', 'other')
  ),
  summary text not null check (length(btrim(summary)) > 0),
  decision text check (
    decision is null
    or decision in ('adapt', 'ignore', 'later', 'already_covered', 'needs_review')
  ),
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  persona public.persona_mapping not null,
  restoration_focus public.restoration_focus not null,
  status public.campaign_status not null default 'draft',
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  owner text,
  objective text,
  audience_summary text,
  offer_summary text,
  compliance_notes text,
  source_system text,
  external_campaign_id text,
  launch_locked boolean not null default true,
  source_signal jsonb not null default '{}'::jsonb,
  reasoning_payload jsonb not null default '{}'::jsonb,
  audit_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_persona_not_unassigned_check check (persona <> 'unassigned_persona')
);

create table public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  asset_type public.campaign_asset_type not null,
  channel text,
  title text not null check (length(btrim(title)) > 0),
  status public.approval_status not null default 'pending_approval',
  source_system text,
  external_asset_id text,
  tool_source text,
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

create table public.campaign_audiences (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  persona public.persona_mapping not null,
  audience_name text not null check (length(btrim(audience_name)) > 0),
  relationship_stage text,
  inclusion_rules jsonb not null default '{}'::jsonb,
  exclusion_rules jsonb not null default '{}'::jsonb,
  estimated_size integer check (estimated_size is null or estimated_size >= 0),
  reasoning_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_audiences_persona_not_unassigned_check check (persona <> 'unassigned_persona')
);

create table public.approval_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  item_type text not null check (length(btrim(item_type)) > 0),
  status public.approval_status not null default 'pending_approval',
  approval_required boolean not null default true,
  locked_until_approved boolean not null default true,
  prompt_inputs jsonb not null default '{}'::jsonb,
  draft_output text,
  edited_output text,
  requested_by text,
  submitted_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high', 'blocked')),
  compliance_notes text,
  decision_notes text,
  reasoning_payload jsonb not null default '{}'::jsonb,
  audit_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_items_subject_check check (
    campaign_id is not null
    or campaign_asset_id is not null
    or company_id is not null
    or contact_id is not null
    or property_id is not null
    or lead_id is not null
  )
);

create table public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  approval_item_id uuid not null references public.approval_items(id) on delete cascade,
  decision public.approval_decision_kind not null,
  decided_by text not null check (length(btrim(decided_by)) > 0),
  decided_at timestamptz not null default now(),
  decision_notes text,
  previous_status public.approval_status,
  next_status public.approval_status not null,
  edited_output text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.persona_snapshots (
  id uuid primary key default gen_random_uuid(),
  persona public.persona_mapping not null,
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  outcome_id uuid references public.outcomes(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  is_current boolean not null default true,
  snapshot_version integer not null default 1 check (snapshot_version > 0),
  hyper_persona_summary text,
  relationship_stage text,
  value_tier text check (value_tier is null or value_tier in ('low', 'medium', 'high')),
  dominant_loss_pattern text,
  preferred_channel text,
  message_posture text,
  recommended_offer text,
  next_best_action text,
  confidence_score integer check (confidence_score is null or confidence_score between 0 and 100),
  risk_flags text[] not null default '{}'::text[],
  situation_context jsonb not null default '{}'::jsonb,
  relationship_context jsonb not null default '{}'::jsonb,
  behavior_context jsonb not null default '{}'::jsonb,
  value_context jsonb not null default '{}'::jsonb,
  channel_context jsonb not null default '{}'::jsonb,
  message_context jsonb not null default '{}'::jsonb,
  capacity_context jsonb not null default '{}'::jsonb,
  source_events jsonb not null default '[]'::jsonb,
  source_hash text,
  reasoning_payload jsonb not null default '{}'::jsonb,
  audit_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint persona_snapshots_persona_not_unassigned_check check (persona <> 'unassigned_persona'),
  constraint persona_snapshots_subject_check check (
    company_id is not null
    or contact_id is not null
    or property_id is not null
    or lead_id is not null
    or job_id is not null
    or outcome_id is not null
    or campaign_id is not null
  )
);

create table public.engagement_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  outcome_id uuid references public.outcomes(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  event_type text not null check (length(btrim(event_type)) > 0),
  channel text,
  source_system text,
  external_event_id text,
  occurred_at timestamptz not null default now(),
  summary text,
  direction text check (direction is null or direction in ('inbound', 'outbound', 'internal')),
  metadata jsonb not null default '{}'::jsonb,
  reasoning_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagement_events_subject_check check (
    company_id is not null
    or contact_id is not null
    or property_id is not null
    or lead_id is not null
    or job_id is not null
    or outcome_id is not null
    or campaign_id is not null
  )
);

create table public.rejected_intake_events (
  id uuid primary key default gen_random_uuid(),
  source text,
  source_system text,
  external_event_id text,
  status public.intake_audit_status not null default 'rejected',
  rejection_code text,
  rejection_message text,
  persona_attempted text,
  loss_signals text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.next_best_actions (
  id uuid primary key default gen_random_uuid(),
  persona_snapshot_id uuid references public.persona_snapshots(id) on delete cascade,
  approval_item_id uuid references public.approval_items(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  action_type text not null check (length(btrim(action_type)) > 0),
  status public.next_best_action_status not null default 'open',
  priority integer not null default 50 check (priority between 0 and 100),
  approval_required boolean not null default false,
  recommendation text,
  reason text,
  due_at timestamptz,
  reasoning_payload jsonb not null default '{}'::jsonb,
  audit_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint next_best_actions_subject_check check (
    persona_snapshot_id is not null
    or campaign_id is not null
    or company_id is not null
    or contact_id is not null
    or property_id is not null
    or lead_id is not null
  )
);

create table public.partner_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  persona public.persona_mapping not null,
  health_score integer not null check (health_score between 0 and 100),
  relationship_stage text,
  trailing_90_day_referrals integer not null default 0 check (trailing_90_day_referrals >= 0),
  trailing_90_day_won_revenue_cents bigint check (
    trailing_90_day_won_revenue_cents is null or trailing_90_day_won_revenue_cents >= 0
  ),
  last_referral_at timestamptz,
  recommended_action text,
  risk_flags text[] not null default '{}'::text[],
  reasoning_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint partner_health_snapshots_subject_check check (
    company_id is not null
    or contact_id is not null
  ),
  constraint partner_health_snapshots_persona_not_unassigned_check check (persona <> 'unassigned_persona')
);

create table public.score_weight_configs (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (length(btrim(key)) > 0),
  applies_to text not null check (
    applies_to in ('lead', 'partner', 'persona_snapshot', 'next_best_action', 'campaign')
  ),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  weights jsonb not null default '{}'::jsonb,
  notes text,
  created_by text,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  approval_item_id uuid references public.approval_items(id) on delete set null,
  event_type public.campaign_event_type not null,
  actor text,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.campaign_results (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  channel text,
  period_start date not null,
  period_end date not null,
  impressions integer check (impressions is null or impressions >= 0),
  clicks integer check (clicks is null or clicks >= 0),
  calls integer check (calls is null or calls >= 0),
  forms integer check (forms is null or forms >= 0),
  leads integer check (leads is null or leads >= 0),
  jobs integer check (jobs is null or jobs >= 0),
  won_revenue_cents bigint check (won_revenue_cents is null or won_revenue_cents >= 0),
  spend_cents bigint check (spend_cents is null or spend_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_results_period_check check (period_end >= period_start)
);

create index integration_registry_provider_idx on public.integration_registry(provider);
create index integration_registry_status_idx on public.integration_registry(status);

create index competitor_apps_category_idx on public.competitor_apps(category);
create index competitor_features_app_idx on public.competitor_features(competitor_app_id);
create index competitor_features_status_idx on public.competitor_features(adoption_status);
create index software_research_notes_app_idx on public.software_research_notes(competitor_app_id);
create index software_research_notes_decision_idx on public.software_research_notes(decision);

create index campaigns_persona_idx on public.campaigns(persona);
create index campaigns_focus_idx on public.campaigns(restoration_focus);
create index campaigns_status_idx on public.campaigns(status);
create index campaigns_source_external_idx on public.campaigns(source_system, external_campaign_id)
  where external_campaign_id is not null;
create index campaigns_company_id_idx on public.campaigns(company_id);
create index campaigns_contact_id_idx on public.campaigns(contact_id);
create index campaigns_property_id_idx on public.campaigns(property_id);
create index campaigns_lead_id_idx on public.campaigns(lead_id);

create index campaign_assets_campaign_id_idx on public.campaign_assets(campaign_id);
create index campaign_assets_status_idx on public.campaign_assets(status);
create index campaign_assets_type_idx on public.campaign_assets(asset_type);
create index campaign_assets_source_external_idx on public.campaign_assets(source_system, external_asset_id)
  where external_asset_id is not null;

create index campaign_audiences_campaign_id_idx on public.campaign_audiences(campaign_id);
create index campaign_audiences_persona_idx on public.campaign_audiences(persona);

create index approval_items_campaign_id_idx on public.approval_items(campaign_id);
create index approval_items_asset_id_idx on public.approval_items(campaign_asset_id);
create index approval_items_status_idx on public.approval_items(status);
create index approval_items_lead_id_idx on public.approval_items(lead_id);
create index approval_decisions_item_id_idx on public.approval_decisions(approval_item_id, decided_at desc);
create index approval_decisions_decision_idx on public.approval_decisions(decision, decided_at desc);

create index persona_snapshots_persona_idx on public.persona_snapshots(persona);
create index persona_snapshots_company_id_idx on public.persona_snapshots(company_id);
create index persona_snapshots_contact_id_idx on public.persona_snapshots(contact_id);
create index persona_snapshots_property_id_idx on public.persona_snapshots(property_id);
create index persona_snapshots_lead_id_idx on public.persona_snapshots(lead_id);
create index persona_snapshots_job_id_idx on public.persona_snapshots(job_id);
create index persona_snapshots_outcome_id_idx on public.persona_snapshots(outcome_id);
create index persona_snapshots_campaign_id_idx on public.persona_snapshots(campaign_id);
create index persona_snapshots_current_idx on public.persona_snapshots(is_current)
  where is_current;

create index engagement_events_company_id_idx on public.engagement_events(company_id);
create index engagement_events_contact_id_idx on public.engagement_events(contact_id);
create index engagement_events_property_id_idx on public.engagement_events(property_id);
create index engagement_events_lead_id_idx on public.engagement_events(lead_id);
create index engagement_events_campaign_id_idx on public.engagement_events(campaign_id);
create index engagement_events_occurred_at_idx on public.engagement_events(occurred_at desc);
create unique index engagement_events_source_external_unique_idx
  on public.engagement_events(source_system, external_event_id)
  where source_system is not null and external_event_id is not null;

create index rejected_intake_events_source_external_idx
  on public.rejected_intake_events(source_system, external_event_id)
  where external_event_id is not null;
create index rejected_intake_events_status_idx on public.rejected_intake_events(status, received_at desc);

create index next_best_actions_status_idx on public.next_best_actions(status);
create index next_best_actions_priority_idx on public.next_best_actions(priority desc);
create index next_best_actions_snapshot_id_idx on public.next_best_actions(persona_snapshot_id);
create index next_best_actions_campaign_id_idx on public.next_best_actions(campaign_id);
create index next_best_actions_lead_id_idx on public.next_best_actions(lead_id);

create index partner_health_snapshots_company_id_idx on public.partner_health_snapshots(company_id);
create index partner_health_snapshots_contact_id_idx on public.partner_health_snapshots(contact_id);
create index partner_health_snapshots_persona_idx on public.partner_health_snapshots(persona);
create index partner_health_snapshots_score_idx on public.partner_health_snapshots(health_score desc);

create index score_weight_configs_status_idx on public.score_weight_configs(status);
create index campaign_events_campaign_id_idx on public.campaign_events(campaign_id, occurred_at desc);
create index campaign_events_type_idx on public.campaign_events(event_type, occurred_at desc);
create index campaign_results_campaign_id_idx on public.campaign_results(campaign_id, period_end desc);
create index campaign_results_asset_id_idx on public.campaign_results(campaign_asset_id, period_end desc);

alter table public.integration_registry enable row level security;
alter table public.competitor_apps enable row level security;
alter table public.competitor_features enable row level security;
alter table public.software_research_notes enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_assets enable row level security;
alter table public.campaign_audiences enable row level security;
alter table public.approval_items enable row level security;
alter table public.approval_decisions enable row level security;
alter table public.persona_snapshots enable row level security;
alter table public.engagement_events enable row level security;
alter table public.rejected_intake_events enable row level security;
alter table public.next_best_actions enable row level security;
alter table public.partner_health_snapshots enable row level security;
alter table public.score_weight_configs enable row level security;
alter table public.campaign_events enable row level security;
alter table public.campaign_results enable row level security;

create trigger integration_registry_set_updated_at
before update on public.integration_registry
for each row execute function public.set_updated_at();

create trigger competitor_apps_set_updated_at
before update on public.competitor_apps
for each row execute function public.set_updated_at();

create trigger competitor_features_set_updated_at
before update on public.competitor_features
for each row execute function public.set_updated_at();

create trigger software_research_notes_set_updated_at
before update on public.software_research_notes
for each row execute function public.set_updated_at();

create trigger campaigns_set_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

create trigger campaign_assets_set_updated_at
before update on public.campaign_assets
for each row execute function public.set_updated_at();

create trigger campaign_audiences_set_updated_at
before update on public.campaign_audiences
for each row execute function public.set_updated_at();

create trigger approval_items_set_updated_at
before update on public.approval_items
for each row execute function public.set_updated_at();

create trigger persona_snapshots_set_updated_at
before update on public.persona_snapshots
for each row execute function public.set_updated_at();

create trigger engagement_events_set_updated_at
before update on public.engagement_events
for each row execute function public.set_updated_at();

create trigger next_best_actions_set_updated_at
before update on public.next_best_actions
for each row execute function public.set_updated_at();

create trigger score_weight_configs_set_updated_at
before update on public.score_weight_configs
for each row execute function public.set_updated_at();

create trigger campaign_results_set_updated_at
before update on public.campaign_results
for each row execute function public.set_updated_at();
