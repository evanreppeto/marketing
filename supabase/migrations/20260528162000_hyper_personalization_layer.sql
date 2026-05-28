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
  'email',
  'sms',
  'video_prompt',
  'one_pager',
  'script',
  'other'
);

create type public.approval_status as enum (
  'pending_approval',
  'approved',
  'rejected',
  'blocked',
  'needs_revision'
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
  tool_source text,
  prompt_input text,
  draft_body text,
  approved_body text,
  compliance_notes text,
  reasoning_payload jsonb not null default '{}'::jsonb,
  audit_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  requested_by text,
  reviewed_by text,
  reviewed_at timestamptz,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high', 'blocked')),
  compliance_notes text,
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

create table public.persona_snapshots (
  id uuid primary key default gen_random_uuid(),
  persona public.persona_mapping not null,
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  outcome_id uuid references public.outcomes(id) on delete cascade,
  relationship_stage text,
  value_tier text check (value_tier is null or value_tier in ('low', 'medium', 'high')),
  dominant_loss_pattern text,
  preferred_channel text,
  message_posture text,
  recommended_offer text,
  next_best_action text,
  confidence_score integer check (confidence_score is null or confidence_score between 0 and 100),
  risk_flags text[] not null default '{}'::text[],
  source_events jsonb not null default '[]'::jsonb,
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

create index integration_registry_provider_idx on public.integration_registry(provider);
create index integration_registry_status_idx on public.integration_registry(status);

create index competitor_apps_category_idx on public.competitor_apps(category);
create index competitor_features_app_idx on public.competitor_features(competitor_app_id);
create index competitor_features_status_idx on public.competitor_features(adoption_status);

create index campaigns_persona_idx on public.campaigns(persona);
create index campaigns_focus_idx on public.campaigns(restoration_focus);
create index campaigns_status_idx on public.campaigns(status);
create index campaigns_company_id_idx on public.campaigns(company_id);
create index campaigns_contact_id_idx on public.campaigns(contact_id);
create index campaigns_property_id_idx on public.campaigns(property_id);
create index campaigns_lead_id_idx on public.campaigns(lead_id);

create index campaign_assets_campaign_id_idx on public.campaign_assets(campaign_id);
create index campaign_assets_status_idx on public.campaign_assets(status);
create index campaign_assets_type_idx on public.campaign_assets(asset_type);

create index approval_items_campaign_id_idx on public.approval_items(campaign_id);
create index approval_items_asset_id_idx on public.approval_items(campaign_asset_id);
create index approval_items_status_idx on public.approval_items(status);
create index approval_items_lead_id_idx on public.approval_items(lead_id);

create index persona_snapshots_persona_idx on public.persona_snapshots(persona);
create index persona_snapshots_company_id_idx on public.persona_snapshots(company_id);
create index persona_snapshots_contact_id_idx on public.persona_snapshots(contact_id);
create index persona_snapshots_property_id_idx on public.persona_snapshots(property_id);
create index persona_snapshots_lead_id_idx on public.persona_snapshots(lead_id);
create index persona_snapshots_job_id_idx on public.persona_snapshots(job_id);
create index persona_snapshots_outcome_id_idx on public.persona_snapshots(outcome_id);

create index engagement_events_company_id_idx on public.engagement_events(company_id);
create index engagement_events_contact_id_idx on public.engagement_events(contact_id);
create index engagement_events_property_id_idx on public.engagement_events(property_id);
create index engagement_events_lead_id_idx on public.engagement_events(lead_id);
create index engagement_events_campaign_id_idx on public.engagement_events(campaign_id);
create index engagement_events_occurred_at_idx on public.engagement_events(occurred_at desc);

create index next_best_actions_status_idx on public.next_best_actions(status);
create index next_best_actions_priority_idx on public.next_best_actions(priority desc);
create index next_best_actions_snapshot_id_idx on public.next_best_actions(persona_snapshot_id);
create index next_best_actions_campaign_id_idx on public.next_best_actions(campaign_id);
create index next_best_actions_lead_id_idx on public.next_best_actions(lead_id);

alter table public.integration_registry enable row level security;
alter table public.competitor_apps enable row level security;
alter table public.competitor_features enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_assets enable row level security;
alter table public.approval_items enable row level security;
alter table public.persona_snapshots enable row level security;
alter table public.engagement_events enable row level security;
alter table public.next_best_actions enable row level security;

create trigger integration_registry_set_updated_at
before update on public.integration_registry
for each row execute function public.set_updated_at();

create trigger competitor_apps_set_updated_at
before update on public.competitor_apps
for each row execute function public.set_updated_at();

create trigger competitor_features_set_updated_at
before update on public.competitor_features
for each row execute function public.set_updated_at();

create trigger campaigns_set_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

create trigger campaign_assets_set_updated_at
before update on public.campaign_assets
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
