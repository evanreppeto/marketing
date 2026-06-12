-- Optional V2 demo data for local/dev testing.
--
-- Apply only after `migrations/20260612160000_v2_baseline.sql`.
-- This intentionally inserts into the real product tables so the app exercises
-- real read/write paths. Every row is tagged with `growth_engine_v2_demo` so it
-- can be removed by `clear_dev_demo_data.sql`.

do $$
declare
  seed_source text := 'growth_engine_v2_demo';
  bsr_org uuid;

  lakeside_company uuid := '10000000-0000-4000-8000-000000000001';
  lakeside_contact uuid := '10000000-0000-4000-8000-000000000002';
  lakeside_property uuid := '10000000-0000-4000-8000-000000000003';
  lakeside_lead uuid := '10000000-0000-4000-8000-000000000004';
  lakeside_job uuid := '10000000-0000-4000-8000-000000000005';
  lakeside_outcome uuid := '10000000-0000-4000-8000-000000000006';

  plumbing_company uuid := '10000000-0000-4000-8000-000000000011';
  plumbing_contact uuid := '10000000-0000-4000-8000-000000000012';
  plumbing_lead uuid := '10000000-0000-4000-8000-000000000013';

  campaign_id uuid := '10000000-0000-4000-8000-000000000021';
  asset_id uuid := '10000000-0000-4000-8000-000000000022';
  approval_id uuid := '10000000-0000-4000-8000-000000000023';
  approval_decision_id uuid := '10000000-0000-4000-8000-000000000024';
  campaign_result_id uuid := '10000000-0000-4000-8000-000000000025';
  campaign_created_event_id uuid := '10000000-0000-4000-8000-000000000026';
  asset_generated_event_id uuid := '10000000-0000-4000-8000-000000000027';

  agent_id uuid := '10000000-0000-4000-8000-000000000031';
  task_id uuid := '10000000-0000-4000-8000-000000000032';
  task_input_id uuid := '10000000-0000-4000-8000-000000000033';
  output_id uuid := '10000000-0000-4000-8000-000000000034';
  run_log_id uuid := '10000000-0000-4000-8000-000000000035';

  conversation_id uuid := '10000000-0000-4000-8000-000000000041';
  operator_message_id uuid := '10000000-0000-4000-8000-000000000042';
  mark_message_id uuid := '10000000-0000-4000-8000-000000000043';

  note_id uuid := '10000000-0000-4000-8000-000000000051';
  crm_task_id uuid := '10000000-0000-4000-8000-000000000052';
  activity_id uuid := '10000000-0000-4000-8000-000000000053';
  engagement_id uuid := '10000000-0000-4000-8000-000000000054';
  persona_snapshot_id uuid := '10000000-0000-4000-8000-000000000055';
  nba_id uuid := '10000000-0000-4000-8000-000000000056';
  vault_note_id uuid := '10000000-0000-4000-8000-000000000057';
begin
  select id into bsr_org
  from public.organizations
  where slug = 'big-shoulders-restoration';

  if bsr_org is null then
    raise exception 'Big Shoulders organization seed is missing. Apply the V2 baseline first.';
  end if;

  insert into public.companies (
    id, org_id, name, persona, status, website_url, phone, email, partner_tier, metadata
  ) values
    (
      lakeside_company,
      bsr_org,
      'Lakeside Property Management',
      'persona_property_manager',
      'active',
      'https://example.com/lakeside-property-management',
      '312-555-0198',
      'ops@example.com',
      'A',
      jsonb_build_object('seed_source', seed_source, 'relationship_stage', 'active_referral_partner')
    ),
    (
      plumbing_company,
      bsr_org,
      'Northside Plumbing Co.',
      'persona_plumbing_partner',
      'active',
      'https://example.com/northside-plumbing',
      '773-555-0144',
      'dispatch@example.com',
      'B',
      jsonb_build_object('seed_source', seed_source, 'relationship_stage', 'new_partner')
    )
  on conflict (id) do update set
    name = excluded.name,
    persona = excluded.persona,
    status = excluded.status,
    website_url = excluded.website_url,
    phone = excluded.phone,
    email = excluded.email,
    partner_tier = excluded.partner_tier,
    metadata = excluded.metadata;

  insert into public.contacts (
    id, org_id, company_id, persona, status, first_name, last_name, email, phone, title, metadata
  ) values
    (
      lakeside_contact,
      bsr_org,
      lakeside_company,
      'persona_property_manager',
      'active',
      'Maya',
      'Torres',
      'maya.torres@example.com',
      '312-555-0188',
      'Regional Property Manager',
      jsonb_build_object('seed_source', seed_source, 'preferred_channel', 'email')
    ),
    (
      plumbing_contact,
      bsr_org,
      plumbing_company,
      'persona_plumbing_partner',
      'active',
      'Evan',
      'Miller',
      'evan.miller@example.com',
      '773-555-0177',
      'Service Manager',
      jsonb_build_object('seed_source', seed_source, 'preferred_channel', 'phone')
    )
  on conflict (id) do update set
    company_id = excluded.company_id,
    persona = excluded.persona,
    status = excluded.status,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    phone = excluded.phone,
    title = excluded.title,
    metadata = excluded.metadata;

  insert into public.properties (
    id, org_id, company_id, contact_id, persona, street_line_1, city, state, postal_code, property_type, metadata
  ) values (
    lakeside_property,
    bsr_org,
    lakeside_company,
    lakeside_contact,
    'persona_property_manager',
    '1840 W Superior St',
    'Chicago',
    'IL',
    '60622',
    'multi_family',
    jsonb_build_object('seed_source', seed_source, 'units', 18, 'priority', 'high')
  )
  on conflict (id) do update set
    company_id = excluded.company_id,
    contact_id = excluded.contact_id,
    persona = excluded.persona,
    street_line_1 = excluded.street_line_1,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    property_type = excluded.property_type,
    metadata = excluded.metadata;

  insert into public.leads (
    id, org_id, company_id, contact_id, property_id, persona, status, routing_recommendation,
    source, external_lead_id, loss_summary, loss_signals, matched_target_keywords,
    matched_non_target_keywords, lead_score, received_at, metadata
  ) values
    (
      lakeside_lead,
      bsr_org,
      lakeside_company,
      lakeside_contact,
      lakeside_property,
      'persona_property_manager',
      'qualified',
      'target',
      'website_form',
      'demo-water-loss-001',
      'Ceiling leak after heavy rain. Property manager reports active dripping in a tenant unit.',
      array['water', 'ceiling leak', 'active dripping'],
      array['water damage', 'ceiling leak', 'emergency'],
      array[]::text[],
      91,
      now() - interval '2 days',
      jsonb_build_object('seed_source', seed_source, 'urgency', 'same_day')
    ),
    (
      plumbing_lead,
      bsr_org,
      plumbing_company,
      plumbing_contact,
      null,
      'persona_plumbing_partner',
      'validated',
      'elevated',
      'partner_referral',
      'demo-plumber-referral-001',
      'Plumber referred a homeowner with supply-line water damage and wet drywall.',
      array['supply line', 'wet drywall', 'partner referral'],
      array['water damage', 'wet drywall'],
      array[]::text[],
      84,
      now() - interval '1 day',
      jsonb_build_object('seed_source', seed_source, 'partner_score', 78)
    )
  on conflict (id) do update set
    company_id = excluded.company_id,
    contact_id = excluded.contact_id,
    property_id = excluded.property_id,
    persona = excluded.persona,
    status = excluded.status,
    routing_recommendation = excluded.routing_recommendation,
    source = excluded.source,
    external_lead_id = excluded.external_lead_id,
    loss_summary = excluded.loss_summary,
    loss_signals = excluded.loss_signals,
    matched_target_keywords = excluded.matched_target_keywords,
    matched_non_target_keywords = excluded.matched_non_target_keywords,
    lead_score = excluded.lead_score,
    received_at = excluded.received_at,
    metadata = excluded.metadata;

  insert into public.jobs (
    id, org_id, lead_id, company_id, contact_id, property_id, persona, status, job_number,
    scheduled_at, estimated_revenue_cents, metadata
  ) values (
    lakeside_job,
    bsr_org,
    lakeside_lead,
    lakeside_company,
    lakeside_contact,
    lakeside_property,
    'persona_property_manager',
    'scheduled',
    'DEMO-2401',
    now() + interval '1 day',
    1450000,
    jsonb_build_object('seed_source', seed_source, 'work_type', 'water_mitigation')
  )
  on conflict (id) do update set
    lead_id = excluded.lead_id,
    company_id = excluded.company_id,
    contact_id = excluded.contact_id,
    property_id = excluded.property_id,
    persona = excluded.persona,
    status = excluded.status,
    job_number = excluded.job_number,
    scheduled_at = excluded.scheduled_at,
    estimated_revenue_cents = excluded.estimated_revenue_cents,
    metadata = excluded.metadata;

  insert into public.outcomes (
    id, org_id, job_id, lead_id, company_id, contact_id, property_id, persona,
    status, gross_revenue_cents, gross_margin_cents, closed_at, metadata
  ) values (
    lakeside_outcome,
    bsr_org,
    lakeside_job,
    lakeside_lead,
    lakeside_company,
    lakeside_contact,
    lakeside_property,
    'persona_property_manager',
    'pending',
    null,
    null,
    null,
    jsonb_build_object('seed_source', seed_source, 'expected_followup', 'after_job_completion')
  )
  on conflict (id) do update set
    job_id = excluded.job_id,
    lead_id = excluded.lead_id,
    company_id = excluded.company_id,
    contact_id = excluded.contact_id,
    property_id = excluded.property_id,
    persona = excluded.persona,
    status = excluded.status,
    gross_revenue_cents = excluded.gross_revenue_cents,
    gross_margin_cents = excluded.gross_margin_cents,
    closed_at = excluded.closed_at,
    metadata = excluded.metadata;

  insert into public.campaigns (
    id, org_id, name, persona, restoration_focus, status, company_id, contact_id,
    lead_id, owner, objective, audience_summary, offer_summary, compliance_notes,
    launch_locked, source_signal, source_system, reasoning_payload, audit_payload
  ) values (
    campaign_id,
    bsr_org,
    'Storm Leak Partner Follow-Up',
    'persona_property_manager',
    'water',
    'draft',
    lakeside_company,
    lakeside_contact,
    lakeside_lead,
    'Demo Operator',
    'Re-engage property managers after storm-related leak calls.',
    'Chicago property managers with recent water-loss urgency.',
    'Fast inspection and mitigation coordination for active leaks.',
    'Keep insurance language coverage-neutral.',
    true,
    jsonb_build_object('seed_source', seed_source, 'source', 'demo_seed'),
    'demo_seed',
    jsonb_build_object('why', 'Recent lead indicates a useful property-manager follow-up moment.'),
    jsonb_build_object('seed_source', seed_source)
  )
  on conflict (id) do update set
    name = excluded.name,
    persona = excluded.persona,
    restoration_focus = excluded.restoration_focus,
    status = excluded.status,
    company_id = excluded.company_id,
    contact_id = excluded.contact_id,
    lead_id = excluded.lead_id,
    owner = excluded.owner,
    objective = excluded.objective,
    audience_summary = excluded.audience_summary,
    offer_summary = excluded.offer_summary,
    compliance_notes = excluded.compliance_notes,
    launch_locked = excluded.launch_locked,
    source_signal = excluded.source_signal,
    source_system = excluded.source_system,
    reasoning_payload = excluded.reasoning_payload,
    audit_payload = excluded.audit_payload;

  insert into public.campaign_assets (
    id, org_id, campaign_id, asset_type, channel, title, status, tool_source,
    source_system, prompt_input, prompt_inputs, draft_body, dispatch_locked,
    compliance_notes, reasoning_payload, audit_payload
  ) values (
    asset_id,
    bsr_org,
    campaign_id,
    'email',
    'email',
    'Property manager storm follow-up email',
    'pending_approval',
    'mark',
    'demo_seed',
    'Draft a short partner follow-up for property managers after storm leak calls.',
    jsonb_build_object('persona', 'property_manager', 'loss_focus', 'water', 'seed_source', seed_source),
    'Hi Maya, checking in after the storm calls this week. If any units are still showing moisture, we can help document the issue and coordinate mitigation quickly.',
    true,
    'Coverage-neutral; avoids claim approval promises.',
    jsonb_build_object('recommended_action', 'review_before_sending'),
    jsonb_build_object('seed_source', seed_source, 'media_assets', jsonb_build_array())
  )
  on conflict (id) do update set
    campaign_id = excluded.campaign_id,
    asset_type = excluded.asset_type,
    channel = excluded.channel,
    title = excluded.title,
    status = excluded.status,
    tool_source = excluded.tool_source,
    source_system = excluded.source_system,
    prompt_input = excluded.prompt_input,
    prompt_inputs = excluded.prompt_inputs,
    draft_body = excluded.draft_body,
    dispatch_locked = excluded.dispatch_locked,
    compliance_notes = excluded.compliance_notes,
    reasoning_payload = excluded.reasoning_payload,
    audit_payload = excluded.audit_payload;

  insert into public.approval_items (
    id, org_id, campaign_id, campaign_asset_id, company_id, contact_id, lead_id,
    item_type, status, approval_required, locked_until_approved, prompt_inputs,
    draft_output, requested_by, risk_level, compliance_notes, reasoning_payload, audit_payload
  ) values (
    approval_id,
    bsr_org,
    campaign_id,
    asset_id,
    lakeside_company,
    lakeside_contact,
    lakeside_lead,
    'campaign_asset',
    'pending_approval',
    true,
    true,
    jsonb_build_object('seed_source', seed_source, 'channel', 'email'),
    'Hi Maya, checking in after the storm calls this week. If any units are still showing moisture, we can help document the issue and coordinate mitigation quickly.',
    'Mark',
    'low',
    'Ready for human review before any outbound send.',
    jsonb_build_object('recommendation', 'approve_after_operator_review'),
    jsonb_build_object('seed_source', seed_source)
  )
  on conflict (id) do update set
    campaign_id = excluded.campaign_id,
    campaign_asset_id = excluded.campaign_asset_id,
    company_id = excluded.company_id,
    contact_id = excluded.contact_id,
    lead_id = excluded.lead_id,
    item_type = excluded.item_type,
    status = excluded.status,
    approval_required = excluded.approval_required,
    locked_until_approved = excluded.locked_until_approved,
    prompt_inputs = excluded.prompt_inputs,
    draft_output = excluded.draft_output,
    requested_by = excluded.requested_by,
    risk_level = excluded.risk_level,
    compliance_notes = excluded.compliance_notes,
    reasoning_payload = excluded.reasoning_payload,
    audit_payload = excluded.audit_payload;

  insert into public.approval_decisions (
    id, org_id, approval_item_id, decision, decided_by, decision_notes,
    previous_status, next_status, metadata
  ) values (
    approval_decision_id,
    bsr_org,
    approval_id,
    'submitted',
    'Mark',
    'Demo item submitted for operator review.',
    'draft',
    'pending_approval',
    jsonb_build_object('seed_source', seed_source)
  )
  on conflict (id) do update set
    approval_item_id = excluded.approval_item_id,
    decision = excluded.decision,
    decided_by = excluded.decided_by,
    decision_notes = excluded.decision_notes,
    previous_status = excluded.previous_status,
    next_status = excluded.next_status,
    metadata = excluded.metadata;

  insert into public.campaign_events (
    id, org_id, campaign_id, campaign_asset_id, event_type, actor, detail, payload, occurred_at
  ) values
    (
      campaign_created_event_id,
      bsr_org,
      campaign_id,
      null,
      'created',
      'Demo Operator',
      'Demo campaign created for V2 workspace testing.',
      jsonb_build_object('seed_source', seed_source),
      now() - interval '3 hours'
    ),
    (
      asset_generated_event_id,
      bsr_org,
      campaign_id,
      asset_id,
      'asset_generated',
      'Mark',
      'Mark drafted a review-gated follow-up email.',
      jsonb_build_object('seed_source', seed_source),
      now() - interval '2 hours'
    )
  on conflict (id) do update set
    campaign_id = excluded.campaign_id,
    campaign_asset_id = excluded.campaign_asset_id,
    event_type = excluded.event_type,
    actor = excluded.actor,
    detail = excluded.detail,
    payload = excluded.payload,
    occurred_at = excluded.occurred_at;

  insert into public.campaign_results (
    id, org_id, campaign_id, campaign_asset_id, provider, external_id, channel, occurred_at, metrics, raw_payload
  ) values (
    campaign_result_id,
    bsr_org,
    campaign_id,
    asset_id,
    'demo',
    'demo-result-001',
    'email',
    now() - interval '1 hour',
    jsonb_build_object('seed_source', seed_source, 'impressions', 0, 'clicks', 0, 'conversions', 0),
    jsonb_build_object('seed_source', seed_source, 'note', 'Zeroed demo metrics for layout testing.')
  )
  on conflict (id) do update set
    campaign_id = excluded.campaign_id,
    campaign_asset_id = excluded.campaign_asset_id,
    provider = excluded.provider,
    external_id = excluded.external_id,
    channel = excluded.channel,
    occurred_at = excluded.occurred_at,
    metrics = excluded.metrics,
    raw_payload = excluded.raw_payload;

  insert into public.crm_notes (
    id, org_id, entity_type, entity_id, body, is_pinned, is_internal, author_kind, author_name
  ) values (
    note_id,
    bsr_org,
    'company',
    lakeside_company,
    'Demo note: Maya prefers concise email updates and quick scheduling windows after storm events.',
    true,
    true,
    'human',
    'Demo Operator'
  )
  on conflict (id) do update set
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    body = excluded.body,
    is_pinned = excluded.is_pinned,
    is_internal = excluded.is_internal,
    author_kind = excluded.author_kind,
    author_name = excluded.author_name;

  insert into public.crm_tasks (
    id, org_id, entity_type, entity_id, title, description, due_at, priority,
    status, assignee_kind, assignee_name, author_kind, author_name
  ) values (
    crm_task_id,
    bsr_org,
    'company',
    lakeside_company,
    'Call Maya after mitigation walk-through',
    'Confirm whether any additional units need moisture documentation.',
    now() + interval '2 days',
    'high',
    'open',
    'human',
    'Demo Operator',
    'agent',
    'Mark'
  )
  on conflict (id) do update set
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    title = excluded.title,
    description = excluded.description,
    due_at = excluded.due_at,
    priority = excluded.priority,
    status = excluded.status,
    assignee_kind = excluded.assignee_kind,
    assignee_name = excluded.assignee_name,
    author_kind = excluded.author_kind,
    author_name = excluded.author_name;

  insert into public.crm_activities (
    id, org_id, entity_type, entity_id, activity_type, summary, detail, actor_kind, actor_name, metadata
  ) values (
    activity_id,
    bsr_org,
    'company',
    lakeside_company,
    'task_created',
    'Follow-up task created for Lakeside Property Management.',
    'Mark suggested a call after the scheduled walk-through.',
    'agent',
    'Mark',
    jsonb_build_object('seed_source', seed_source, 'task_id', crm_task_id)
  )
  on conflict (id) do update set
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    activity_type = excluded.activity_type,
    summary = excluded.summary,
    detail = excluded.detail,
    actor_kind = excluded.actor_kind,
    actor_name = excluded.actor_name,
    metadata = excluded.metadata;

  insert into public.engagement_events (
    id, org_id, entity_type, entity_id, event_type, channel, summary, occurred_at, source_system, payload
  ) values (
    engagement_id,
    bsr_org,
    'lead',
    lakeside_lead,
    'form_submitted',
    'website',
    'Property manager submitted a storm leak form.',
    now() - interval '2 days',
    'demo_seed',
    jsonb_build_object('seed_source', seed_source, 'utm_source', 'google', 'utm_campaign', 'storm-response')
  )
  on conflict (id) do update set
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    event_type = excluded.event_type,
    channel = excluded.channel,
    summary = excluded.summary,
    occurred_at = excluded.occurred_at,
    source_system = excluded.source_system,
    payload = excluded.payload;

  insert into public.agents (
    id, org_id, key, name, description, status, allowed_actions, blocked_actions, default_approval_policy, metadata
  ) values (
    agent_id,
    bsr_org,
    'demo-strategy-agent',
    'Demo Strategy Agent',
    'Seeded agent row for testing task and output screens.',
    'active',
    '["draft_campaign","summarize_record","recommend_next_action"]'::jsonb,
    '["send_email","send_sms","publish_social","launch_ads"]'::jsonb,
    'approval_required',
    jsonb_build_object('seed_source', seed_source)
  )
  on conflict (org_id, key) do update set
    name = excluded.name,
    description = excluded.description,
    status = excluded.status,
    allowed_actions = excluded.allowed_actions,
    blocked_actions = excluded.blocked_actions,
    default_approval_policy = excluded.default_approval_policy,
    metadata = excluded.metadata;

  insert into public.agent_tasks (
    id, org_id, agent_id, status, priority, objective, task_type, source_type,
    source_id, campaign_id, approval_item_id, started_at, completed_at, metadata
  ) values (
    task_id,
    bsr_org,
    agent_id,
    'needs_approval',
    'high',
    'Draft a property-manager follow-up campaign after a water-loss lead.',
    'campaign_strategy',
    'lead',
    lakeside_lead,
    campaign_id,
    approval_id,
    now() - interval '3 hours',
    now() - interval '2 hours',
    jsonb_build_object('seed_source', seed_source)
  )
  on conflict (id) do update set
    agent_id = excluded.agent_id,
    status = excluded.status,
    priority = excluded.priority,
    objective = excluded.objective,
    task_type = excluded.task_type,
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    campaign_id = excluded.campaign_id,
    approval_item_id = excluded.approval_item_id,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    metadata = excluded.metadata;

  insert into public.agent_task_inputs (
    id, org_id, task_id, input_type, source_table, source_id, summary, payload
  ) values (
    task_input_id,
    bsr_org,
    task_id,
    'lead_context',
    'leads',
    lakeside_lead,
    'Qualified property-manager water-loss lead with high urgency.',
    jsonb_build_object('seed_source', seed_source, 'lead_score', 91)
  )
  on conflict (id) do update set
    task_id = excluded.task_id,
    input_type = excluded.input_type,
    source_table = excluded.source_table,
    source_id = excluded.source_id,
    summary = excluded.summary,
    payload = excluded.payload;

  insert into public.agent_outputs (
    id, org_id, task_id, approval_item_id, campaign_asset_id, output_type, title,
    body, structured_payload, risk_level, compliance_status, approval_status
  ) values (
    output_id,
    bsr_org,
    task_id,
    approval_id,
    asset_id,
    'campaign_asset',
    'Property manager follow-up draft',
    'Drafted a short, review-gated email for the property manager persona.',
    jsonb_build_object('seed_source', seed_source, 'channel', 'email'),
    'low',
    'passed',
    'pending_approval'
  )
  on conflict (id) do update set
    task_id = excluded.task_id,
    approval_item_id = excluded.approval_item_id,
    campaign_asset_id = excluded.campaign_asset_id,
    output_type = excluded.output_type,
    title = excluded.title,
    body = excluded.body,
    structured_payload = excluded.structured_payload,
    risk_level = excluded.risk_level,
    compliance_status = excluded.compliance_status,
    approval_status = excluded.approval_status;

  insert into public.agent_run_logs (
    id, org_id, task_id, agent_id, run_status, model_provider, model_name,
    reasoning_summary, started_at, completed_at, metadata
  ) values (
    run_log_id,
    bsr_org,
    task_id,
    agent_id,
    'completed',
    'demo',
    'demo-model',
    'Used lead urgency, persona, and campaign safety rules to draft a review-gated follow-up.',
    now() - interval '3 hours',
    now() - interval '2 hours',
    jsonb_build_object('seed_source', seed_source)
  )
  on conflict (id) do update set
    task_id = excluded.task_id,
    agent_id = excluded.agent_id,
    run_status = excluded.run_status,
    model_provider = excluded.model_provider,
    model_name = excluded.model_name,
    reasoning_summary = excluded.reasoning_summary,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    metadata = excluded.metadata;

  insert into public.mark_conversations (
    id, org_id, operator, title, status, campaign_id, last_message_at
  ) values (
    conversation_id,
    bsr_org,
    'Demo Operator',
    'Storm follow-up campaign',
    'active',
    campaign_id,
    now() - interval '30 minutes'
  )
  on conflict (id) do update set
    operator = excluded.operator,
    title = excluded.title,
    status = excluded.status,
    campaign_id = excluded.campaign_id,
    last_message_at = excluded.last_message_at;

  insert into public.mark_messages (
    id, org_id, conversation_id, role, body, status, agent_task_id, mentions, metadata, created_at
  ) values
    (
      operator_message_id,
      bsr_org,
      conversation_id,
      'operator',
      'Mark, help me turn the Lakeside water-loss lead into a safe property manager follow-up.',
      'sent',
      task_id,
      '[]'::jsonb,
      jsonb_build_object('seed_source', seed_source),
      now() - interval '40 minutes'
    ),
    (
      mark_message_id,
      bsr_org,
      conversation_id,
      'mark',
      'I drafted a review-gated email asset and linked it to the Lakeside campaign. It is blocked from dispatch until approval.',
      'complete',
      task_id,
      '[]'::jsonb,
      jsonb_build_object(
        'seed_source', seed_source,
        'actions', jsonb_build_array(jsonb_build_object('label', 'Review approval', 'href', '/approvals'))
      ),
      now() - interval '30 minutes'
    )
  on conflict (id) do update set
    conversation_id = excluded.conversation_id,
    role = excluded.role,
    body = excluded.body,
    status = excluded.status,
    agent_task_id = excluded.agent_task_id,
    mentions = excluded.mentions,
    metadata = excluded.metadata,
    created_at = excluded.created_at;

  insert into public.persona_snapshots (
    id, org_id, entity_type, entity_id, persona, hyper_persona_summary,
    relationship_stage, value_tier, dominant_loss_pattern, preferred_channel,
    message_posture, recommended_offer, next_best_action, confidence_score,
    risk_flags, reasoning_payload
  ) values (
    persona_snapshot_id,
    bsr_org,
    'company',
    lakeside_company,
    'persona_property_manager',
    'Property manager with active water-loss urgency and multi-unit coordination needs.',
    'active_partner',
    'high',
    'storm_water_intrusion',
    'email',
    'concise_and_operational',
    'fast inspection coordination',
    'Schedule post-walk-through follow-up',
    0.86,
    array['do_not_promise_claim_coverage'],
    jsonb_build_object('seed_source', seed_source)
  )
  on conflict (id) do update set
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    persona = excluded.persona,
    hyper_persona_summary = excluded.hyper_persona_summary,
    relationship_stage = excluded.relationship_stage,
    value_tier = excluded.value_tier,
    dominant_loss_pattern = excluded.dominant_loss_pattern,
    preferred_channel = excluded.preferred_channel,
    message_posture = excluded.message_posture,
    recommended_offer = excluded.recommended_offer,
    next_best_action = excluded.next_best_action,
    confidence_score = excluded.confidence_score,
    risk_flags = excluded.risk_flags,
    reasoning_payload = excluded.reasoning_payload;

  insert into public.next_best_actions (
    id, org_id, entity_type, entity_id, action_type, title, rationale, status,
    priority, source_agent_id, metadata
  ) values (
    nba_id,
    bsr_org,
    'company',
    lakeside_company,
    'follow_up',
    'Follow up after the scheduled mitigation walk-through',
    'The lead is high-urgency and the contact manages multiple units.',
    'suggested',
    'high',
    agent_id,
    jsonb_build_object('seed_source', seed_source)
  )
  on conflict (id) do update set
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    action_type = excluded.action_type,
    title = excluded.title,
    rationale = excluded.rationale,
    status = excluded.status,
    priority = excluded.priority,
    source_agent_id = excluded.source_agent_id,
    metadata = excluded.metadata;

  insert into public.vault_notes (
    id, org_id, slug, title, body, collection, pinned, metadata
  ) values (
    vault_note_id,
    bsr_org,
    'demo-property-manager-messaging',
    'Demo Property Manager Messaging Note',
    'Keep property manager outreach operational: what happened, what BSR can coordinate, and what needs approval before any outbound send.',
    'Messaging',
    true,
    jsonb_build_object('seed_source', seed_source)
  )
  on conflict (org_id, slug) do update set
    title = excluded.title,
    body = excluded.body,
    collection = excluded.collection,
    pinned = excluded.pinned,
    metadata = excluded.metadata;
end $$;
