import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env.local");
  const envText = readFileSync(envPath, "utf8");

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] = value;
  }
}

function getSupabase() {
  loadLocalEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function insertOne(supabase, table, values) {
  const { data, error } = await supabase.from(table).insert(values).select("id").single();

  if (error) {
    throw new Error(`${table} insert failed: ${error.message}`);
  }

  return data.id;
}

async function upsertAgent(supabase) {
  const { data, error } = await supabase
    .from("agents")
    .upsert(
      {
        key: "hermes-demo",
        name: "Hermes Demo Orchestrator",
        description: "Seed/demo agent that creates reviewable lead and campaign work before live Hermes is connected.",
        status: "ready",
        allowed_actions: [
          "create_lead_draft",
          "create_campaign_draft",
          "create_approval_item",
          "write_agent_audit_log",
        ],
        blocked_actions: ["send_email", "send_sms", "publish_social_post", "change_ad_spend"],
        default_approval_policy: "human_required_before_outbound",
        system_instructions:
          "Create structured growth work in draft states. Never send, publish, or spend without approval.",
        metadata: {
          autonomy_level: 2,
          seeded_by: "scripts/seed-hermes-demo.mjs",
        },
      },
      { onConflict: "key" },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`agents upsert failed: ${error.message}`);
  }

  return data.id;
}

async function seedHermesDemo() {
  const supabase = getSupabase();
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const sourceSystem = "hermes_demo_seed";
  const persona = "persona_plumbing_partner";

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "big-shoulders-restoration")
    .single();
  if (orgError || !org) throw new Error("Seed requires the big-shoulders-restoration organization (run the tenancy migration first).");
  const orgId = org.id;

  const agentId = await upsertAgent(supabase);

  const companyId = await insertOne(supabase, "companies", {
    name: `Demo Plumbing Partner ${runId}`,
    persona,
    org_id: orgId,
    status: "active",
    website_url: "https://example-plumbing.local",
    phone: "312-555-0142",
    email: "dispatch@example-plumbing.local",
    partner_tier: "A",
    metadata: {
      demo_seed: true,
      run_id: runId,
      source_note: "High-fit plumbing partner discovered in a target Chicago ZIP cluster.",
      service_area_zips: ["60618", "60625", "60647"],
    },
  });

  const contactId = await insertOne(supabase, "contacts", {
    company_id: companyId,
    persona,
    org_id: orgId,
    status: "active",
    first_name: "Jordan",
    last_name: "Demo",
    email: "jordan.demo@example-plumbing.local",
    phone: "312-555-0198",
    title: "Operations Manager",
    metadata: {
      demo_seed: true,
      run_id: runId,
      relationship_stage: "new_target",
      confidence_score: 86,
    },
  });

  const leadId = await insertOne(supabase, "leads", {
    company_id: companyId,
    contact_id: contactId,
    persona,
    org_id: orgId,
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
      demo_seed: true,
      run_id: runId,
      confidence_score: 84,
      reason_found:
        "Service area overlaps high-opportunity Chicago ZIPs and business profile suggests after-hours plumbing calls.",
      recommended_action: "Approve lead and review partner outreach campaign draft.",
      evidence_urls: ["https://example-plumbing.local"],
    },
  });

  const campaignId = await insertOne(supabase, "campaigns", {
    name: `Plumbing Partner Outreach Demo ${runId}`,
    persona,
    restoration_focus: "water_backup",
    status: "pending_approval",
    company_id: companyId,
    contact_id: contactId,
    lead_id: leadId,
    owner: "Hermes Demo",
    objective: "Create a referral relationship with a high-fit plumbing partner.",
    audience_summary: "Chicago plumbing operators who encounter active water damage before restoration teams.",
    offer_summary: "Fast handoff, documentation, and customer relationship protection for water-loss referrals.",
    compliance_notes: "Coverage-neutral. No insurance claim outcome promises. No guaranteed response time claims.",
    source_system: sourceSystem,
    external_campaign_id: `hermes-demo-campaign-${runId}`,
    launch_locked: true,
    campaign_phase: "partner_reactivation",
    source_signal: {
      demo_seed: true,
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

  const draftBody = [
    "Subject: Fast water-loss handoff for your plumbing customers",
    "",
    "Hi Jordan,",
    "",
    "When your team stops the source of a water issue, Big Shoulders Restoration can help with the mitigation, documentation, and rebuild coordination that protects the customer relationship you already earned.",
    "",
    "Would it be useful to set up a simple referral handoff process for active water backups, burst pipes, or standing-water calls in your service area?",
    "",
    "Best,",
    "Big Shoulders Restoration",
  ].join("\n");

  const campaignAssetId = await insertOne(supabase, "campaign_assets", {
    campaign_id: campaignId,
    asset_type: "email",
    channel: "email",
    title: "Initial plumbing partner referral email",
    status: "pending_approval",
    source_system: sourceSystem,
    external_asset_id: `hermes-demo-email-${runId}`,
    tool_source: "Hermes Demo Orchestrator",
    prompt_input:
      "Draft coverage-neutral first-touch copy for a plumbing partner referral relationship.",
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
      demo_seed: true,
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
    requested_by: "Hermes Demo Orchestrator",
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
      },
    },
    audit_payload: {
      demo_seed: true,
      run_id: runId,
      created_by_agent_id: agentId,
      outbound_locked: true,
    },
  });

  await supabase.from("campaigns").update({ approval_item_id: approvalItemId }).eq("id", campaignId);

  const agentTaskId = await insertOne(supabase, "agent_tasks", {
    agent_id: agentId,
    status: "needs_approval",
    priority: "high",
    objective: "Prepare a plumbing partner lead and first-touch campaign draft for human review.",
    task_type: "lead_discovery_campaign_draft",
    source_type: "company",
    source_id: companyId,
    campaign_id: campaignId,
    approval_item_id: approvalItemId,
    completed_at: new Date().toISOString(),
    metadata: {
      demo_seed: true,
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
    model_name: "hermes-demo-seed",
    input_token_count: 0,
    output_token_count: 0,
    cost_estimate_cents: 0,
    reasoning_summary:
      "Seeded a linked company, contact, lead, campaign, asset, approval item, task input, output, and audit log for the first Hermes approval workflow.",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    metadata: {
      demo_seed: true,
      run_id: runId,
      agent_output_id: agentOutputId,
    },
  });

  await insertOne(supabase, "campaign_events", {
    campaign_id: campaignId,
    campaign_asset_id: campaignAssetId,
    approval_item_id: approvalItemId,
    event_type: "approval_submitted",
    actor: "Hermes Demo Orchestrator",
    detail: "Demo campaign asset submitted for owner approval.",
    payload: {
      demo_seed: true,
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
    campaignId,
    campaignAssetId,
    approvalItemId,
    agentTaskId,
    agentOutputId,
  };
}

seedHermesDemo()
  .then((result) => {
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
    process.exit(1);
  });
