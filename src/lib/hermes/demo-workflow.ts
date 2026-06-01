import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "../supabase/server";

export type HermesDemoWorkflowResult = {
  runId: string;
  agentId: string;
  companyId: string;
  contactId: string;
  leadId: string;
  personaSnapshotId: string;
  campaignId: string;
  campaignAssetId: string;
  approvalItemId: string;
  agentTaskId: string;
  agentOutputId: string;
};

const persona = "persona_plumbing_partner";
const sourceSystem = "hermes_demo_workflow";

export async function runHermesDemoWorkflow(client?: SupabaseClient): Promise<HermesDemoWorkflowResult> {
  const supabase = client ?? getSupabaseAdminClient();
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const agentId = await upsertHermesDemoAgent(supabase);

  await ensureGuardrails(supabase);

  const companyId = await insertOne(supabase, "companies", {
    name: `Hermes Plumbing Partner ${runId}`,
    persona,
    status: "active",
    website_url: "https://example-plumbing.local",
    phone: "312-555-0142",
    email: "dispatch@example-plumbing.local",
    partner_tier: "A",
    metadata: {
      demo_workflow: true,
      run_id: runId,
      owner: "Hermes",
      source_note: "High-fit plumbing partner discovered in a target Chicago ZIP cluster.",
      service_area_zips: ["60618", "60625", "60647"],
    },
  });

  const contactId = await insertOne(supabase, "contacts", {
    company_id: companyId,
    persona,
    status: "active",
    first_name: "Jordan",
    last_name: `Hermes ${runId.slice(-4)}`,
    email: `jordan.${runId}@example-plumbing.local`,
    phone: "312-555-0198",
    title: "Operations Manager",
    metadata: {
      demo_workflow: true,
      run_id: runId,
      owner: "Hermes",
      relationship_stage: "new_target",
      confidence_score: 86,
    },
  });

  const leadId = await insertOne(supabase, "leads", {
    company_id: companyId,
    contact_id: contactId,
    persona,
    status: "needs_review",
    routing_recommendation: "target",
    source: "hermes_demo",
    external_lead_id: `hermes-demo-plumbing-${runId}`,
    loss_summary:
      "Plumbing company in priority Chicago ZIPs. Hermes recommends partner outreach for water-loss referral handoff.",
    loss_signals: ["water_backup", "burst_pipe", "emergency_service"],
    matched_target_keywords: ["plumber", "water damage", "emergency repair"],
    matched_non_target_keywords: [],
    lead_score: 88,
    metadata: {
      demo_workflow: true,
      run_id: runId,
      owner: "Hermes",
      confidence_score: 84,
      reason_found:
        "Service area overlaps high-opportunity Chicago ZIPs and business profile suggests after-hours plumbing calls.",
      recommended_action: "Approve lead and review partner outreach campaign draft.",
      evidence_urls: ["https://example-plumbing.local"],
    },
  });

  const campaignId = await insertOne(supabase, "campaigns", {
    name: `Plumbing Partner Outreach ${runId}`,
    persona,
    restoration_focus: "water_backup",
    status: "pending_approval",
    company_id: companyId,
    contact_id: contactId,
    lead_id: leadId,
    owner: "Hermes",
    objective: "Create a referral relationship with a high-fit plumbing partner.",
    audience_summary: "Chicago plumbing operators who encounter active water damage before restoration teams.",
    offer_summary: "Fast handoff, documentation, and customer relationship protection for water-loss referrals.",
    compliance_notes: "Coverage-neutral. No insurance claim outcome promises. No guaranteed response time claims.",
    source_system: sourceSystem,
    external_campaign_id: `hermes-demo-campaign-${runId}`,
    launch_locked: true,
    campaign_phase: "partner_reactivation",
    source_signal: {
      demo_workflow: true,
      run_id: runId,
      lead_id: leadId,
      score: 88,
    },
    reasoning_payload: {
      why_now: "Partner fit is high and target ZIP overlap makes referral timing useful.",
      target_persona: persona,
      recommended_channels: ["email", "sms"],
    },
    audit_payload: {
      created_by_agent_id: agentId,
      outbound_locked: true,
    },
  });

  const personaSnapshotId = await insertOne(supabase, "persona_snapshots", {
    persona,
    company_id: companyId,
    contact_id: contactId,
    lead_id: leadId,
    campaign_id: campaignId,
    is_current: true,
    snapshot_version: 1,
    hyper_persona_summary:
      "New plumbing partner candidate with source-stop water loss handoff potential in priority Chicago ZIPs.",
    relationship_stage: "partner_growth",
    value_tier: "high",
    dominant_loss_pattern: "source_stop_water_damage",
    preferred_channel: "email_then_phone",
    message_posture: "simple_handoff_partner_protection",
    recommended_offer: "Simple water-damage referral lane with documentation support.",
    next_best_action: "Review and approve the first-touch plumbing partner email.",
    confidence_score: 88,
    risk_flags: ["human_approval_required", "coverage_neutral_language_required"],
    source_events: [{ table: "leads", id: leadId, signal: "high_fit_plumbing_partner" }],
    reasoning_payload: {
      created_by_agent_id: agentId,
      run_id: runId,
    },
    audit_payload: {
      demo_workflow: true,
      outbound_locked: true,
    },
  });

  await insertOne(supabase, "persona_knowledge_entries", {
    persona,
    section_key: `partner_handoff_${runId}`,
    entry_type: "messaging_angle",
    title: "Source-stop referral handoff",
    body: "Emphasize that the plumber keeps the customer relationship while BSR handles mitigation, documentation, and restoration coordination.",
    priority: 88,
    status: "active",
    source_reference: `hermes_demo_workflow:${runId}`,
    metadata: {
      demo_workflow: true,
      run_id: runId,
    },
  });

  const draftBody = buildDraftBody(runId);
  const campaignAssetId = await insertOne(supabase, "campaign_assets", {
    campaign_id: campaignId,
    asset_type: "email",
    channel: "email",
    title: "Initial plumbing partner referral email",
    status: "pending_owner_approval",
    source_system: sourceSystem,
    external_asset_id: `hermes-demo-email-${runId}`,
    tool_source: "Hermes Demo Workflow",
    prompt_input: "Draft coverage-neutral first-touch copy for a plumbing partner referral relationship.",
    prompt_inputs: {
      persona,
      channel: "email",
      tone: "professional, direct, partner-protective",
      cta: "Set up referral handoff process",
      urgency: "medium",
      damage_classification: "water_backup",
    },
    draft_body: draftBody,
    dispatch_locked: true,
    compliance_notes: "No coverage promise detected. No claim approval language detected.",
    reasoning_payload: {
      message_angle: "Protect the plumber relationship while BSR handles mitigation.",
      do_not_say: ["insurance will cover it", "guaranteed payout", "claim approval"],
    },
    audit_payload: {
      demo_workflow: true,
      run_id: runId,
      created_by_agent_id: agentId,
    },
  });

  const approvalItemId = await insertOne(supabase, "approval_items", {
    campaign_id: campaignId,
    campaign_asset_id: campaignAssetId,
    company_id: companyId,
    contact_id: contactId,
    lead_id: leadId,
    item_type: "email_campaign_asset",
    status: "pending_owner_approval",
    approval_required: true,
    locked_until_approved: true,
    prompt_inputs: {
      persona,
      target_audience: "Chicago plumbing partner",
      related_company_id: companyId,
      related_contact_id: contactId,
      related_lead_id: leadId,
      guardrail_summary: "coverage-neutral language required",
    },
    draft_output: draftBody,
    requested_by: "Hermes Demo Workflow",
    risk_level: "medium",
    compliance_notes:
      "Review before outbound. Draft avoids insurance coverage guarantees and asks for a referral process conversation.",
    reasoning_payload: {
      why_hermes_created_it:
        "The lead scored 88 because it matches the plumbing partner persona, service area, and likely water-loss referral context.",
      recommended_action: "Approve lead and edit/approve the first-touch email if brand voice is acceptable.",
      source_data: {
        company_id: companyId,
        contact_id: contactId,
        lead_id: leadId,
        persona_snapshot_id: personaSnapshotId,
      },
    },
    audit_payload: {
      demo_workflow: true,
      run_id: runId,
      created_by_agent_id: agentId,
      outbound_locked: true,
    },
  });

  await updateById(supabase, "campaigns", campaignId, { approval_item_id: approvalItemId });

  const agentTaskId = await insertOne(supabase, "agent_tasks", {
    agent_id: agentId,
    status: "needs_approval",
    priority: "high",
    objective: "Prepare a plumbing partner lead and first-touch campaign draft for human review.",
    task_type: "lead_discovery_campaign_draft",
    source_type: "company",
    source_id: companyId,
    campaign_id: campaignId,
    persona_snapshot_id: personaSnapshotId,
    approval_item_id: approvalItemId,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    metadata: {
      demo_workflow: true,
      run_id: runId,
      autonomy_level: 2,
      human_approval_required: true,
    },
  });

  await insertOne(supabase, "agent_task_inputs", {
    task_id: agentTaskId,
    input_type: "lead_discovery_signal",
    source_table: "leads",
    source_id: leadId,
    summary: "High-fit plumbing partner in priority Chicago ZIPs.",
    payload: {
      persona,
      score: 88,
      evidence_urls: ["https://example-plumbing.local"],
      target_keywords: ["plumber", "water damage", "emergency repair"],
    },
  });

  const agentOutputId = await insertOne(supabase, "agent_outputs", {
    task_id: agentTaskId,
    approval_item_id: approvalItemId,
    campaign_asset_id: campaignAssetId,
    output_type: "approval_card",
    title: "Review plumbing partner outreach draft",
    body: draftBody,
    structured_payload: {
      company_id: companyId,
      contact_id: contactId,
      lead_id: leadId,
      persona_snapshot_id: personaSnapshotId,
      campaign_id: campaignId,
      campaign_asset_id: campaignAssetId,
      approval_item_id: approvalItemId,
    },
    risk_level: "medium",
    compliance_status: "pending_owner_approval",
    approval_status: "pending_owner_approval",
  });

  await insertOne(supabase, "agent_run_logs", {
    task_id: agentTaskId,
    agent_id: agentId,
    run_status: "completed",
    model_provider: "seed",
    model_name: "hermes-demo-workflow",
    input_token_count: 0,
    output_token_count: 0,
    cost_estimate_cents: 0,
    reasoning_summary:
      "Created a linked company, contact, lead, persona snapshot, campaign, asset, approval item, task input, output, and audit log for the Hermes approval workflow.",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    metadata: {
      demo_workflow: true,
      run_id: runId,
      agent_output_id: agentOutputId,
    },
  });

  await insertOne(supabase, "campaign_events", {
    campaign_id: campaignId,
    campaign_asset_id: campaignAssetId,
    approval_item_id: approvalItemId,
    event_type: "approval_submitted",
    actor: "Hermes Demo Workflow",
    detail: "Demo campaign asset submitted for owner approval.",
    payload: {
      demo_workflow: true,
      run_id: runId,
      agent_task_id: agentTaskId,
      agent_output_id: agentOutputId,
    },
  });

  return {
    runId,
    agentId,
    companyId,
    contactId,
    leadId,
    personaSnapshotId,
    campaignId,
    campaignAssetId,
    approvalItemId,
    agentTaskId,
    agentOutputId,
  };
}

async function upsertHermesDemoAgent(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("agents")
    .upsert(
      {
        key: "hermes-demo",
        name: "Hermes Demo Orchestrator",
        description: "Demo orchestrator that creates reviewable lead and campaign work before live Hermes is connected.",
        status: "ready",
        allowed_actions: ["create_lead_draft", "create_campaign_draft", "create_approval_item", "write_agent_audit_log"],
        blocked_actions: ["send_email", "send_sms", "publish_social_post", "change_ad_spend"],
        default_approval_policy: "human_required_before_outbound",
        system_instructions: "Create structured growth work in draft states. Never send, publish, or spend without approval.",
        metadata: {
          autonomy_level: 2,
          demo_workflow_ready: true,
        },
      },
      { onConflict: "key" },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`agents upsert failed: ${error.message}`);
  }

  return data.id as string;
}

async function ensureGuardrails(supabase: SupabaseClient) {
  const rules = [
    {
      rule_key: "no_coverage_or_claim_approval_promises",
      scope: "generated_output",
      severity: "blocker",
      status: "active",
      pattern: "(covered|approved|guaranteed payout|insurance will pay)",
      failure_message: "Outbound copy cannot promise insurance coverage, claim approval, or payout outcomes.",
    },
    {
      rule_key: "human_approval_before_outbound",
      scope: "dispatch_payload",
      severity: "blocker",
      status: "active",
      pattern: null,
      failure_message: "No outbound email, SMS, post, ad, or spend change can execute until a human approval item is approved.",
    },
  ];

  const { error } = await supabase.from("guardrail_rules").upsert(rules, { onConflict: "rule_key" });

  if (error) {
    throw new Error(`guardrail_rules upsert failed: ${error.message}`);
  }
}

async function insertOne(supabase: SupabaseClient, table: string, values: Record<string, unknown>) {
  const { data, error } = await supabase.from(table).insert(values).select("id").single();

  if (error) {
    throw new Error(`${table} insert failed: ${error.message}`);
  }

  return data.id as string;
}

async function updateById(supabase: SupabaseClient, table: string, id: string, values: Record<string, unknown>) {
  const { error } = await supabase.from(table).update(values).eq("id", id);

  if (error) {
    throw new Error(`${table} update failed: ${error.message}`);
  }
}

function buildDraftBody(runId: string) {
  return [
    "Subject: Fast water-loss handoff for your plumbing customers",
    "",
    `Hi Jordan,`,
    "",
    "When your team stops the source of a water issue, Big Shoulders Restoration can help with mitigation, documentation, and rebuild coordination that protects the customer relationship you already earned.",
    "",
    "Would it be useful to set up a simple referral handoff process for active water backups, burst pipes, or standing-water calls in your service area?",
    "",
    "Best,",
    "Big Shoulders Restoration",
    "",
    `Internal run: ${runId}`,
  ].join("\n");
}
