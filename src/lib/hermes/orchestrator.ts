import { type SupabaseClient } from "@supabase/supabase-js";

import { parseHermesPartnerCampaignRequest, type HermesPartnerCampaignRequest } from "./contracts";
import { createPartnerCampaignDraft } from "./draft-engine";
import { getSupabaseAdminClient } from "../supabase/server";

export type HermesRunResult = {
  runId: string;
  agentId: string;
  agentTaskId: string;
  agentOutputId: string;
  approvalItemId: string;
  campaignId: string;
  campaignAssetId: string;
  companyId: string;
  contactId: string;
  leadId: string;
  personaSnapshotId: string;
  status: "needs_approval" | "blocked";
};

const sourceSystem = "hermes_agent_orchestrator";

export async function runHermesPartnerCampaign(
  input: unknown = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<HermesRunResult> {
  const request = parseHermesPartnerCampaignRequest(input);
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const startedAt = new Date().toISOString();
  const agentId = await upsertHermesAgent(client);
  const draft = createPartnerCampaignDraft(request);

  const companyId = await insertOne(client, "companies", {
    name: `${request.company.name} ${runId}`,
    persona: request.persona,
    status: "active",
    website_url: request.company.websiteUrl ?? null,
    phone: request.company.phone ?? null,
    email: request.company.email ?? null,
    partner_tier: request.company.partnerTier,
    metadata: {
      created_by: sourceSystem,
      run_id: runId,
      service_area_zips: request.company.serviceAreaZips,
      source_note: request.lead.lossSummary,
    },
  });

  const contactId = await insertOne(client, "contacts", {
    company_id: companyId,
    persona: request.persona,
    status: "active",
    first_name: request.contact.firstName,
    last_name: `${request.contact.lastName} ${runId.slice(-4)}`,
    email: request.contact.email ?? null,
    phone: request.contact.phone ?? null,
    title: request.contact.title,
    metadata: {
      created_by: sourceSystem,
      run_id: runId,
      relationship_stage: "new_target",
      confidence_score: request.lead.partnerScore,
    },
  });

  const leadId = await insertOne(client, "leads", {
    company_id: companyId,
    contact_id: contactId,
    persona: request.persona,
    status: "needs_review",
    routing_recommendation: draft.guardrails.riskLevel === "blocked" ? "archive_low_priority" : "target",
    source: request.lead.source,
    external_lead_id: `hermes-agent-${request.workflow}-${runId}`,
    loss_summary: request.lead.lossSummary,
    loss_signals: request.lead.lossSignals,
    matched_target_keywords: request.lead.matchedTargetKeywords,
    matched_non_target_keywords: [],
    lead_score: request.lead.leadScore,
    metadata: {
      created_by: sourceSystem,
      run_id: runId,
      confidence_score: request.lead.partnerScore,
      evidence_urls: request.lead.evidenceUrls,
      recommended_action: draft.recommendedAction,
      guardrail_flags: draft.guardrails.flags,
    },
  });

  const campaignId = await insertOne(client, "campaigns", {
    name: `${draft.campaignName} ${runId}`,
    persona: request.persona,
    restoration_focus: request.restorationFocus,
    status: draft.guardrails.approvalStatus === "needs_compliance" ? "blocked" : "pending_approval",
    company_id: companyId,
    contact_id: contactId,
    lead_id: leadId,
    owner: request.operator,
    objective: request.objective,
    audience_summary: draft.audienceSummary,
    offer_summary: draft.offerSummary,
    compliance_notes: draft.guardrails.complianceNotes,
    source_system: sourceSystem,
    external_campaign_id: `hermes-agent-campaign-${runId}`,
    launch_locked: true,
    campaign_phase: "partner_reactivation",
    source_signal: {
      run_id: runId,
      lead_id: leadId,
      lead_score: request.lead.leadScore,
      partner_score: request.lead.partnerScore,
      evidence_urls: request.lead.evidenceUrls,
    },
    reasoning_payload: draft.reasoningPayload,
    audit_payload: {
      created_by_agent_id: agentId,
      provider: "local_deterministic",
      outbound_locked: true,
    },
  });

  const personaSnapshotId = await insertOne(client, "persona_snapshots", {
    persona: request.persona,
    company_id: companyId,
    contact_id: contactId,
    lead_id: leadId,
    campaign_id: campaignId,
    is_current: true,
    snapshot_version: 1,
    hyper_persona_summary: draft.personaSummary,
    relationship_stage: "partner_growth",
    value_tier: request.lead.partnerScore >= 70 ? "high" : "medium",
    dominant_loss_pattern: request.restorationFocus,
    preferred_channel: request.channel === "sms" ? "sms_then_phone" : "email_then_phone",
    message_posture: "simple_handoff_partner_protection",
    recommended_offer: draft.offerSummary,
    next_best_action: draft.recommendedAction,
    confidence_score: request.lead.partnerScore,
    risk_flags: draft.guardrails.flags,
    source_events: [{ table: "leads", id: leadId, signal: "hermes_partner_campaign" }],
    reasoning_payload: draft.reasoningPayload,
    audit_payload: {
      created_by_agent_id: agentId,
      run_id: runId,
      outbound_locked: true,
    },
  });

  const campaignAssetId = await insertOne(client, "campaign_assets", {
    campaign_id: campaignId,
    asset_type: request.channel === "call_script" ? "script" : request.channel,
    channel: request.channel,
    title: draft.assetTitle,
    status: draft.guardrails.approvalStatus,
    source_system: sourceSystem,
    external_asset_id: `hermes-agent-${request.channel}-${runId}`,
    tool_source: "Hermes Orchestrator",
    prompt_input: draft.promptInput,
    prompt_inputs: draft.promptInputs,
    draft_body: draft.draftOutput,
    dispatch_locked: true,
    compliance_notes: draft.guardrails.complianceNotes,
    reasoning_payload: draft.reasoningPayload,
    audit_payload: {
      created_by_agent_id: agentId,
      run_id: runId,
      blocked_phrases: draft.guardrails.blockedPhrases,
    },
  });

  await insertCreativeAssets(client, {
    campaignId,
    agentId,
    runId,
    approvalStatus: draft.guardrails.approvalStatus,
    creativeAssets: request.creativeAssets,
  });

  const approvalItemId = await insertOne(client, "approval_items", {
    campaign_id: campaignId,
    campaign_asset_id: campaignAssetId,
    company_id: companyId,
    contact_id: contactId,
    lead_id: leadId,
    item_type: `${request.channel}_campaign_asset`,
    status: draft.guardrails.approvalStatus,
    approval_required: true,
    locked_until_approved: true,
    prompt_inputs: draft.promptInputs,
    draft_output: draft.draftOutput,
    requested_by: "Hermes Orchestrator",
    risk_level: draft.guardrails.riskLevel,
    compliance_notes: draft.guardrails.complianceNotes,
    reasoning_payload: draft.reasoningPayload,
    audit_payload: {
      created_by_agent_id: agentId,
      run_id: runId,
      provider: "local_deterministic",
      outbound_locked: true,
    },
  });

  await updateById(client, "campaigns", campaignId, { approval_item_id: approvalItemId });

  const agentTaskId = await insertOne(client, "agent_tasks", {
    agent_id: agentId,
    status: draft.guardrails.riskLevel === "blocked" ? "blocked" : "needs_approval",
    priority: draft.guardrails.riskLevel === "blocked" ? "urgent" : "high",
    objective: request.objective,
    task_type: "partner_campaign_orchestration",
    source_type: "lead",
    source_id: leadId,
    campaign_id: campaignId,
    persona_snapshot_id: personaSnapshotId,
    approval_item_id: approvalItemId,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    metadata: {
      run_id: runId,
      workflow: request.workflow,
      autonomy_level: 2,
      provider: "local_deterministic",
      human_approval_required: true,
      guardrail_flags: draft.guardrails.flags,
    },
  });

  await insertOne(client, "agent_task_inputs", {
    task_id: agentTaskId,
    input_type: "partner_campaign_request",
    source_table: "leads",
    source_id: leadId,
    summary: request.lead.lossSummary,
    payload: {
      request,
      draft_prompt: draft.promptInput,
    },
  });

  const agentOutputId = await insertOne(client, "agent_outputs", {
    task_id: agentTaskId,
    approval_item_id: approvalItemId,
    campaign_asset_id: campaignAssetId,
    output_type: "approval_card",
    title: `Review ${draft.assetTitle}`,
    body: draft.draftOutput,
    structured_payload: {
      run_id: runId,
      company_id: companyId,
      contact_id: contactId,
      lead_id: leadId,
      persona_snapshot_id: personaSnapshotId,
      campaign_id: campaignId,
      campaign_asset_id: campaignAssetId,
      approval_item_id: approvalItemId,
      guardrails: draft.guardrails,
    },
    risk_level: draft.guardrails.riskLevel,
    compliance_status: draft.guardrails.approvalStatus,
    approval_status: draft.guardrails.approvalStatus,
  });

  await insertOne(client, "agent_run_logs", {
    task_id: agentTaskId,
    agent_id: agentId,
    run_status: draft.guardrails.riskLevel === "blocked" ? "completed" : "completed",
    model_provider: "local",
    model_name: "hermes-deterministic-v1",
    input_token_count: 0,
    output_token_count: 0,
    cost_estimate_cents: 0,
    reasoning_summary:
      "Hermes created a partner campaign draft, checked guardrails, submitted an approval item, and kept outbound dispatch locked.",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    metadata: {
      run_id: runId,
      agent_output_id: agentOutputId,
      approval_item_id: approvalItemId,
      guardrail_flags: draft.guardrails.flags,
    },
  });

  await insertOne(client, "campaign_events", {
    campaign_id: campaignId,
    campaign_asset_id: campaignAssetId,
    approval_item_id: approvalItemId,
    event_type: "approval_submitted",
    actor: "Hermes Orchestrator",
    detail: "Hermes submitted a campaign asset for human approval.",
    payload: {
      run_id: runId,
      agent_task_id: agentTaskId,
      agent_output_id: agentOutputId,
      risk_level: draft.guardrails.riskLevel,
      outbound_locked: true,
    },
  });

  return {
    runId,
    agentId,
    agentTaskId,
    agentOutputId,
    approvalItemId,
    campaignId,
    campaignAssetId,
    companyId,
    contactId,
    leadId,
    personaSnapshotId,
    status: draft.guardrails.riskLevel === "blocked" ? "blocked" : "needs_approval",
  };
}

async function upsertHermesAgent(client: SupabaseClient) {
  const { data, error } = await client
    .from("agents")
    .upsert(
      {
        key: "hermes",
        name: "Hermes Orchestrator",
        description: "Coordinates Growth Engine sub-workflows and routes outbound-facing work into human approval.",
        status: "ready",
        allowed_actions: [
          "create_internal_crm_records",
          "create_campaign_brief",
          "generate_draft_assets",
          "run_guardrail_checks",
          "create_approval_item",
          "write_agent_audit_log",
        ],
        blocked_actions: ["send_email", "send_sms", "publish_social_post", "launch_ads", "change_ad_spend"],
        default_approval_policy: "human_required_before_outbound",
        system_instructions:
          "Create structured growth work in draft states. Never send, publish, launch, or spend without human approval.",
        metadata: {
          autonomy_level: 2,
          runtime: "local_deterministic",
          openai_adapter: "planned",
        },
      },
      { onConflict: "key" },
    )
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(`agents upsert failed: ${error.message}`);
  }

  return data.id;
}

// Map a request creative type to an allowed campaign_asset_type enum value.
// The detail view's category (Physical / Ads / Media) is derived from
// asset_type + channel + title, so these land in the right section.
const CREATIVE_ASSET_TYPE: Record<HermesCreativeAsset["type"], string> = {
  image: "image_prompt",
  video: "video_prompt",
  ad: "social_ad",
  postcard: "other",
  file: "other",
  link: "other",
};

type HermesCreativeAsset = HermesPartnerCampaignRequest["creativeAssets"][number];

function defaultCreativeTitle(type: HermesCreativeAsset["type"]) {
  const titles: Record<HermesCreativeAsset["type"], string> = {
    image: "Image creative",
    video: "Video creative",
    ad: "Ad creative",
    postcard: "Postcard",
    file: "Attached file",
    link: "Creative link",
  };
  return titles[type];
}

/**
 * Persist each attached creative as its own campaign_asset. The media URL is
 * stored under `audit_payload.media_assets` — a key the campaigns read-model
 * already scans — so it renders as an image/video/file preview in the gallery
 * cover and the Creative tab. Dispatch stays locked; status mirrors the draft.
 */
async function insertCreativeAssets(
  client: SupabaseClient,
  input: {
    campaignId: string;
    agentId: string;
    runId: string;
    approvalStatus: string;
    creativeAssets: HermesPartnerCampaignRequest["creativeAssets"];
  },
) {
  for (const [index, creative] of input.creativeAssets.entries()) {
    const title = creative.title ?? defaultCreativeTitle(creative.type);

    await insertOne(client, "campaign_assets", {
      campaign_id: input.campaignId,
      asset_type: CREATIVE_ASSET_TYPE[creative.type],
      channel: creative.type,
      title,
      status: input.approvalStatus,
      source_system: sourceSystem,
      external_asset_id: `hermes-agent-creative-${creative.type}-${input.runId}-${index}`,
      tool_source: "Hermes Orchestrator",
      prompt_inputs: {},
      draft_body: creative.description ?? null,
      dispatch_locked: true,
      reasoning_payload: {},
      audit_payload: {
        created_by_agent_id: input.agentId,
        run_id: input.runId,
        media_assets: [
          {
            url: creative.url,
            type: creative.type,
            title,
            description: creative.description ?? null,
            thumbnail_url: creative.thumbnailUrl ?? null,
          },
        ],
      },
    });
  }
}

async function insertOne(client: SupabaseClient, table: string, values: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(values).select("id").single<{ id: string }>();

  if (error) {
    throw new Error(`${table} insert failed: ${error.message}`);
  }

  return data.id;
}

async function updateById(client: SupabaseClient, table: string, id: string, values: Record<string, unknown>) {
  const { error } = await client.from(table).update(values).eq("id", id);

  if (error) {
    throw new Error(`${table} update failed: ${error.message}`);
  }
}
