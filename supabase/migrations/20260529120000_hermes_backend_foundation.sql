-- Hermes backend foundation.
-- Adds the durable control-plane tables surfaced by the Marketing Technologies
-- Linear project before wiring the final Hermes agent runtime.

create type public.guardrail_scope as enum (
  'prompt_input',
  'generated_output',
  'approval_review',
  'dispatch_payload',
  'loss_classification'
);

create type public.guardrail_severity as enum (
  'info',
  'warning',
  'blocker'
);

create type public.social_platform as enum (
  'facebook',
  'instagram',
  'linkedin',
  'google_my_business',
  'youtube',
  'tiktok',
  'threads',
  'other'
);

create type public.social_post_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'scheduled',
  'published',
  'failed',
  'declined',
  'archived'
);

create type public.dispatch_status as enum (
  'queued',
  'blocked_pending_approval',
  'blocked_compliance',
  'dispatched',
  'failed',
  'skipped',
  'canceled'
);

create type public.nurture_sequence_status as enum (
  'draft',
  'paused',
  'active',
  'archived'
);

create type public.nurture_enrollment_status as enum (
  'queued',
  'active',
  'completed',
  'suppressed',
  'failed',
  'unsubscribed'
);

create type public.weather_event_status as enum (
  'received',
  'qualified',
  'ignored',
  'processed',
  'failed'
);

create type public.ad_spend_decision_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'applied',
  'failed',
  'reverted',
  'canceled'
);

create type public.platform_event_status as enum (
  'received',
  'accepted',
  'rejected',
  'processed',
  'failed',
  'reconciled'
);

create type public.external_system_kind as enum (
  'marketing_platform',
  'manager_app',
  'business_development_app',
  'ad_platform',
  'weather_provider',
  'social_platform',
  'email_platform',
  'sms_platform',
  'other'
);

alter table public.campaigns
  add column campaign_phase text not null default 'phase_1' check (
    campaign_phase in ('phase_1', 'phase_2', 'evergreen', 'storm_triggered', 'partner_reactivation')
  ),
  add column approval_item_id uuid references public.approval_items(id) on delete set null;

create table public.persona_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  persona public.persona_mapping not null,
  section_key text not null check (length(btrim(section_key)) > 0),
  entry_type text not null check (
    entry_type in (
      'fear',
      'frustration',
      'desire',
      'messaging_angle',
      'do_not_say',
      'trigger_signal',
      'high_intent_signal',
      'ai_response_rule',
      'cta',
      'proof_point',
      'other'
    )
  ),
  title text not null check (length(btrim(title)) > 0),
  body text not null check (length(btrim(body)) > 0),
  priority integer not null default 50 check (priority between 0 and 100),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint persona_knowledge_persona_not_unassigned_check check (persona <> 'unassigned_persona')
);

create table public.personalization_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique check (length(btrim(rule_key)) > 0),
  persona public.persona_mapping not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  priority integer not null default 50 check (priority between 0 and 100),
  trigger_conditions jsonb not null default '{}'::jsonb,
  hero_text text,
  primary_cta text,
  proof_points text[] not null default '{}'::text[],
  landing_context jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personalization_rules_persona_not_unassigned_check check (persona <> 'unassigned_persona')
);

create table public.visitor_persona_contexts (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique check (length(btrim(session_key)) > 0),
  personalization_rule_id uuid references public.personalization_rules(id) on delete set null,
  inferred_persona public.persona_mapping,
  first_url text,
  last_url text,
  utm_payload jsonb not null default '{}'::jsonb,
  referrer text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitor_persona_not_unassigned_check check (
    inferred_persona is null or inferred_persona <> 'unassigned_persona'
  )
);

create table public.guardrail_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique check (length(btrim(rule_key)) > 0),
  scope public.guardrail_scope not null,
  severity public.guardrail_severity not null default 'warning',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  pattern text,
  matcher_payload jsonb not null default '{}'::jsonb,
  failure_message text not null check (length(btrim(failure_message)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guardrail_findings (
  id uuid primary key default gen_random_uuid(),
  guardrail_rule_id uuid references public.guardrail_rules(id) on delete set null,
  approval_item_id uuid references public.approval_items(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete cascade,
  agent_task_id uuid references public.agent_tasks(id) on delete set null,
  scope public.guardrail_scope not null,
  severity public.guardrail_severity not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'false_positive')),
  matched_text text,
  finding_message text not null check (length(btrim(finding_message)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint guardrail_findings_subject_check check (
    approval_item_id is not null
    or campaign_asset_id is not null
    or agent_task_id is not null
  )
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform public.social_platform not null,
  account_name text not null check (length(btrim(account_name)) > 0),
  external_account_id text,
  status public.integration_status not null default 'planned',
  verification_state text not null default 'unverified' check (
    verification_state in ('unverified', 'verified', 'expired', 'revoked', 'blocked')
  ),
  oauth_secret_ref text,
  permissions_payload jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  approval_item_id uuid references public.approval_items(id) on delete set null,
  status public.social_post_status not null default 'pending_approval',
  channels public.social_platform[] not null default '{}'::public.social_platform[],
  body_text text not null check (length(btrim(body_text)) > 0),
  media_urls text[] not null default '{}'::text[],
  scheduled_at timestamptz,
  published_at timestamptz,
  publish_result_payload jsonb not null default '{}'::jsonb,
  failure_message text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_posts_subject_check check (
    campaign_id is not null
    or campaign_asset_id is not null
    or approval_item_id is not null
  )
);

create table public.outbound_dispatches (
  id uuid primary key default gen_random_uuid(),
  approval_item_id uuid references public.approval_items(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  social_post_id uuid references public.social_posts(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null check (length(btrim(channel)) > 0),
  status public.dispatch_status not null default 'queued',
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  provider text,
  provider_message_id text,
  scheduled_for timestamptz,
  dispatched_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outbound_dispatches_approval_gate_check check (
    status in ('blocked_pending_approval', 'blocked_compliance', 'queued', 'skipped', 'canceled')
    or approval_item_id is not null
  )
);

create unique index outbound_dispatches_approval_once_idx
  on public.outbound_dispatches(approval_item_id, channel)
  where approval_item_id is not null and status in ('queued', 'dispatched');

create table public.partner_referral_tokens (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null unique default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'expired', 'revoked')),
  label text,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_referral_submissions (
  id uuid primary key default gen_random_uuid(),
  partner_referral_token_id uuid references public.partner_referral_tokens(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  status text not null default 'received' check (
    status in ('received', 'accepted', 'rejected', 'notified', 'failed')
  ),
  loss_type_classification text not null check (
    loss_type_classification in ('water', 'flood', 'mold', 'sewage', 'fire')
  ),
  customer_payload jsonb not null default '{}'::jsonb,
  notification_payload jsonb not null default '{}'::jsonb,
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.nurture_sequences (
  id uuid primary key default gen_random_uuid(),
  sequence_key text not null unique check (length(btrim(sequence_key)) > 0),
  persona public.persona_mapping not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  status public.nurture_sequence_status not null default 'draft',
  name text not null check (length(btrim(name)) > 0),
  sequence_payload jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nurture_sequences_persona_not_unassigned_check check (persona <> 'unassigned_persona')
);

create table public.nurture_enrollments (
  id uuid primary key default gen_random_uuid(),
  nurture_sequence_id uuid not null references public.nurture_sequences(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  status public.nurture_enrollment_status not null default 'queued',
  frequency_cap_until timestamptz,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nurture_enrollments_subject_check check (
    contact_id is not null
    or company_id is not null
    or lead_id is not null
  )
);

create table public.tracking_links (
  id uuid primary key default gen_random_uuid(),
  nurture_sequence_id uuid references public.nurture_sequences(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete cascade,
  token_hash text not null unique check (length(btrim(token_hash)) > 0),
  encryption_scheme text not null default 'hmac_sha256' check (
    encryption_scheme in ('aes_256_gcm', 'hmac_sha256')
  ),
  destination_url text not null check (length(btrim(destination_url)) > 0),
  utm_payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.weather_events (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (length(btrim(source_system)) > 0),
  external_event_id text,
  status public.weather_event_status not null default 'received',
  alert_type text not null check (length(btrim(alert_type)) > 0),
  severity text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  zip_codes text[] not null default '{}'::text[],
  radius_miles numeric(5,2) not null default 3.00 check (radius_miles > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index weather_events_source_external_unique_idx
  on public.weather_events(source_system, external_event_id)
  where external_event_id is not null;

create table public.weather_event_targets (
  id uuid primary key default gen_random_uuid(),
  weather_event_id uuid not null references public.weather_events(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  distance_miles numeric(6,3),
  suppressed_reason text,
  outbound_dispatch_id uuid references public.outbound_dispatches(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint weather_event_targets_subject_check check (
    contact_id is not null
    or company_id is not null
    or property_id is not null
    or lead_id is not null
  )
);

create table public.capacity_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'manager_app',
  active_claims_count integer not null check (active_claims_count >= 0),
  capacity_state text not null check (
    capacity_state in ('surplus', 'normal', 'tight', 'ceiling')
  ),
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.ad_spend_decisions (
  id uuid primary key default gen_random_uuid(),
  capacity_snapshot_id uuid references public.capacity_snapshots(id) on delete set null,
  approval_item_id uuid references public.approval_items(id) on delete set null,
  status public.ad_spend_decision_status not null default 'draft',
  decision_key text not null unique check (length(btrim(decision_key)) > 0),
  broad_budget_scale numeric(5,4) check (broad_budget_scale is null or broad_budget_scale between 0 and 1),
  reroute_budget_scale numeric(5,4) check (reroute_budget_scale is null or reroute_budget_scale between 0 and 1),
  target_keywords text[] not null default '{}'::text[],
  reason text,
  payload jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ad_platform_actions (
  id uuid primary key default gen_random_uuid(),
  ad_spend_decision_id uuid not null references public.ad_spend_decisions(id) on delete cascade,
  platform text not null check (length(btrim(platform)) > 0),
  status text not null default 'queued' check (
    status in ('queued', 'applied', 'failed', 'rate_limited', 'auth_failed', 'reverted')
  ),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  last_error text,
  attempted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.external_systems (
  id uuid primary key default gen_random_uuid(),
  system_key text not null unique check (length(btrim(system_key)) > 0),
  system_kind public.external_system_kind not null,
  status public.integration_status not null default 'planned',
  base_url text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_events (
  id uuid primary key default gen_random_uuid(),
  source_system_id uuid references public.external_systems(id) on delete set null,
  source_system_key text not null check (length(btrim(source_system_key)) > 0),
  event_type text not null check (length(btrim(event_type)) > 0),
  status public.platform_event_status not null default 'received',
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  subject_type text,
  subject_id text,
  schema_version text not null default 'v1',
  payload jsonb not null default '{}'::jsonb,
  rejection_reason text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.external_object_mappings (
  id uuid primary key default gen_random_uuid(),
  external_system_id uuid not null references public.external_systems(id) on delete cascade,
  local_table text not null check (length(btrim(local_table)) > 0),
  local_id uuid not null,
  external_object_type text not null check (length(btrim(external_object_type)) > 0),
  external_object_id text not null check (length(btrim(external_object_id)) > 0),
  last_modified_at timestamptz,
  sync_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_system_id, external_object_type, external_object_id),
  unique (external_system_id, local_table, local_id)
);

create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  platform_event_id uuid references public.platform_events(id) on delete set null,
  external_object_mapping_id uuid references public.external_object_mappings(id) on delete set null,
  conflict_type text not null check (length(btrim(conflict_type)) > 0),
  resolution_strategy text not null default 'last_modified_at_wins' check (
    resolution_strategy in ('last_modified_at_wins', 'manual_review', 'source_priority', 'drop_payload')
  ),
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  local_payload jsonb not null default '{}'::jsonb,
  incoming_payload jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null unique check (length(btrim(snapshot_key)) > 0),
  snapshot_type text not null check (
    snapshot_type in (
      'revenue_by_persona',
      'revenue_by_partner',
      'lead_to_job_conversion',
      'campaign_performance',
      'dashboard_queue'
    )
  ),
  period_start date,
  period_end date,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index campaigns_campaign_phase_idx on public.campaigns(campaign_phase);
create index campaigns_approval_item_id_idx on public.campaigns(approval_item_id);

create index persona_knowledge_entries_persona_idx on public.persona_knowledge_entries(persona, status);
create index persona_knowledge_entries_type_idx on public.persona_knowledge_entries(entry_type);

create index personalization_rules_persona_idx on public.personalization_rules(persona, status);
create index visitor_persona_contexts_expires_at_idx on public.visitor_persona_contexts(expires_at);

create index guardrail_rules_scope_idx on public.guardrail_rules(scope, status);
create index guardrail_findings_status_idx on public.guardrail_findings(status, severity);
create index guardrail_findings_approval_item_id_idx on public.guardrail_findings(approval_item_id);

create unique index social_accounts_external_unique_idx
  on public.social_accounts(platform, external_account_id)
  where external_account_id is not null;
create index social_posts_scheduled_at_idx on public.social_posts(scheduled_at)
  where scheduled_at is not null;
create index social_posts_status_idx on public.social_posts(status);
create index social_posts_campaign_id_idx on public.social_posts(campaign_id);

create index outbound_dispatches_status_idx on public.outbound_dispatches(status, scheduled_for);
create index outbound_dispatches_contact_id_idx on public.outbound_dispatches(contact_id);
create index outbound_dispatches_social_post_id_idx on public.outbound_dispatches(social_post_id);

create index partner_referral_tokens_company_id_idx on public.partner_referral_tokens(company_id, status);
create index partner_referral_submissions_company_id_idx on public.partner_referral_submissions(company_id, submitted_at desc);
create index partner_referral_submissions_lead_id_idx on public.partner_referral_submissions(lead_id);

create index nurture_sequences_persona_idx on public.nurture_sequences(persona, status);
create index nurture_enrollments_sequence_idx on public.nurture_enrollments(nurture_sequence_id, status);
create index nurture_enrollments_contact_idx on public.nurture_enrollments(contact_id);
create index tracking_links_contact_id_idx on public.tracking_links(contact_id);

create index weather_events_status_idx on public.weather_events(status, created_at desc);
create index weather_events_zip_codes_idx on public.weather_events using gin(zip_codes);
create index weather_event_targets_weather_event_id_idx on public.weather_event_targets(weather_event_id);
create index weather_event_targets_contact_id_idx on public.weather_event_targets(contact_id);

create index capacity_snapshots_observed_at_idx on public.capacity_snapshots(observed_at desc);
create index ad_spend_decisions_status_idx on public.ad_spend_decisions(status, created_at desc);
create index ad_platform_actions_decision_id_idx on public.ad_platform_actions(ad_spend_decision_id);

create index external_systems_kind_idx on public.external_systems(system_kind, status);
create index platform_events_status_idx on public.platform_events(status, received_at desc);
create index platform_events_subject_idx on public.platform_events(subject_type, subject_id);
create index external_object_mappings_local_idx on public.external_object_mappings(local_table, local_id);
create index sync_conflicts_status_idx on public.sync_conflicts(status, created_at desc);
create index analytics_snapshots_type_idx on public.analytics_snapshots(snapshot_type, generated_at desc);

alter table public.persona_knowledge_entries enable row level security;
alter table public.personalization_rules enable row level security;
alter table public.visitor_persona_contexts enable row level security;
alter table public.guardrail_rules enable row level security;
alter table public.guardrail_findings enable row level security;
alter table public.social_accounts enable row level security;
alter table public.social_posts enable row level security;
alter table public.outbound_dispatches enable row level security;
alter table public.partner_referral_tokens enable row level security;
alter table public.partner_referral_submissions enable row level security;
alter table public.nurture_sequences enable row level security;
alter table public.nurture_enrollments enable row level security;
alter table public.tracking_links enable row level security;
alter table public.weather_events enable row level security;
alter table public.weather_event_targets enable row level security;
alter table public.capacity_snapshots enable row level security;
alter table public.ad_spend_decisions enable row level security;
alter table public.ad_platform_actions enable row level security;
alter table public.external_systems enable row level security;
alter table public.platform_events enable row level security;
alter table public.external_object_mappings enable row level security;
alter table public.sync_conflicts enable row level security;
alter table public.analytics_snapshots enable row level security;

create trigger persona_knowledge_entries_set_updated_at
before update on public.persona_knowledge_entries
for each row execute function public.set_updated_at();

create trigger personalization_rules_set_updated_at
before update on public.personalization_rules
for each row execute function public.set_updated_at();

create trigger visitor_persona_contexts_set_updated_at
before update on public.visitor_persona_contexts
for each row execute function public.set_updated_at();

create trigger guardrail_rules_set_updated_at
before update on public.guardrail_rules
for each row execute function public.set_updated_at();

create trigger social_accounts_set_updated_at
before update on public.social_accounts
for each row execute function public.set_updated_at();

create trigger social_posts_set_updated_at
before update on public.social_posts
for each row execute function public.set_updated_at();

create trigger outbound_dispatches_set_updated_at
before update on public.outbound_dispatches
for each row execute function public.set_updated_at();

create trigger partner_referral_tokens_set_updated_at
before update on public.partner_referral_tokens
for each row execute function public.set_updated_at();

create trigger nurture_sequences_set_updated_at
before update on public.nurture_sequences
for each row execute function public.set_updated_at();

create trigger nurture_enrollments_set_updated_at
before update on public.nurture_enrollments
for each row execute function public.set_updated_at();

create trigger ad_spend_decisions_set_updated_at
before update on public.ad_spend_decisions
for each row execute function public.set_updated_at();

create trigger external_systems_set_updated_at
before update on public.external_systems
for each row execute function public.set_updated_at();

create trigger external_object_mappings_set_updated_at
before update on public.external_object_mappings
for each row execute function public.set_updated_at();
