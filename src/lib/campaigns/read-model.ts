import { type SupabaseClient } from "@supabase/supabase-js";

import { campaignDriver, deriveCampaignRollup, type CampaignDriver, type CampaignRollup } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

const CAMPAIGN_SELECT =
  "id,name,persona,restoration_focus,status,company_id,contact_id,lead_id,owner,objective,audience_summary,offer_summary,compliance_notes,launch_locked,source_signal,source_system,reasoning_payload,audit_payload,created_at,updated_at";
const ASSET_SELECT =
  "id,campaign_id,asset_type,channel,title,status,tool_source,prompt_input,prompt_inputs,draft_body,edited_body,approved_body,dispatch_locked,compliance_notes,reasoning_payload,audit_payload,created_at,updated_at";
const APPROVAL_SELECT =
  "id,campaign_id,campaign_asset_id,company_id,contact_id,lead_id,item_type,status,locked_until_approved,prompt_inputs,draft_output,edited_output,requested_by,submitted_at,risk_level,compliance_notes,decision_notes,reasoning_payload,audit_payload,created_at,updated_at";
const OUTPUT_SELECT =
  "id,task_id,approval_item_id,campaign_asset_id,output_type,title,body,edited_body,structured_payload,risk_level,compliance_status,approval_status,created_at,updated_at";
const AGENT_TASK_SELECT = "id,objective,task_type,status,priority,metadata,created_at,updated_at";
const DECISION_SELECT = "id,approval_item_id,decision,decided_by,decided_at,decision_notes,previous_status,next_status";

export type CampaignWorkspaceAssetCategory = "physical" | "virtual" | "ads" | "media" | "other";

export type CampaignMediaAsset = {
  id: string;
  type: "image" | "video" | "embed" | "file" | "link";
  title: string;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string | null;
  description: string | null;
  source: string;
};

export type CampaignWorkspaceListItem = {
  id: string;
  name: string;
  persona: string;
  status: string;
  lifecycle: CampaignLaunchState["lifecycle"];
  pendingCount: number;
  pendingDeliverables: PendingDeliverable[];
  objective: string;
  audienceSummary: string;
  offerSummary: string;
  whyBuilt: string;
  assetCount: number;
  approvalCount: number;
  mediaCount: number;
  sourceCount: number;
  thumbnailUrl: string | null;
  assetTypes: string[];
  /** "operator" | "agent" — who is driving, for the card avatar. */
  driver: CampaignDriver;
  /** Distinct channel labels for the card subline, e.g. ["Meta", "Email"]. */
  channels: string[];
  previewText: string | null;
  previewLabel: string | null;
  contentPieces: CampaignListContentPiece[];
  updatedAt: string;
  updatedAtIso: string;
  href: string;
  rollup: CampaignRollup;
};

export type CampaignListContentPiece = {
  id: string;
  title: string;
  kind: string;
  channel: string;
  status: string;
  preview: string;
  media: CampaignMediaAsset[];
  updatedAt: string;
  needsReview: boolean;
};

export type CampaignWorkspaceList =
  | {
      status: "live";
      campaigns: CampaignWorkspaceListItem[];
      totals: {
        campaigns: number;
        assets: number;
        approvals: number;
        media: number;
      };
    }
  | {
      status: "unavailable";
      message: string;
    };

export type CampaignWorkspaceAsset = {
  id: string;
  title: string;
  assetType: string;
  category: CampaignWorkspaceAssetCategory;
  channel: string;
  status: string;
  body: string;
  preview: string;
  complianceNotes: string;
  dispatchLocked: boolean;
  toolSource: string | null;
  updatedAt: string;
  media: CampaignMediaAsset[];
  /** Original draft vs current text, present only when Arc revised the piece.
   *  Drives the "What changed" diff in the review drawer. */
  revision: { draft: string; current: string } | null;
  /** The approval item gating this deliverable, if one exists — drives the
   *  per-asset Approve/Decline controls in the Deliverables tab. */
  approval: { id: string; status: string } | null;
};

export type CampaignWorkspaceReasoning = {
  whyBuilt: string;
  recommendedAction: string;
  guardrailFlags: string[];
  toolsUsed: string[];
  promptInputs: Array<{ label: string; value: string }>;
};

export type CampaignExecutiveOverview = {
  what: string;
  why: string;
  timeframe: string;
  where: string;
  successTracking: string;
};

export type CampaignWorkspaceApproval = {
  id: string;
  title: string;
  type: string;
  status: string;
  riskLevel: string;
  requestedBy: string;
  submittedAt: string;
  href: string;
  preview: string;
  media: CampaignMediaAsset[];
  promptInputs: Array<{ label: string; value: string }>;
  complianceNotes: string;
};

export type CampaignWorkspaceSource = {
  id: string;
  label: string;
  detail: string;
  url: string | null;
  /** Internal link to the CRM record page, when this source is a CRM record. */
  recordHref: string | null;
  kind: "company" | "contact" | "lead" | "web" | "evidence";
};

export type CampaignWorkspaceActivity = {
  id: string;
  title: string;
  outputType: string;
  status: string;
  riskLevel: string;
  createdAt: string;
  body: string;
};

export type CampaignWorkspaceEvent = {
  id: string;
  type: string;
  actor: string;
  detail: string;
  occurredAt: string;
};

export type CampaignWorkspaceMeta = {
  id: string;
  name: string;
  persona: string;
  restorationFocus: string;
  status: string;
  objective: string;
  audienceSummary: string;
  offerSummary: string;
  complianceNotes: string;
  owner: string;
  launchLocked: boolean;
  createdAt: string;
  updatedAt: string;
  rollup: CampaignRollup;
};

export type CampaignWorkspaceMetrics = {
  assets: number;
  approvals: number;
  media: number;
  sources: number;
};

/** One recorded decision in the campaign's approval audit trail. Sourced from
 *  approval_decisions — the real history of who decided what, when, and why. */
export type CampaignDecisionEvent = {
  id: string;
  decision: string;
  action: string;
  tone: "green" | "red" | "amber" | "blue" | "gray";
  itemTitle: string;
  decidedBy: string;
  at: string;
  notes: string | null;
};

/** One entry in the campaign audit trail — a unified, chronological log of what
 *  the operator and Arc did, tagged by actor so it can be filtered. */
export type AuditEntry = {
  id: string;
  actor: string;
  actorKind: "user" | "arc" | "system";
  action: string;
  detail: string;
  at: string;
};

/** One turn in the campaign's conversation with Arc. Operator turns are the
 *  durable directives we queue (agent_tasks); Arc's turns are the work he
 *  produces (agent_outputs). Both are real records, sorted chronologically. */
export type ArcMessage = {
  id: string;
  role: "operator" | "arc";
  author: string;
  kind: string;
  title: string | null;
  body: string;
  at: string;
  status: string | null;
};

/** Derived launch readiness for a campaign — the single source of truth behind
 *  the lifecycle label and the Launch button. Approval happens per deliverable;
 *  the campaign becomes Ready when no gating piece is still pending, and Live
 *  once the operator launches (campaign no longer launch-locked). */
export type CampaignLaunchState = {
  requiredCount: number;
  approvedCount: number;
  pendingCount: number;
  deployedCount: number;
  ready: boolean;
  live: boolean;
  lifecycle: "Drafting" | "In review" | "Ready" | "Live";
};

export type LiveCampaignWorkspace = {
  status: "live";
  campaign: CampaignWorkspaceMeta;
  assets: CampaignWorkspaceAsset[];
  groupedAssets: Record<CampaignWorkspaceAssetCategory, CampaignWorkspaceAsset[]>;
  approvals: CampaignWorkspaceApproval[];
  media: CampaignMediaAsset[];
  sources: CampaignWorkspaceSource[];
  activity: CampaignWorkspaceActivity[];
  events: CampaignWorkspaceEvent[];
  reasoning: CampaignWorkspaceReasoning;
  executiveOverview: CampaignExecutiveOverview;
  metrics: CampaignWorkspaceMetrics;
  launchState: CampaignLaunchState;
  markConversation: ArcMessage[];
  approvalHistory: CampaignDecisionEvent[];
  auditLog: AuditEntry[];
};

export type CampaignWorkspaceDetail =
  | LiveCampaignWorkspace
  | {
      status: "not_found";
    }
  | {
      status: "unavailable";
      message: string;
    };

type JsonObject = Record<string, unknown>;

type CampaignRow = {
  id: string;
  name: string;
  persona: string;
  restoration_focus: string;
  status: string;
  company_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  owner: string | null;
  objective: string | null;
  audience_summary: string | null;
  offer_summary: string | null;
  compliance_notes: string | null;
  launch_locked: boolean;
  source_signal: unknown;
  source_system: string | null | undefined;
  reasoning_payload: unknown;
  audit_payload: unknown;
  created_at: string;
  updated_at: string;
};

type CampaignAssetRow = {
  id: string;
  campaign_id: string;
  asset_type: string;
  channel: string | null;
  title: string;
  status: string;
  tool_source: string | null;
  prompt_input: string | null;
  prompt_inputs: unknown;
  draft_body: string | null;
  edited_body: string | null;
  approved_body: string | null;
  dispatch_locked: boolean;
  compliance_notes: string | null;
  reasoning_payload: unknown;
  audit_payload: unknown;
  created_at: string;
  updated_at: string;
};

type ApprovalItemRow = {
  id: string;
  campaign_id: string | null;
  campaign_asset_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  item_type: string;
  status: string;
  locked_until_approved: boolean;
  prompt_inputs: unknown;
  draft_output: string | null;
  edited_output: string | null;
  requested_by: string | null;
  submitted_at: string;
  risk_level: string;
  compliance_notes: string | null;
  decision_notes: string | null;
  reasoning_payload: unknown;
  audit_payload: unknown;
  created_at: string;
  updated_at: string;
};

type AgentOutputRow = {
  id: string;
  task_id: string;
  approval_item_id: string | null;
  campaign_asset_id: string | null;
  output_type: string;
  title: string;
  body: string | null;
  edited_body: string | null;
  structured_payload: unknown;
  risk_level: string;
  compliance_status: string;
  approval_status: string;
  created_at: string;
  updated_at: string;
};

type CampaignEventRow = {
  id: string;
  event_type: string;
  actor: string | null;
  detail: string | null;
  occurred_at: string;
};

type AgentTaskRow = {
  id: string;
  objective: string;
  task_type: string;
  status: string;
  priority: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

type ApprovalDecisionRow = {
  id: string;
  approval_item_id: string;
  decision: string;
  decided_by: string;
  decided_at: string;
  decision_notes: string | null;
  previous_status: string | null;
  next_status: string;
};

type CompanyRow = {
  id: string;
  name: string;
  website_url: string | null;
  phone: string | null;
  email: string | null;
  partner_tier: string | null;
};

type ContactRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
};

type LeadRow = {
  id: string;
  source: string;
  status: string;
  loss_summary: string | null;
  lead_score: number;
  metadata: unknown;
};

const EMPTY_READABLE_PREVIEW = "No readable draft content has been attached yet.";

export async function getCampaignWorkspaceList(client?: SupabaseClient, agentName = "Arc"): Promise<CampaignWorkspaceList> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const { data, error } = await supabase.from("campaigns").select(CAMPAIGN_SELECT).order("updated_at", { ascending: false }).limit(100);
    assertSupabaseResult("campaigns", error);

    const campaigns = (data ?? []) as CampaignRow[];
    const campaignIds = campaigns.map((campaign) => campaign.id);
    const [assets, approvals] = await Promise.all([
      selectIn<CampaignAssetRow>(supabase, "campaign_assets", ASSET_SELECT, "campaign_id", campaignIds, "updated_at"),
      selectIn<ApprovalItemRow>(supabase, "approval_items", APPROVAL_SELECT, "campaign_id", campaignIds, "submitted_at"),
    ]);
    const approvalOutputs = await selectIn<AgentOutputRow>(
      supabase,
      "agent_outputs",
      OUTPUT_SELECT,
      "approval_item_id",
      approvals.map((approval) => approval.id),
      "created_at",
    );
    const mediaByCampaign = buildMediaByCampaign(campaigns, assets, approvals, approvalOutputs, agentName);
    const sourceCountByCampaign = buildSourceCountByCampaign(campaigns, approvals, approvalOutputs);

    const items = campaigns.map((campaign) => {
      const campaignApprovals = approvals.filter((approval) => approval.campaign_id === campaign.id);
      const campaignAssetRows = assets.filter((asset) => asset.campaign_id === campaign.id);
      const campaignAssets = buildWorkspaceAssets(
        campaignAssetRows,
        campaignApprovals,
        approvalOutputs.filter((output) => output.approval_item_id && campaignApprovals.some((approval) => approval.id === output.approval_item_id)),
        agentName,
      );
      const preview = pickWorkspacePreview(campaignAssets);
      const reasoning = buildReasoning(campaign, campaignAssetRows, agentName);
      const launch = buildLaunchState(campaignAssets, campaign.launch_locked);
      const rollup = deriveCampaignRollup(collectPieceStatuses(campaignAssetRows, campaignApprovals));
      const assetTypes = uniqueStrings(campaignAssets.map((asset) => asset.assetType)).slice(0, 4);
      return {
        id: campaign.id,
        name: cleanCampaignName(campaign.name),
        persona: humanize(campaign.persona),
        status: statusLabel(campaign.status),
        lifecycle: launch.lifecycle,
        pendingCount: launch.pendingCount,
        pendingDeliverables: selectPendingDeliverables(campaignAssets),
        objective: campaign.objective ?? "No objective captured yet.",
        audienceSummary: campaign.audience_summary ?? "Audience has not been summarized yet.",
        offerSummary: campaign.offer_summary ?? "Offer has not been summarized yet.",
        whyBuilt: reasoning.whyBuilt,
        assetCount: campaignAssets.length,
        approvalCount: campaignApprovals.length,
        mediaCount: mediaByCampaign.get(campaign.id)?.length ?? 0,
        sourceCount: sourceCountByCampaign.get(campaign.id) ?? 0,
        thumbnailUrl: pickThumbnail(mediaByCampaign.get(campaign.id) ?? []),
        assetTypes,
        driver: campaignDriver({ sourceSystem: campaign.source_system ?? null, lifecycle: launch.lifecycle }),
        channels: Array.from(new Set(assetTypes.map(humanizeChannel))).slice(0, 3),
        previewText: preview?.text ?? null,
        previewLabel: preview?.label ?? null,
        contentPieces: buildListContentPieces(campaignAssets),
        updatedAt: formatDate(campaign.updated_at),
        updatedAtIso: campaign.updated_at,
        href: `/campaigns/${campaign.id}`,
        rollup,
      };
    });

    return {
      status: "live",
      campaigns: items,
      totals: {
        campaigns: items.length,
        assets: assets.length,
        approvals: approvals.length,
        media: [...mediaByCampaign.values()].reduce((total, media) => total + media.length, 0),
      },
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Campaign workspace is unavailable.",
    };
  }
}

export async function getCampaignWorkspaceDetail(
  campaignId: string,
  client?: SupabaseClient,
  agentName = "Arc",
): Promise<CampaignWorkspaceDetail> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const { data, error } = await supabase.from("campaigns").select(CAMPAIGN_SELECT).eq("id", campaignId).maybeSingle();
    assertSupabaseResult("campaigns", error);

    if (!data) {
      return { status: "not_found" };
    }

    const campaign = data as CampaignRow;
    const [assets, events, agentTasks] = await Promise.all([
      selectIn<CampaignAssetRow>(supabase, "campaign_assets", ASSET_SELECT, "campaign_id", [campaignId], "updated_at"),
      selectIn<CampaignEventRow>(supabase, "campaign_events", "id,event_type,actor,detail,occurred_at", "campaign_id", [campaignId], "occurred_at"),
      selectIn<AgentTaskRow>(supabase, "agent_tasks", AGENT_TASK_SELECT, "campaign_id", [campaignId], "created_at"),
    ]);
    const assetIds = assets.map((asset) => asset.id);
    const [campaignApprovals, assetApprovals] = await Promise.all([
      selectIn<ApprovalItemRow>(supabase, "approval_items", APPROVAL_SELECT, "campaign_id", [campaignId], "submitted_at"),
      selectIn<ApprovalItemRow>(supabase, "approval_items", APPROVAL_SELECT, "campaign_asset_id", assetIds, "submitted_at"),
    ]);
    const approvals = uniqueById([...campaignApprovals, ...assetApprovals]);
    const approvalIds = approvals.map((approval) => approval.id);
    const [assetOutputs, approvalOutputs] = await Promise.all([
      selectIn<AgentOutputRow>(supabase, "agent_outputs", OUTPUT_SELECT, "campaign_asset_id", assetIds, "created_at"),
      selectIn<AgentOutputRow>(supabase, "agent_outputs", OUTPUT_SELECT, "approval_item_id", approvalIds, "created_at"),
    ]);
    const outputs = uniqueById([...assetOutputs, ...approvalOutputs]);
    const decisions = await selectIn<ApprovalDecisionRow>(supabase, "approval_decisions", DECISION_SELECT, "approval_item_id", approvalIds, "decided_at");
    const relatedIds = collectRelatedIds(campaign, approvals);
    const [companies, contacts, leads] = await Promise.all([
      selectIn<CompanyRow>(supabase, "companies", "id,name,website_url,phone,email,partner_tier", "id", relatedIds.companyIds),
      selectIn<ContactRow>(supabase, "contacts", "id,full_name,email,phone,title", "id", relatedIds.contactIds),
      selectIn<LeadRow>(supabase, "leads", "id,source,status,loss_summary,lead_score,metadata", "id", relatedIds.leadIds),
    ]);

    const assetsView = addPreviewCampaignPieces(campaignId, buildWorkspaceAssets(assets, approvals, outputs, agentName), campaign.updated_at);
    const media = uniqueMedia([
      ...collectMediaFromCampaign(campaign),
      ...assetsView.flatMap((asset) => asset.media),
      ...approvals.flatMap((approval) => collectMediaFromApproval(approval)),
      ...outputs.flatMap((output) => collectMediaFromOutput(output, agentName)),
    ]);
    const sources = buildSources({ campaign, assets, approvals, companies, contacts, leads, outputs }, agentName);
    const reasoning = buildReasoning(campaign, assets, agentName);
    const rollup = deriveCampaignRollup(collectPieceStatuses(assets, approvals));

    return {
      status: "live",
      campaign: {
        id: campaign.id,
        name: cleanCampaignName(campaign.name),
        persona: humanize(campaign.persona),
        restorationFocus: humanize(campaign.restoration_focus),
        status: statusLabel(campaign.status),
        objective: campaign.objective ?? "No objective captured yet.",
        audienceSummary: campaign.audience_summary ?? "Audience has not been summarized yet.",
        offerSummary: campaign.offer_summary ?? "Offer has not been summarized yet.",
        complianceNotes: campaign.compliance_notes ?? "No campaign-level compliance notes captured.",
        owner: campaign.owner ?? "Unassigned",
        launchLocked: campaign.launch_locked,
        createdAt: formatDate(campaign.created_at),
        updatedAt: formatDate(campaign.updated_at),
        rollup,
      },
      assets: assetsView,
      groupedAssets: groupAssets(assetsView),
      approvals: approvals.map((approval) => mapApproval(approval, agentName)),
      media,
      sources,
      reasoning,
      executiveOverview: buildExecutiveOverview({ campaign, assets, approvals, sources, reasoning, agentName }),
      activity: outputs.map(mapOutput),
      events: events.map((event) => ({
        id: event.id,
        type: humanize(event.event_type),
        actor: event.actor ?? "System",
        detail: event.detail ?? "Campaign event recorded.",
        occurredAt: formatDate(event.occurred_at),
      })),
      metrics: {
        assets: assetsView.length,
        approvals: approvals.length,
        media: media.length,
        sources: sources.length,
      },
      launchState: buildLaunchState(assetsView, campaign.launch_locked),
      markConversation: buildArcConversation(agentTasks, outputs, agentName),
      approvalHistory: buildApprovalHistory(decisions, approvals),
      auditLog: buildAuditLog(events, outputs, agentName),
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Campaign detail is unavailable.",
    };
  }
}

/**
 * Assemble the two-way conversation with Arc, chronological. Operator turns are
 * the human-initiated directives we queue (agent_tasks with a recorded
 * requester); Arc's turns are the work he produced (agent_outputs). Both are
 * durable records — no live chat, just the real handoff trail rendered as a
 * thread.
 */
const DECISION_ACTION: Record<string, { action: string; tone: CampaignDecisionEvent["tone"] }> = {
  approved: { action: "Approved", tone: "green" },
  declined: { action: "Sent back for rework", tone: "red" },
  rejected: { action: "Sent back for rework", tone: "red" },
  archived: { action: "Removed from queue", tone: "gray" },
  revision_requested: { action: "Revision requested", tone: "amber" },
  reverted: { action: "Re-opened for review", tone: "blue" },
};

/** Build the approval audit trail — who decided what, when, and why — newest
 *  first. Sourced from approval_decisions; titles resolved from the items. */
export function buildApprovalHistory(decisions: ApprovalDecisionRow[], approvals: ApprovalItemRow[]): CampaignDecisionEvent[] {
  const titleById = new Map(approvals.map((approval) => [approval.id, buildApprovalTitle(approval)]));

  return decisions
    .slice()
    .sort((a, b) => b.decided_at.localeCompare(a.decided_at))
    .map((decision) => {
      const mapped = DECISION_ACTION[decision.decision] ?? { action: humanize(decision.decision), tone: "gray" as const };
      return {
        id: decision.id,
        decision: decision.decision,
        action: mapped.action,
        tone: mapped.tone,
        itemTitle: titleById.get(decision.approval_item_id) ?? "Approval item",
        decidedBy: decision.decided_by,
        at: formatDate(decision.decided_at),
        notes: getString(decision.decision_notes),
      };
    });
}

/** Classify who an event's actor is, for audit filtering. */
function classifyActor(actor: string | null): AuditEntry["actorKind"] {
  if (!actor || /^system$/i.test(actor)) return "system";
  if (/arc|arc/i.test(actor)) return "arc";
  return "user";
}

/** Unified, newest-first campaign audit trail: every recorded event plus the
 *  concrete work Arc produced, tagged by actor so the UI can filter to user or
 *  Arc activity. */
export function buildAuditLog(events: CampaignEventRow[], outputs: AgentOutputRow[], agentName = "Arc"): AuditEntry[] {
  const items: Array<AuditEntry & { sortAt: string }> = [];

  for (const event of events) {
    items.push({
      id: `evt-${event.id}`,
      actor: event.actor ?? "System",
      actorKind: classifyActor(event.actor),
      action: humanize(event.event_type),
      detail: event.detail ?? "",
      at: formatDate(event.occurred_at),
      sortAt: event.occurred_at,
    });
  }

  for (const output of outputs) {
    items.push({
      id: `out-${output.id}`,
      actor: agentName,
      actorKind: "arc",
      action: `Produced ${humanize(output.output_type)}`,
      detail: output.title,
      at: formatDate(output.created_at),
      sortAt: output.created_at,
    });
  }

  return items
    .sort((a, b) => b.sortAt.localeCompare(a.sortAt))
    .map((entry) => ({
      id: entry.id,
      actor: entry.actor,
      actorKind: entry.actorKind,
      action: entry.action,
      detail: entry.detail,
      at: entry.at,
    }));
}

export function buildArcConversation(tasks: AgentTaskRow[], outputs: AgentOutputRow[], agentName = "Arc"): ArcMessage[] {
  // Raw `at` holds the ISO timestamp for sorting; formatted on the way out.
  const items: ArcMessage[] = [];

  for (const task of tasks) {
    const metadata = asObject(task.metadata);
    const requester = getString(metadata.requested_by);
    const instruction = getString(metadata.human_instruction) ?? task.objective;
    // Only human-initiated directives belong in the conversation; autonomous
    // orchestrator tasks surface through their outputs instead.
    if (!requester && !getString(metadata.human_instruction)) continue;
    items.push({
      id: `task-${task.id}`,
      role: "operator",
      author: requester ?? "Operator",
      kind: humanize(task.task_type),
      title: null,
      body: instruction,
      at: task.created_at,
      status: statusLabel(task.status),
    });
  }

  for (const output of outputs) {
    items.push({
      id: `output-${output.id}`,
      role: "arc",
      author: agentName,
      kind: humanize(output.output_type),
      title: output.title,
      body: buildReadablePreview(output.edited_body ?? output.body ?? "", output.structured_payload),
      at: output.created_at,
      status: statusLabel(output.approval_status),
    });
  }

  return items
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((message) => ({ ...message, at: formatDate(message.at) }));
}

/** Pure: the decided state of a single deliverable. Every asset is a piece that
 *  needs approval — derive from its approval gate if present, else its own
 *  status, so assets without a gate are never a dead-end. */
function assetDecisionState(asset: CampaignWorkspaceAsset): "approved" | "declined" | "archived" | "pending" {
  const status = asset.approval?.status ?? asset.status;
  if (/approved/i.test(status)) return "approved";
  if (/declined|rejected/i.test(status)) return "declined";
  if (/archived/i.test(status)) return "archived";
  return "pending";
}

function collectPieceStatuses(assets: CampaignAssetRow[], approvals: ApprovalItemRow[]): string[] {
  const approvalByAssetId = new Map<string, ApprovalItemRow>();
  const standaloneApprovals: ApprovalItemRow[] = [];
  for (const approval of approvals) {
    if (approval.campaign_asset_id) {
      if (!approvalByAssetId.has(approval.campaign_asset_id)) approvalByAssetId.set(approval.campaign_asset_id, approval);
    } else {
      standaloneApprovals.push(approval);
    }
  }
  return [
    ...assets.map((asset) => approvalByAssetId.get(asset.id)?.status ?? (/approved|deployed/i.test(asset.status) ? asset.status : "draft")),
    ...standaloneApprovals.map((approval) => approval.status),
  ];
}

/** Pure: derive launch readiness + lifecycle. Every (non-removed) deliverable
 *  counts as a required piece; a piece is deployed once it's approved and no
 *  longer dispatch-locked (supports deploying pieces ahead of full launch). */
export function buildLaunchState(assets: CampaignWorkspaceAsset[], launchLocked: boolean): CampaignLaunchState {
  const considered = assets.filter((asset) => assetDecisionState(asset) !== "archived");
  const requiredCount = considered.length;
  const approved = considered.filter((asset) => assetDecisionState(asset) === "approved");
  const approvedCount = approved.length;
  const deployedCount = approved.filter((asset) => !asset.dispatchLocked).length;
  const decidedCount = considered.filter((asset) => assetDecisionState(asset) !== "pending").length;
  const pendingCount = requiredCount - decidedCount;
  const live = !launchLocked;
  const ready = !live && requiredCount > 0 && pendingCount === 0 && approvedCount > 0;
  const lifecycle: CampaignLaunchState["lifecycle"] = live
    ? "Live"
    : requiredCount === 0
      ? "Drafting"
      : pendingCount > 0
        ? "In review"
        : "Ready";

  return { requiredCount, approvedCount, pendingCount, deployedCount, ready, live, lifecycle };
}

export type LinkedCampaignRecordKind = "company" | "contact" | "lead" | "property";

export type LinkedCampaign = {
  id: string;
  name: string;
  persona: string;
  lifecycle: CampaignLaunchState["lifecycle"];
  pendingCount: number;
  href: string;
};

/** Pure: merge the referencing campaign ids from the direct `campaigns` scan and
 *  the `approval_items` scan, dropping nulls and de-duplicating. */
export function collectReferencingCampaignIds(
  directRows: Array<{ id: string }>,
  approvalRows: Array<{ campaign_id: string | null }>,
): string[] {
  return [
    ...new Set([
      ...directRows.map((row) => row.id),
      ...approvalRows.map((row) => row.campaign_id).filter((id): id is string => Boolean(id)),
    ]),
  ];
}

/** Pure: the `campaigns`/`approval_items` FK column for a CRM record kind. */
export function columnFor(kind: LinkedCampaignRecordKind): "company_id" | "contact_id" | "lead_id" | "property_id" {
  switch (kind) {
    case "company":
      return "company_id";
    case "contact":
      return "contact_id";
    case "lead":
      return "lead_id";
    case "property":
      return "property_id";
  }
}

/** Campaigns that reference a CRM record — directly (campaigns.<fk>) or through
 *  an approval item (approval_items.<fk>). Read-only; returns [] when Supabase
 *  isn't configured or on any error, so CRM record pages never break. */
export async function getCampaignsForRecord(
  kind: LinkedCampaignRecordKind,
  recordId: string,
  client?: SupabaseClient,
  agentName = "Arc",
): Promise<LinkedCampaign[]> {
  if (!client && !isSupabaseAdminConfigured()) return [];

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const column = columnFor(kind);

    const [{ data: directRows, error: directError }, { data: approvalRows, error: approvalError }] = await Promise.all([
      supabase.from("campaigns").select("id").eq(column, recordId),
      supabase.from("approval_items").select("campaign_id").eq(column, recordId),
    ]);
    assertSupabaseResult("campaigns", directError);
    assertSupabaseResult("approval_items", approvalError);

    const ids = collectReferencingCampaignIds(
      (directRows ?? []) as Array<{ id: string }>,
      (approvalRows ?? []) as Array<{ campaign_id: string | null }>,
    );
    if (ids.length === 0) return [];

    const { data, error } = await supabase.from("campaigns").select(CAMPAIGN_SELECT).in("id", ids).order("updated_at", { ascending: false });
    assertSupabaseResult("campaigns", error);
    const campaigns = (data ?? []) as CampaignRow[];
    const campaignIds = campaigns.map((campaign) => campaign.id);

    const [assets, approvals] = await Promise.all([
      selectIn<CampaignAssetRow>(supabase, "campaign_assets", ASSET_SELECT, "campaign_id", campaignIds, "updated_at"),
      selectIn<ApprovalItemRow>(supabase, "approval_items", APPROVAL_SELECT, "campaign_id", campaignIds, "submitted_at"),
    ]);
    const approvalOutputs = await selectIn<AgentOutputRow>(
      supabase,
      "agent_outputs",
      OUTPUT_SELECT,
      "approval_item_id",
      approvals.map((approval) => approval.id),
      "created_at",
    );

    return campaigns.map((campaign) => {
      const campaignApprovals = approvals.filter((approval) => approval.campaign_id === campaign.id);
      const campaignAssetRows = assets.filter((asset) => asset.campaign_id === campaign.id);
      const campaignAssets = buildWorkspaceAssets(
        campaignAssetRows,
        campaignApprovals,
        approvalOutputs.filter((output) => output.approval_item_id && campaignApprovals.some((approval) => approval.id === output.approval_item_id)),
        agentName,
      );
      const launch = buildLaunchState(campaignAssets, campaign.launch_locked);
      return {
        id: campaign.id,
        name: cleanCampaignName(campaign.name),
        persona: humanize(campaign.persona),
        lifecycle: launch.lifecycle,
        pendingCount: launch.pendingCount,
        href: `/campaigns/${campaign.id}`,
      };
    });
  } catch {
    return [];
  }
}

export type PendingDeliverable = { assetId: string; title: string; kind: string };

/** Pure: the deliverables on a campaign still awaiting an operator decision,
 *  shaped for the inline triage strip. */
export function selectPendingDeliverables(assets: CampaignWorkspaceAsset[]): PendingDeliverable[] {
  return assets
    .filter((asset) => assetDecisionState(asset) === "pending")
    .map((asset) => ({ assetId: asset.id, title: asset.title, kind: asset.assetType }));
}

function buildListContentPieces(assets: CampaignWorkspaceAsset[]): CampaignListContentPiece[] {
  return assets.map((asset) => ({
    id: asset.id,
    title: asset.title,
    kind: asset.assetType,
    channel: asset.channel,
    status: asset.status,
    preview: listPiecePreview(asset),
    media: asset.media.slice(0, 4),
    updatedAt: asset.updatedAt,
    needsReview: assetDecisionState(asset) === "pending",
  }));
}

function listPiecePreview(asset: CampaignWorkspaceAsset) {
  const text = (asset.preview && asset.preview !== EMPTY_READABLE_PREVIEW ? asset.preview : asset.body).trim();
  if (!text) return "No readable draft has been attached yet.";
  return text.length > 420 ? `${text.slice(0, 417).trimEnd()}...` : text;
}

function mapAsset(asset: CampaignAssetRow): CampaignWorkspaceAsset {
  const rawBody = asset.approved_body ?? asset.edited_body ?? asset.draft_body ?? "";
  const readableBody = buildReadablePreview(rawBody, asset.prompt_inputs, asset.reasoning_payload);
  const media = collectMediaFromAsset(asset);
  // `current` intentionally excludes draft_body — there is no meaningful revision
  // until the operator approves or edits the piece, so draft-vs-draft is no diff.
  const current = asset.approved_body ?? asset.edited_body ?? "";
  const draft = asset.draft_body ?? "";
  const revision = draft && current && draft.trim() !== current.trim() ? { draft, current } : null;
  return {
    id: asset.id,
    title: asset.title,
    assetType: humanize(asset.asset_type),
    category: classifyAssetCategory(asset),
    channel: humanize(asset.channel ?? asset.asset_type),
    status: statusLabel(asset.status),
    body: readableBody === EMPTY_READABLE_PREVIEW ? rawBody : readableBody,
    preview: readableBody,
    complianceNotes: asset.compliance_notes ?? "No asset-level compliance notes captured.",
    dispatchLocked: asset.dispatch_locked,
    toolSource: getString(asset.tool_source),
    updatedAt: formatDate(asset.updated_at),
    media,
    revision,
    approval: null,
  };
}

function buildWorkspaceAssets(
  assets: CampaignAssetRow[],
  approvals: ApprovalItemRow[],
  outputs: AgentOutputRow[],
  agentName: string,
): CampaignWorkspaceAsset[] {
  const assetIds = new Set(assets.map((asset) => asset.id));
  const outputApprovalIds = new Set(outputs.map((output) => output.approval_item_id).filter((id): id is string => Boolean(id)));

  // First (most recent) approval per asset — prefer a still-pending one so the
  // card offers Approve/Decline rather than echoing a stale decided record.
  const approvalByAssetId = new Map<string, ApprovalItemRow>();
  for (const approval of approvals) {
    if (!approval.campaign_asset_id) continue;
    const existing = approvalByAssetId.get(approval.campaign_asset_id);
    if (!existing || (isDecidedApproval(existing) && !isDecidedApproval(approval))) {
      approvalByAssetId.set(approval.campaign_asset_id, approval);
    }
  }
  const approvalById = new Map(approvals.map((approval) => [approval.id, approval]));
  // Approvals that already gate a real asset — outputs tied to these must NOT
  // become a second card for the same deliverable (the duplicate-email bug).
  const assetApprovalIds = new Set([...approvalByAssetId.values()].map((approval) => approval.id));

  const mappedAssets = assets.map((asset) => attachApproval(mapAsset(asset), approvalByAssetId.get(asset.id)));
  const outputAssets = outputs
    .filter(
      (output) =>
        (!output.campaign_asset_id || !assetIds.has(output.campaign_asset_id)) &&
        (!output.approval_item_id || !assetApprovalIds.has(output.approval_item_id)),
    )
    .map((output) => attachApproval(mapOutputAsAsset(output, agentName), output.approval_item_id ? approvalById.get(output.approval_item_id) : undefined));
  const approvalAssets = approvals
    .filter((approval) => !approval.campaign_asset_id && !outputApprovalIds.has(approval.id))
    .map((approval) => mapApprovalAsAsset(approval, agentName));

  // Real campaign_assets come first, so when an output/approval describes the
  // same deliverable, the real asset (correct id + gating approval) wins and the
  // duplicate is dropped. Dedup by content, not just id — the same email can
  // arrive as an asset AND an output AND an approval.
  return dedupeDeliverables(uniqueById([...mappedAssets, ...outputAssets, ...approvalAssets]));
}

function addPreviewCampaignPieces(campaignId: string, assets: CampaignWorkspaceAsset[], updatedAt: string): CampaignWorkspaceAsset[] {
  if (process.env.NODE_ENV === "production") return assets;
  if (campaignId !== "10000000-0000-4000-8000-000000000021") return assets;
  const existingIds = new Set(assets.map((asset) => asset.id));
  const previewPieces = buildPreviewCampaignPieces(updatedAt).filter((asset) => !existingIds.has(asset.id));
  return [...assets, ...previewPieces];
}

function buildPreviewCampaignPieces(updatedAt: string): CampaignWorkspaceAsset[] {
  const formattedUpdatedAt = formatDate(updatedAt);
  return [
    {
      id: "preview-sms-storm-follow-up",
      title: "SMS reminder for property managers",
      assetType: "SMS",
      category: "virtual",
      channel: "SMS",
      status: "Draft",
      body: "Hi Maya, quick storm follow-up: if any units are still showing moisture, Big Shoulders can document the issue and coordinate mitigation this week. Want me to hold a crew slot?",
      preview: "Hi Maya, quick storm follow-up: if any units are still showing moisture, Big Shoulders can document the issue and coordinate mitigation this week.",
      complianceNotes: "Demo preview content for layout review only.",
      dispatchLocked: true,
      toolSource: "Preview data",
      updatedAt: formattedUpdatedAt,
      media: [],
      revision: null,
      approval: null,
    },
    {
      id: "preview-media-storm-creative",
      title: "Storm response social creative",
      assetType: "Social Ad",
      category: "media",
      channel: "Social Ad",
      status: "Draft",
      body: "Visual concept: maintenance tech documenting moisture readings in a multifamily hallway after heavy rain. Caption focuses on fast documentation for property managers.",
      preview: "Social creative concept for post-storm property manager outreach.",
      complianceNotes: "Demo preview content for layout review only.",
      dispatchLocked: true,
      toolSource: "Preview data",
      updatedAt: formattedUpdatedAt,
      media: [
        {
          id: "preview-media-storm-hallway",
          type: "image",
          title: "Storm response creative preview",
          url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=80",
          thumbnailUrl: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=600&q=80",
          mimeType: "image/jpeg",
          description: "Demo preview image for a storm response social creative.",
          source: "Preview data",
        },
      ],
      revision: null,
      approval: null,
    },
    {
      id: "preview-draft-landing-page",
      title: "Emergency moisture documentation landing page",
      assetType: "Landing Page",
      category: "virtual",
      channel: "Website",
      status: "Draft",
      body: "Headline: Document moisture fast after the storm.\n\nBody: Big Shoulders helps property managers capture photos, readings, and mitigation notes before small leaks become bigger claims.\n\nCTA: Request a same-week moisture walkthrough.",
      preview: "Landing page draft for property managers who need documentation after storm calls.",
      complianceNotes: "Demo preview content for layout review only.",
      dispatchLocked: true,
      toolSource: "Preview data",
      updatedAt: formattedUpdatedAt,
      media: [],
      revision: null,
      approval: null,
    },
    {
      id: "preview-other-call-script",
      title: "Leasing office callback script",
      assetType: "Call Script",
      category: "other",
      channel: "CRM",
      status: "Pending approval",
      body: "Open by referencing the storm calls from this week, ask whether any tenant reports are unresolved, then offer a short documentation visit before the weekend schedule fills.",
      preview: "CRM/call script for offices that responded to recent storm outreach.",
      complianceNotes: "Demo preview content for layout review only.",
      dispatchLocked: true,
      toolSource: "Preview data",
      updatedAt: formattedUpdatedAt,
      media: [],
      revision: null,
      approval: null,
    },
  ];
}

/** One card per deliverable. Keyed by normalized title: the same piece surfaced
 *  from different tables (asset / output / approval) shares a title but differs
 *  in channel/type, so title is the reliable identity within a campaign. Real
 *  assets are ordered first, so the kept copy has the correct id + gating
 *  approval. */
function dedupeDeliverables(assets: CampaignWorkspaceAsset[]): CampaignWorkspaceAsset[] {
  const seen = new Set<string>();
  const result: CampaignWorkspaceAsset[] = [];
  for (const asset of assets) {
    const key = asset.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(asset);
  }
  return result;
}

function attachApproval(view: CampaignWorkspaceAsset, approval: ApprovalItemRow | undefined): CampaignWorkspaceAsset {
  if (!approval) return view;
  return { ...view, approval: { id: approval.id, status: statusLabel(approval.status) } };
}

function isDecidedApproval(approval: ApprovalItemRow): boolean {
  return /approved|declined|archived|rejected/i.test(approval.status);
}

function mapOutputAsAsset(output: AgentOutputRow, agentName: string): CampaignWorkspaceAsset {
  const rawBody = output.edited_body ?? output.body ?? "";
  const readableBody = buildReadablePreview(rawBody, output.structured_payload);
  const media = collectMediaFromOutput(output, agentName);
  const type = output.output_type || "mark_output";

  return {
    id: `output-${output.id}`,
    title: output.title || humanize(type),
    assetType: humanize(type),
    category: classifyAssetText(`${type} ${output.title}`),
    channel: channelLabelFromType(type),
    status: statusLabel(output.approval_status),
    body: readableBody === EMPTY_READABLE_PREVIEW ? rawBody : readableBody,
    preview: readableBody,
    complianceNotes: output.compliance_status ? `Compliance: ${humanize(output.compliance_status)}` : "No output-level compliance notes captured.",
    dispatchLocked: true,
    toolSource: `${agentName} output`,
    updatedAt: formatDate(output.updated_at),
    media,
    revision: null,
    approval: null,
  };
}

function mapApprovalAsAsset(approval: ApprovalItemRow, agentName: string): CampaignWorkspaceAsset {
  const rawBody = approval.edited_output ?? approval.draft_output ?? "";
  const readableBody = buildReadablePreview(rawBody, approval.prompt_inputs, approval.reasoning_payload);
  const type = approval.item_type || "approval_item";
  const channel = getString(asObject(approval.prompt_inputs).channel) ?? type;
  const media = collectMediaFromApproval(approval);

  return {
    id: `approval-${approval.id}`,
    title: buildApprovalTitle(approval),
    assetType: humanize(type),
    category: classifyAssetText(`${type} ${channel} ${buildApprovalTitle(approval)}`),
    channel: humanize(channel),
    status: statusLabel(approval.status),
    body: readableBody === EMPTY_READABLE_PREVIEW ? rawBody : readableBody,
    preview: readableBody,
    complianceNotes: approval.compliance_notes ?? "No approval-level compliance notes captured.",
    dispatchLocked: approval.locked_until_approved,
    toolSource: approval.requested_by ?? agentName,
    updatedAt: formatDate(approval.updated_at),
    media,
    revision: null,
    approval: { id: approval.id, status: statusLabel(approval.status) },
  };
}

/**
 * Pure: distill the "thinking behind it" for the Reasoning tab from Arc's
 * stored reasoning/audit payloads and the tools each asset was built with.
 */
export function buildReasoning(campaign: CampaignRow, assets: CampaignAssetRow[], agentName = "Arc"): CampaignWorkspaceReasoning {
  const reasoning = asObject(campaign.reasoning_payload);
  const audit = asObject(campaign.audit_payload);

  const toolsUsed = uniqueStrings([
    ...assets.map((asset) => asset.tool_source),
    getString(audit.provider),
  ]).map(humanize);

  return {
    whyBuilt:
      getString(reasoning.why_arc_created_it) ??
      campaign.objective ??
      campaign.offer_summary ??
      `${agentName} has not recorded reasoning for this campaign yet.`,
    recommendedAction: getString(reasoning.recommended_action) ?? "No recommended action recorded.",
    guardrailFlags: asStringArray(reasoning.guardrail_flags),
    toolsUsed,
    promptInputs: buildPromptInputs(assets),
  };
}

export function buildExecutiveOverview(input: {
  campaign: CampaignRow;
  assets: CampaignAssetRow[];
  approvals: ApprovalItemRow[];
  sources: CampaignWorkspaceSource[];
  reasoning: CampaignWorkspaceReasoning;
  agentName?: string;
}): CampaignExecutiveOverview {
  const { campaign, assets, approvals, reasoning, sources, agentName = "Arc" } = input;
  const audience = sentenceFragment(campaign.audience_summary ?? `the ${humanize(campaign.persona)} segment`);
  const offer = sentenceFragment(campaign.offer_summary ?? "the proposed Big Shoulders restoration offer");
  const objective = sentenceFragment(campaign.objective ?? campaign.offer_summary ?? "No campaign objective has been captured yet");
  const payloads = [
    asObject(campaign.source_signal),
    asObject(campaign.reasoning_payload),
    asObject(campaign.audit_payload),
    ...assets.flatMap((asset) => [asObject(asset.prompt_inputs), asObject(asset.reasoning_payload), asObject(asset.audit_payload)]),
    ...approvals.flatMap((approval) => [asObject(approval.prompt_inputs), asObject(approval.reasoning_payload), asObject(approval.audit_payload)]),
  ];
  const whySignal = sentenceFragment(findPayloadAnswer(payloads, WHY_KEYS) ?? reasoning.whyBuilt);

  return {
    what:
      findPayloadAnswer(payloads, JOURNEY_OVERVIEW_KEYS) ??
      findPayloadAnswer(payloads, WHAT_KEYS) ??
      `Move ${audience} toward a trusted Big Shoulders handoff with ${offer}. Objective: ${objective}.`,
    why: `${whySignal}. Goal: reduce decision friction and make the next step clear.`,
    timeframe:
      findPayloadAnswer(payloads, TIMEFRAME_KEYS) ??
      buildJourneyTimeframe(campaign, agentName),
    where:
      findPayloadAnswer(payloads, LOCATION_KEYS) ??
      `Client context: ${audience}.`,
    successTracking:
      findPayloadAnswer(payloads, SUCCESS_KEYS) ??
      `Track journey proof: CTA events, form/phone/photo uploads, partner handoffs, booked jobs, revenue, and attribution confidence. Current evidence: ${sources.length} source record${sources.length === 1 ? "" : "s"}, ${assets.length} deliverable${assets.length === 1 ? "" : "s"}, ${approvals.length} approval record${approvals.length === 1 ? "" : "s"}.`,
  };
}

function buildPromptInputs(assets: CampaignAssetRow[]): Array<{ label: string; value: string }> {
  const source = assets.find((asset) => Object.keys(asObject(asset.prompt_inputs)).length > 0);
  if (!source) return [];
  return promptInputEntries(source.prompt_inputs);
}

/** Pure: readable scalar prompt-input pairs from a single prompt_inputs blob. */
function promptInputEntries(value: unknown): Array<{ label: string; value: string }> {
  return Object.entries(asObject(value))
    .filter(([key, entry]) => isReadableKey(key) && entry !== null && entry !== undefined && typeof entry !== "object")
    .slice(0, 8)
    .map(([key, entry]) => ({ label: humanize(key), value: String(entry) }));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

const JOURNEY_OVERVIEW_KEYS = /^(client_journey_overview|customer_journey_overview|journey_overview|executive_overview|journey_summary)$/i;
const WHAT_KEYS = /^(what|campaign_what|campaign_summary|business_goal|goal|objective|summary)$/i;
const WHY_KEYS = /^(why|why_built|why_arc_built_it|why_arc_created_it|rationale|reason|business_reason)$/i;
const TIMEFRAME_KEYS = /^(timeframe|timeline|campaign_window|launch_window|date_range|flight_dates|schedule|start_date|end_date|launch_date|due_date)$/i;
const LOCATION_KEYS =
  /^(where|market|markets|geography|geographies|service_area|service_areas|zip_codes|zips|location|locations|city|cities|county|counties|territory)$/i;
const SUCCESS_KEYS =
  /^(success|success_metrics|success_criteria|kpis|key_metrics|measurement_plan|tracking_plan|attribution_plan|target_outcomes|conversion_goal|goal_metric)$/i;

function buildJourneyTimeframe(campaign: CampaignRow, agentName: string) {
  const objectiveWindow = extractDecisionWindow(campaign.objective ?? "");
  if (objectiveWindow) {
    return `Decision window: ${objectiveWindow}. Updated ${formatDate(campaign.updated_at)}.`;
  }

  return `Customer-journey window is not captured yet. ${agentName} should add launch dates or the client decision window before judging timing. Updated ${formatDate(campaign.updated_at)}.`;
}

function extractDecisionWindow(value: string) {
  const match = value.match(/\b(before|ahead of|during|through|by|after)\s+([^.;]+)/i);
  if (!match) return null;
  return `${match[1]} ${match[2]}`.trim();
}

function sentenceFragment(value: string) {
  return value.trim().replace(/[.!?]+$/g, "");
}

function findPayloadAnswer(payloads: JsonObject[], keyPattern: RegExp): string | null {
  for (const payload of payloads) {
    const answer = findValueByKey(payload, keyPattern);
    if (answer) return answer;
  }
  return null;
}

function findValueByKey(value: unknown, keyPattern: RegExp, depth = 0): string | null {
  if (!isObject(value) || depth > 4) return null;

  for (const [key, entry] of Object.entries(value)) {
    if (keyPattern.test(key)) {
      const formatted = formatPayloadAnswer(entry);
      if (formatted) return formatted;
    }
  }

  for (const entry of Object.values(value)) {
    if (Array.isArray(entry)) {
      for (const item of entry) {
        const nested = findValueByKey(item, keyPattern, depth + 1);
        if (nested) return nested;
      }
      continue;
    }

    const nested = findValueByKey(entry, keyPattern, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function formatPayloadAnswer(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const values = value.map(formatPayloadAnswer).filter((entry): entry is string => Boolean(entry));
    return values.length > 0 ? values.join(", ") : null;
  }
  if (!isObject(value)) return null;

  const direct =
    getString(value.summary) ??
    getString(value.description) ??
    getString(value.value) ??
    getString(value.label) ??
    getString(value.name) ??
    getString(value.plan);
  if (direct) return direct;

  const start = getString(value.start_date) ?? getString(value.start) ?? getString(value.from);
  const end = getString(value.end_date) ?? getString(value.end) ?? getString(value.to);
  if (start || end) return [start ?? "Start pending", end ?? "End pending"].join(" to ");

  const placeParts = uniqueStrings([
    getString(value.city),
    getString(value.state),
    getString(value.county),
    getString(value.region),
    getString(value.market),
  ]);
  if (placeParts.length > 0) return placeParts.join(", ");

  const scalarValues = readableScalarEntries(value).slice(0, 4);
  return scalarValues.length > 0 ? scalarValues.join(" / ") : null;
}

function mapApproval(approval: ApprovalItemRow, agentName: string): CampaignWorkspaceApproval {
  const rawBody = approval.edited_output ?? approval.draft_output ?? "";
  return {
    id: approval.id,
    title: buildApprovalTitle(approval),
    type: humanize(approval.item_type),
    status: statusLabel(approval.status),
    riskLevel: humanize(approval.risk_level),
    requestedBy: approval.requested_by ?? agentName,
    submittedAt: formatDate(approval.submitted_at),
    href: `/approvals?item=${approval.id}`,
    preview: buildReadablePreview(rawBody, approval.prompt_inputs, approval.reasoning_payload),
    media: collectMediaFromApproval(approval),
    promptInputs: promptInputEntries(approval.prompt_inputs),
    complianceNotes: approval.compliance_notes ?? "No approval-level compliance notes captured.",
  };
}

function mapOutput(output: AgentOutputRow): CampaignWorkspaceActivity {
  return {
    id: output.id,
    title: output.title,
    outputType: humanize(output.output_type),
    status: statusLabel(output.approval_status),
    riskLevel: humanize(output.risk_level),
    createdAt: formatDate(output.created_at),
    body: buildReadablePreview(output.edited_body ?? output.body ?? "", output.structured_payload),
  };
}

function groupAssets(assets: CampaignWorkspaceAsset[]) {
  return {
    physical: assets.filter((asset) => asset.category === "physical"),
    virtual: assets.filter((asset) => asset.category === "virtual"),
    ads: assets.filter((asset) => asset.category === "ads"),
    media: assets.filter((asset) => asset.category === "media"),
    other: assets.filter((asset) => asset.category === "other"),
  };
}

function classifyAssetCategory(asset: CampaignAssetRow): CampaignWorkspaceAssetCategory {
  return classifyAssetText(`${asset.asset_type} ${asset.channel ?? ""} ${asset.title}`);
}

function classifyAssetText(value: string): CampaignWorkspaceAssetCategory {
  const normalized = value.toLowerCase();
  if (/postcard|mailer|direct.?mail|print|flyer|leave.?behind|door.?hanger|script|call/.test(normalized)) return "physical";
  if (/ad|meta|facebook|instagram|google|paid|display|search/.test(normalized)) return "ads";
  if (/image|video|photo|creative|mockup|asset/.test(normalized)) return "media";
  if (/email|sms|text|landing|social|sequence|web|newsletter/.test(normalized)) return "virtual";
  return "other";
}

async function selectIn<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  values: string[],
  orderBy?: string,
): Promise<T[]> {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  if (uniqueValues.length === 0) return [];

  let query = client.from(table).select(columns).in(column, uniqueValues);
  if (orderBy) {
    query = query.order(orderBy, { ascending: false });
  }

  const { data, error } = await query;
  assertSupabaseResult(table, error);
  return (data ?? []) as T[];
}

function collectRelatedIds(campaign: CampaignRow, approvals: ApprovalItemRow[]) {
  return {
    companyIds: uniqueStrings([campaign.company_id, ...approvals.map((approval) => approval.company_id)]),
    contactIds: uniqueStrings([campaign.contact_id, ...approvals.map((approval) => approval.contact_id)]),
    leadIds: uniqueStrings([campaign.lead_id, ...approvals.map((approval) => approval.lead_id)]),
  };
}

export function buildSources(input: {
  campaign: CampaignRow;
  assets: CampaignAssetRow[];
  approvals: ApprovalItemRow[];
  companies: CompanyRow[];
  contacts: ContactRow[];
  leads: LeadRow[];
  outputs: AgentOutputRow[];
}, agentName = "Arc"): CampaignWorkspaceSource[] {
  const sources: CampaignWorkspaceSource[] = [];

  for (const company of input.companies) {
    sources.push({
      id: `company-${company.id}`,
      label: company.name,
      detail: [company.partner_tier ? humanize(company.partner_tier) : null, company.phone, company.email].filter(Boolean).join(" / ") || "Linked company",
      url: company.website_url,
      recordHref: `/crm/companies/${company.id}`,
      kind: "company",
    });
  }

  for (const contact of input.contacts) {
    sources.push({
      id: `contact-${contact.id}`,
      label: contact.full_name ?? "Linked contact",
      detail: [contact.title, contact.email, contact.phone].filter(Boolean).join(" / ") || "Linked contact",
      url: null,
      recordHref: `/crm/contacts/${contact.id}`,
      kind: "contact",
    });
  }

  for (const lead of input.leads) {
    sources.push({
      id: `lead-${lead.id}`,
      label: `Lead from ${lead.source}`,
      detail: `${statusLabel(lead.status)} / ${lead.lead_score} score${lead.loss_summary ? ` / ${lead.loss_summary}` : ""}`,
      url: null,
      recordHref: `/crm/leads/${lead.id}`,
      kind: "lead",
    });
  }

  const evidenceObjects = [
    asObject(input.campaign.source_signal),
    asObject(input.campaign.reasoning_payload),
    asObject(input.campaign.audit_payload),
    ...input.assets.flatMap((asset) => [asObject(asset.prompt_inputs), asObject(asset.reasoning_payload), asObject(asset.audit_payload)]),
    ...input.approvals.flatMap((approval) => [asObject(approval.prompt_inputs), asObject(approval.reasoning_payload), asObject(approval.audit_payload)]),
    ...input.outputs.map((output) => asObject(output.structured_payload)),
    ...input.leads.map((lead) => asObject(lead.metadata)),
  ];

  // The campaign's own creative/media (e.g. an ad's image in our storage bucket) is
  // NOT an external evidence source — exclude those URLs so they don't show up as
  // "Evidence Links" (which surfaced the raw storage host).
  const mediaUrls = new Set(
    [
      ...collectMediaFromCampaign(input.campaign),
      ...input.assets.flatMap(collectMediaFromAsset),
      ...input.approvals.flatMap(collectMediaFromApproval),
      ...input.outputs.flatMap((output) => collectMediaFromOutput(output, agentName)),
    ].map((media) => media.url),
  );

  for (const url of uniqueStrings(evidenceObjects.flatMap(extractUrlsFromObject))) {
    if (mediaUrls.has(url)) continue;
    sources.push({
      id: `url-${stableId(url)}`,
      label: getHostLabel(url),
      detail: `Evidence or source URL captured by ${agentName}.`,
      url,
      recordHref: null,
      kind: "web",
    });
  }

  return uniqueById(sources);
}

function buildMediaByCampaign(campaigns: CampaignRow[], assets: CampaignAssetRow[], approvals: ApprovalItemRow[], outputs: AgentOutputRow[], agentName = "Arc") {
  const mediaByCampaign = new Map<string, CampaignMediaAsset[]>();

  for (const campaign of campaigns) {
    const campaignAssets = assets.filter((asset) => asset.campaign_id === campaign.id);
    const assetIds = new Set(campaignAssets.map((asset) => asset.id));
    const campaignApprovals = approvals.filter((approval) => approval.campaign_id === campaign.id || (approval.campaign_asset_id ? assetIds.has(approval.campaign_asset_id) : false));
    const approvalIds = new Set(campaignApprovals.map((approval) => approval.id));
    const campaignOutputs = outputs.filter((output) => {
      return (output.campaign_asset_id ? assetIds.has(output.campaign_asset_id) : false) || (output.approval_item_id ? approvalIds.has(output.approval_item_id) : false);
    });
    mediaByCampaign.set(
      campaign.id,
      uniqueMedia([
        ...collectMediaFromCampaign(campaign),
        ...campaignAssets.flatMap(collectMediaFromAsset),
        ...campaignApprovals.flatMap(collectMediaFromApproval),
        ...campaignOutputs.flatMap((output) => collectMediaFromOutput(output, agentName)),
      ]),
    );
  }

  return mediaByCampaign;
}

function buildSourceCountByCampaign(campaigns: CampaignRow[], approvals: ApprovalItemRow[], outputs: AgentOutputRow[]) {
  const sourceCountByCampaign = new Map<string, number>();

  for (const campaign of campaigns) {
    const campaignApprovals = approvals.filter((approval) => approval.campaign_id === campaign.id);
    const campaignApprovalIds = new Set(campaignApprovals.map((approval) => approval.id));
    const values = [
      ...extractUrlsFromObject(asObject(campaign.source_signal)),
      ...extractUrlsFromObject(asObject(campaign.reasoning_payload)),
      ...extractUrlsFromObject(asObject(campaign.audit_payload)),
      ...campaignApprovals.flatMap((approval) => extractUrlsFromObject(asObject(approval.prompt_inputs))),
      ...outputs
        .filter((output) => output.approval_item_id && campaignApprovalIds.has(output.approval_item_id))
        .flatMap((output) => extractUrlsFromObject(asObject(output.structured_payload))),
    ];
    sourceCountByCampaign.set(campaign.id, uniqueStrings(values).length);
  }

  return sourceCountByCampaign;
}

function collectMediaFromCampaign(campaign: CampaignRow) {
  return buildMediaAssets([
    ["Campaign source", asObject(campaign.source_signal)],
    ["Campaign reasoning", asObject(campaign.reasoning_payload)],
    ["Campaign audit", asObject(campaign.audit_payload)],
  ]);
}

function collectMediaFromAsset(asset: CampaignAssetRow) {
  return buildMediaAssets([
    ["Asset prompt", asObject(asset.prompt_inputs)],
    ["Asset reasoning", asObject(asset.reasoning_payload)],
    ["Asset audit", asObject(asset.audit_payload)],
    ["Asset body", asset.approved_body ?? asset.edited_body ?? asset.draft_body ?? ""],
  ]);
}

function collectMediaFromApproval(approval: ApprovalItemRow) {
  return buildMediaAssets([
    ["Approval prompt", asObject(approval.prompt_inputs)],
    ["Approval reasoning", asObject(approval.reasoning_payload)],
    ["Approval audit", asObject(approval.audit_payload)],
    ["Approval draft", approval.edited_output ?? approval.draft_output ?? ""],
  ]);
}

function collectMediaFromOutput(output: AgentOutputRow, agentName = "Arc") {
  return buildMediaAssets([
    [`${agentName} output`, asObject(output.structured_payload)],
    [`${agentName} body`, output.edited_body ?? output.body ?? ""],
  ]);
}

function buildMediaAssets(inputs: Array<[string, JsonObject | string]>): CampaignMediaAsset[] {
  const assets: CampaignMediaAsset[] = [];

  for (const [source, value] of inputs) {
    if (typeof value === "string") {
      for (const url of extractUrls(value)) {
        if (isMediaLikeUrl(url)) assets.push(createMediaAsset({ url, source }));
      }
      continue;
    }
    collectMediaAssetsFromObject(value, assets, source);
  }

  return uniqueMedia(assets);
}

function collectMediaAssetsFromObject(object: JsonObject, assets: CampaignMediaAsset[], source: string) {
  for (const [key, value] of Object.entries(object)) {
    if (Array.isArray(value) && isCreativeCollectionKey(key)) {
      for (const item of value) {
        const asset = mapMediaAsset(item, source);
        if (asset) assets.push(asset);
      }
      continue;
    }

    if (isObject(value)) {
      const asset = isCreativeObjectKey(key) ? mapMediaAsset(value, source) : null;
      if (asset) assets.push(asset);
      collectMediaAssetsFromObject(value, assets, source);
      continue;
    }

    if (typeof value === "string" && isCreativeUrlKey(key) && isUrl(value)) {
      assets.push(createMediaAsset({ url: value, source, title: humanize(key) }));
    }
  }
}

function mapMediaAsset(value: unknown, source: string): CampaignMediaAsset | null {
  if (typeof value === "string" && isUrl(value)) {
    return createMediaAsset({ url: value, source });
  }
  if (!isObject(value)) {
    return null;
  }

  const url =
    getString(value.url) ??
    getString(value.asset_url) ??
    getString(value.media_url) ??
    getString(value.image_url) ??
    getString(value.video_url) ??
    getString(value.preview_url) ??
    getString(value.file_url);

  if (!url || !isUrl(url)) return null;

  return createMediaAsset({
    url,
    source,
    title: getString(value.title) ?? getString(value.name) ?? getString(value.label) ?? undefined,
    description: getString(value.description) ?? getString(value.notes) ?? getString(value.caption),
    thumbnailUrl: getString(value.thumbnail_url) ?? getString(value.thumbnailUrl) ?? getString(value.poster_url) ?? null,
    mimeType: getString(value.mime_type) ?? getString(value.mimeType) ?? null,
    hintedType: getString(value.type) ?? getString(value.asset_type) ?? getString(value.media_type) ?? undefined,
  });
}

function createMediaAsset(input: {
  url: string;
  source: string;
  title?: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  mimeType?: string | null;
  hintedType?: string;
}): CampaignMediaAsset {
  const type = classifyMediaAsset(input.url, input.mimeType, input.hintedType);
  return {
    id: `media-${stableId(input.url)}`,
    type,
    title: input.title ?? defaultMediaTitle(type),
    url: input.url,
    thumbnailUrl: input.thumbnailUrl ?? null,
    mimeType: input.mimeType ?? null,
    description: input.description ?? null,
    source: input.source,
  };
}

export function classifyMediaAsset(url: string, mimeType?: string | null, hintedType?: string): CampaignMediaAsset["type"] {
  const hint = `${mimeType ?? ""} ${hintedType ?? ""}`.toLowerCase();
  const lowerUrl = url.toLowerCase();
  // ad / postcard / photo creative are visual; render them as images even
  // when the URL carries no file extension (e.g. dynamic image endpoints).
  if (/image|photo|postcard|\bad\b|mockup/.test(hint) || /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/.test(lowerUrl)) return "image";
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(lowerUrl)) return "embed";
  if (hint.includes("video") || /\.(mp4|webm|mov|m4v)(\?|#|$)/.test(lowerUrl)) return "video";
  if (/\.(pdf|docx?|pptx?)(\?|#|$)/.test(lowerUrl)) return "file";
  return "link";
}

function buildReadablePreview(...values: unknown[]) {
  for (const value of values) {
    const preview = previewValue(value);
    if (preview) return preview;
  }
  return EMPTY_READABLE_PREVIEW;
}

function previewValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = parseDraftJson(trimmed);
    if (parsed) return previewValue(parsed);
    return trimmed;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => (isObject(entry) ? previewRecord(entry) : previewValue(entry))).filter(Boolean).slice(0, 6).join("\n\n");
  }
  if (!isObject(value)) {
    return String(value);
  }

  const direct =
    getString(value.summary) ??
    getString(value.headline) ??
    getString(value.title) ??
    getString(value.message) ??
    getString(value.body) ??
    getString(value.copy) ??
    getString(value.recommended_action) ??
    getString(value.suggested_owner_action);
  if (direct) return direct;

  const collection = Object.entries(value).find(([key, entry]) => isReadableCollectionKey(key) && Array.isArray(entry) && entry.length > 0);
  if (collection) {
    const [collectionKey, rawCollectionValue] = collection;
    const collectionValue = Array.isArray(rawCollectionValue) ? rawCollectionValue : [];
    const scalarIntro = readableScalarEntries(value)
      .filter((entry) => !entry.startsWith(`${humanize(collectionKey)}:`))
      .slice(0, 4);
    const rows = collectionValue
      .map((entry) => (isObject(entry) ? previewRecord(entry) : previewValue(entry)))
      .filter(Boolean)
      .slice(0, 8);

    return [...scalarIntro, `${humanize(collectionKey)}:\n${rows.join("\n\n")}`].filter(Boolean).join("\n");
  }

  const entries = readableScalarEntries(value);

  return entries.length > 0 ? entries.join("\n") : null;
}

function readableScalarEntries(value: JsonObject) {
  return Object.entries(value)
    .filter(([key, entry]) => isReadableKey(key) && entry !== null && entry !== undefined && typeof entry !== "object")
    .slice(0, 6)
    .map(([key, entry]) => `${humanize(key)}: ${String(entry)}`);
}

function previewRecord(value: JsonObject) {
  const title =
    getString(value.name) ??
    getString(value.company_name) ??
    getString(value.business_name) ??
    getString(value.title) ??
    getString(value.subject) ??
    getString(value.headline) ??
    "Record";

  const fields: string[] = [];
  for (const key of [
    "score",
    "partner_score",
    "lead_score",
    "channel",
    "website",
    "website_url",
    "phone",
    "email",
    "confidence",
    "status",
    "recommended_action",
    "notes",
    "reason",
    "fit",
  ]) {
    const valueForKey = value[key];
    if (valueForKey !== null && valueForKey !== undefined && typeof valueForKey !== "object") {
      fields.push(`${humanize(key)}: ${String(valueForKey)}`);
    }
  }

  const urls = uniqueStrings(extractUrlsFromObject(value)).slice(0, 3);
  if (urls.length > 0) fields.push(`Sources: ${urls.join(", ")}`);

  return [title, ...fields].filter(Boolean).join("\n");
}

function parseDraftJson(value: string) {
  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;

  try {
    return JSON.parse(value.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function buildApprovalTitle(approval: ApprovalItemRow) {
  const prompt = asObject(approval.prompt_inputs);
  return (
    getString(prompt.title) ??
    getString(prompt.campaign_name) ??
    getString(prompt.subject) ??
    `${humanize(approval.item_type)} review`
  );
}

function extractUrlsFromObject(object: JsonObject): string[] {
  const urls: string[] = [];
  for (const value of Object.values(object)) {
    if (typeof value === "string") {
      urls.push(...extractUrls(value).filter(isUrl));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") urls.push(...extractUrls(item).filter(isUrl));
        if (isObject(item)) urls.push(...extractUrlsFromObject(item));
      }
    } else if (isObject(value)) {
      urls.push(...extractUrlsFromObject(value));
    }
  }
  return urls;
}

function extractUrls(value: string) {
  return value.match(/https?:\/\/[^\s"'<>),\]]+/g) ?? [];
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function uniqueMedia(items: CampaignMediaAsset[]) {
  const byUrl = new Map<string, CampaignMediaAsset>();
  for (const item of items) {
    if (!byUrl.has(item.url)) byUrl.set(item.url, item);
  }
  return [...byUrl.values()];
}

function humanizeChannel(raw: string): string {
  const map: Record<string, string> = {
    social_ad: "Meta",
    email: "Email",
    sms: "SMS",
    landing_page: "Landing",
    one_pager: "Print",
  };
  return map[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function isReadableKey(key: string) {
  const normalized = key.toLowerCase();
  return !normalized.endsWith("_id") && !normalized.endsWith("_ids") && normalized !== "id" && !/payload|metadata|audit/.test(normalized);
}

function isReadableCollectionKey(key: string) {
  return /candidate|lead|company|contact|asset|creative|deliverable|source|evidence|campaign|ad|email|sms|post|item/i.test(key);
}

function isCreativeCollectionKey(key: string) {
  return /^(media|media_assets|creative_assets|creatives|attachments|previews|files|generated_assets|ad_assets)$/i.test(key);
}

function isCreativeObjectKey(key: string) {
  return /^(media|creative|attachment|preview|asset|image|video|file)$/i.test(key);
}

function isCreativeUrlKey(key: string) {
  return /^(image_url|video_url|media_url|asset_url|creative_url|preview_url|file_url)$/i.test(key);
}

function isMediaLikeUrl(url: string) {
  return classifyMediaAsset(url) !== "link";
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function pickWorkspacePreview(assets: CampaignWorkspaceAsset[]): { text: string; label: string } | null {
  for (const asset of assets) {
    const text = asset.preview && asset.preview !== EMPTY_READABLE_PREVIEW ? asset.preview : asset.body;
    if (text && text !== EMPTY_READABLE_PREVIEW) {
      return { text: text.slice(0, 360), label: asset.channel || asset.assetType };
    }
  }
  return null;
}

function channelLabelFromType(type: string) {
  if (/email/i.test(type)) return "Email";
  if (/sms|text/i.test(type)) return "SMS";
  if (/ad|meta|google|search|display/i.test(type)) return "Ads";
  if (/video/i.test(type)) return "Video";
  if (/image|creative|media/i.test(type)) return "Media";
  if (/lead|candidate|partner/i.test(type)) return "Lead list";
  if (/landing|web/i.test(type)) return "Landing page";
  return humanize(type);
}

/** Pick a representative thumbnail for a campaign card: first image, else a
 *  video/embed poster if present. Returns null when there's no visual media. */
function pickThumbnail(media: CampaignMediaAsset[]): string | null {
  const image = media.find((asset) => asset.type === "image");
  if (image) return image.thumbnailUrl ?? image.url;

  const posterized = media.find((asset) => (asset.type === "video" || asset.type === "embed") && asset.thumbnailUrl);
  return posterized?.thumbnailUrl ?? null;
}

function defaultMediaTitle(type: CampaignMediaAsset["type"]) {
  if (type === "image") return "Image preview";
  if (type === "video" || type === "embed") return "Video preview";
  if (type === "file") return "Attached file";
  return "Creative link";
}

function getHostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source link";
  }
}

function stableId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function statusLabel(status: string) {
  if (status === "pending_owner_approval") return "Pending owner approval";
  if (status === "pending_approval") return "Pending approval";
  if (status === "needs_compliance") return "Needs compliance";
  if (status === "revision_requested") return "Revision requested";
  return humanize(status);
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Strip machine-generated run-id / date suffixes Arc appends to campaign
 *  names (e.g. " 20260529203258", " - 2026-06-01") for cleaner display. */
function cleanCampaignName(name: string) {
  return name
    .replace(/\s*(?:-|\u2013)\s*\d{4}-\d{2}-\d{2}\s*$/, "")
    .replace(/\s+\d{12,}\s*$/, "")
    .trim() || name;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function assertSupabaseResult(label: string, error: { message: string } | null) {
  if (error) {
    throw new Error(`${label} lookup failed: ${error.message}`);
  }
}
