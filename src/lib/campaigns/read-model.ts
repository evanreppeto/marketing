import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

const CAMPAIGN_SELECT =
  "id,name,persona,restoration_focus,status,company_id,contact_id,lead_id,owner,objective,audience_summary,offer_summary,compliance_notes,launch_locked,source_signal,reasoning_payload,audit_payload,created_at,updated_at";
const ASSET_SELECT =
  "id,campaign_id,asset_type,channel,title,status,tool_source,prompt_input,prompt_inputs,draft_body,edited_body,approved_body,dispatch_locked,compliance_notes,reasoning_payload,audit_payload,created_at,updated_at";
const APPROVAL_SELECT =
  "id,campaign_id,campaign_asset_id,company_id,contact_id,lead_id,item_type,status,locked_until_approved,prompt_inputs,draft_output,edited_output,requested_by,submitted_at,risk_level,compliance_notes,decision_notes,reasoning_payload,audit_payload,created_at,updated_at";
const OUTPUT_SELECT =
  "id,task_id,approval_item_id,campaign_asset_id,output_type,title,body,edited_body,structured_payload,risk_level,compliance_status,approval_status,created_at,updated_at";

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
  objective: string;
  audienceSummary: string;
  offerSummary: string;
  assetCount: number;
  approvalCount: number;
  mediaCount: number;
  sourceCount: number;
  thumbnailUrl: string | null;
  assetTypes: string[];
  previewText: string | null;
  previewLabel: string | null;
  updatedAt: string;
  href: string;
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
};

export type CampaignWorkspaceReasoning = {
  whyBuilt: string;
  recommendedAction: string;
  guardrailFlags: string[];
  toolsUsed: string[];
  promptInputs: Array<{ label: string; value: string }>;
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
};

export type CampaignWorkspaceSource = {
  id: string;
  label: string;
  detail: string;
  url: string | null;
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
  updatedAt: string;
};

export type CampaignWorkspaceMetrics = {
  assets: number;
  approvals: number;
  media: number;
  sources: number;
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
  metrics: CampaignWorkspaceMetrics;
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

export async function getCampaignWorkspaceList(client?: SupabaseClient): Promise<CampaignWorkspaceList> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const { data, error } = await supabase.from("campaigns").select(CAMPAIGN_SELECT).order("updated_at", { ascending: false }).limit(100);
    assertSupabaseResult("campaigns", error);

    const campaigns = (data ?? []) as CampaignRow[];
    const campaignIds = campaigns.map((campaign) => campaign.id);
    const assets = await selectIn<CampaignAssetRow>(supabase, "campaign_assets", ASSET_SELECT, "campaign_id", campaignIds, "updated_at");
    const approvals = await selectIn<ApprovalItemRow>(supabase, "approval_items", APPROVAL_SELECT, "campaign_id", campaignIds, "submitted_at");
    const mediaByCampaign = buildMediaByCampaign(campaigns, assets, approvals, []);
    const sourceCountByCampaign = buildSourceCountByCampaign(campaigns, approvals);

    const items = campaigns.map((campaign) => {
      const campaignAssets = assets.filter((asset) => asset.campaign_id === campaign.id);
      const campaignApprovals = approvals.filter((approval) => approval.campaign_id === campaign.id);
      const preview = pickPreview(campaignAssets);
      return {
        id: campaign.id,
        name: cleanCampaignName(campaign.name),
        persona: humanize(campaign.persona),
        status: statusLabel(campaign.status),
        objective: campaign.objective ?? "No objective captured yet.",
        audienceSummary: campaign.audience_summary ?? "Audience has not been summarized yet.",
        offerSummary: campaign.offer_summary ?? "Offer has not been summarized yet.",
        assetCount: campaignAssets.length,
        approvalCount: campaignApprovals.length,
        mediaCount: mediaByCampaign.get(campaign.id)?.length ?? 0,
        sourceCount: sourceCountByCampaign.get(campaign.id) ?? 0,
        thumbnailUrl: pickThumbnail(mediaByCampaign.get(campaign.id) ?? []),
        assetTypes: uniqueStrings(campaignAssets.map((asset) => humanize(asset.asset_type))).slice(0, 4),
        previewText: preview?.text ?? null,
        previewLabel: preview?.label ?? null,
        updatedAt: formatDate(campaign.updated_at),
        href: `/campaigns/${campaign.id}`,
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

export async function getCampaignWorkspaceDetail(campaignId: string, client?: SupabaseClient): Promise<CampaignWorkspaceDetail> {
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
    const [assets, events] = await Promise.all([
      selectIn<CampaignAssetRow>(supabase, "campaign_assets", ASSET_SELECT, "campaign_id", [campaignId], "updated_at"),
      selectIn<CampaignEventRow>(supabase, "campaign_events", "id,event_type,actor,detail,occurred_at", "campaign_id", [campaignId], "occurred_at"),
    ]);
    const assetIds = assets.map((asset) => asset.id);
    const campaignApprovals = await selectIn<ApprovalItemRow>(supabase, "approval_items", APPROVAL_SELECT, "campaign_id", [campaignId], "submitted_at");
    const assetApprovals = await selectIn<ApprovalItemRow>(supabase, "approval_items", APPROVAL_SELECT, "campaign_asset_id", assetIds, "submitted_at");
    const approvals = uniqueById([...campaignApprovals, ...assetApprovals]);
    const approvalIds = approvals.map((approval) => approval.id);
    const [assetOutputs, approvalOutputs] = await Promise.all([
      selectIn<AgentOutputRow>(supabase, "agent_outputs", OUTPUT_SELECT, "campaign_asset_id", assetIds, "created_at"),
      selectIn<AgentOutputRow>(supabase, "agent_outputs", OUTPUT_SELECT, "approval_item_id", approvalIds, "created_at"),
    ]);
    const outputs = uniqueById([...assetOutputs, ...approvalOutputs]);
    const relatedIds = collectRelatedIds(campaign, approvals);
    const [companies, contacts, leads] = await Promise.all([
      selectIn<CompanyRow>(supabase, "companies", "id,name,website_url,phone,email,partner_tier", "id", relatedIds.companyIds),
      selectIn<ContactRow>(supabase, "contacts", "id,full_name,email,phone,title", "id", relatedIds.contactIds),
      selectIn<LeadRow>(supabase, "leads", "id,source,status,loss_summary,lead_score,metadata", "id", relatedIds.leadIds),
    ]);

    const assetsView = assets.map((asset) => mapAsset(asset));
    const media = uniqueMedia([
      ...collectMediaFromCampaign(campaign),
      ...assetsView.flatMap((asset) => asset.media),
      ...approvals.flatMap((approval) => collectMediaFromApproval(approval)),
      ...outputs.flatMap((output) => collectMediaFromOutput(output)),
    ]);
    const sources = buildSources({ campaign, assets, approvals, companies, contacts, leads, outputs });

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
        updatedAt: formatDate(campaign.updated_at),
      },
      assets: assetsView,
      groupedAssets: groupAssets(assetsView),
      approvals: approvals.map(mapApproval),
      media,
      sources,
      reasoning: buildReasoning(campaign, assets),
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
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Campaign detail is unavailable.",
    };
  }
}

function mapAsset(asset: CampaignAssetRow): CampaignWorkspaceAsset {
  const body = asset.approved_body ?? asset.edited_body ?? asset.draft_body ?? "";
  const media = collectMediaFromAsset(asset);
  return {
    id: asset.id,
    title: asset.title,
    assetType: humanize(asset.asset_type),
    category: classifyAssetCategory(asset),
    channel: humanize(asset.channel ?? asset.asset_type),
    status: statusLabel(asset.status),
    body,
    preview: buildReadablePreview(body, asset.prompt_inputs, asset.reasoning_payload),
    complianceNotes: asset.compliance_notes ?? "No asset-level compliance notes captured.",
    dispatchLocked: asset.dispatch_locked,
    toolSource: getString(asset.tool_source),
    updatedAt: formatDate(asset.updated_at),
    media,
  };
}

/**
 * Pure: distill the "thinking behind it" for the Reasoning tab from Mark's
 * stored reasoning/audit payloads and the tools each asset was built with.
 */
export function buildReasoning(campaign: CampaignRow, assets: CampaignAssetRow[]): CampaignWorkspaceReasoning {
  const reasoning = asObject(campaign.reasoning_payload);
  const audit = asObject(campaign.audit_payload);

  const toolsUsed = uniqueStrings([
    ...assets.map((asset) => asset.tool_source),
    getString(audit.provider),
  ]).map(humanize);

  return {
    whyBuilt: getString(reasoning.why_hermes_created_it) ?? "Mark has not recorded reasoning for this campaign yet.",
    recommendedAction: getString(reasoning.recommended_action) ?? "No recommended action recorded.",
    guardrailFlags: asStringArray(reasoning.guardrail_flags),
    toolsUsed,
    promptInputs: buildPromptInputs(assets),
  };
}

function buildPromptInputs(assets: CampaignAssetRow[]): Array<{ label: string; value: string }> {
  const source = assets.find((asset) => Object.keys(asObject(asset.prompt_inputs)).length > 0);
  if (!source) return [];

  return Object.entries(asObject(source.prompt_inputs))
    .filter(([key, value]) => isReadableKey(key) && value !== null && value !== undefined && typeof value !== "object")
    .slice(0, 8)
    .map(([key, value]) => ({ label: humanize(key), value: String(value) }));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function mapApproval(approval: ApprovalItemRow): CampaignWorkspaceApproval {
  return {
    id: approval.id,
    title: buildApprovalTitle(approval),
    type: humanize(approval.item_type),
    status: statusLabel(approval.status),
    riskLevel: humanize(approval.risk_level),
    requestedBy: approval.requested_by ?? "Mark",
    submittedAt: formatDate(approval.submitted_at),
    href: `/approvals?item=${approval.id}`,
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
  const value = `${asset.asset_type} ${asset.channel ?? ""} ${asset.title}`.toLowerCase();
  if (/postcard|mailer|mail|print|flyer|leave.?behind|door.?hanger|script|call/.test(value)) return "physical";
  if (/ad|meta|facebook|instagram|google|paid|display|search/.test(value)) return "ads";
  if (/image|video|photo|creative|mockup|asset/.test(value)) return "media";
  if (/email|sms|text|landing|social|sequence|web|newsletter/.test(value)) return "virtual";
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

function buildSources(input: {
  campaign: CampaignRow;
  assets: CampaignAssetRow[];
  approvals: ApprovalItemRow[];
  companies: CompanyRow[];
  contacts: ContactRow[];
  leads: LeadRow[];
  outputs: AgentOutputRow[];
}): CampaignWorkspaceSource[] {
  const sources: CampaignWorkspaceSource[] = [];

  for (const company of input.companies) {
    sources.push({
      id: `company-${company.id}`,
      label: company.name,
      detail: [company.partner_tier ? humanize(company.partner_tier) : null, company.phone, company.email].filter(Boolean).join(" / ") || "Linked company",
      url: company.website_url,
      kind: "company",
    });
  }

  for (const contact of input.contacts) {
    sources.push({
      id: `contact-${contact.id}`,
      label: contact.full_name ?? "Linked contact",
      detail: [contact.title, contact.email, contact.phone].filter(Boolean).join(" / ") || "Linked contact",
      url: null,
      kind: "contact",
    });
  }

  for (const lead of input.leads) {
    sources.push({
      id: `lead-${lead.id}`,
      label: `Lead from ${lead.source}`,
      detail: `${statusLabel(lead.status)} / ${lead.lead_score} score${lead.loss_summary ? ` / ${lead.loss_summary}` : ""}`,
      url: null,
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

  for (const url of uniqueStrings(evidenceObjects.flatMap(extractUrlsFromObject))) {
    sources.push({
      id: `url-${stableId(url)}`,
      label: getHostLabel(url),
      detail: "Evidence or source URL captured by Mark.",
      url,
      kind: "web",
    });
  }

  return uniqueById(sources);
}

function buildMediaByCampaign(campaigns: CampaignRow[], assets: CampaignAssetRow[], approvals: ApprovalItemRow[], outputs: AgentOutputRow[]) {
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
        ...campaignOutputs.flatMap(collectMediaFromOutput),
      ]),
    );
  }

  return mediaByCampaign;
}

function buildSourceCountByCampaign(campaigns: CampaignRow[], approvals: ApprovalItemRow[]) {
  const sourceCountByCampaign = new Map<string, number>();

  for (const campaign of campaigns) {
    const values = [
      ...extractUrlsFromObject(asObject(campaign.source_signal)),
      ...extractUrlsFromObject(asObject(campaign.reasoning_payload)),
      ...extractUrlsFromObject(asObject(campaign.audit_payload)),
      ...approvals.filter((approval) => approval.campaign_id === campaign.id).flatMap((approval) => extractUrlsFromObject(asObject(approval.prompt_inputs))),
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

function collectMediaFromOutput(output: AgentOutputRow) {
  return buildMediaAssets([
    ["Mark output", asObject(output.structured_payload)],
    ["Mark body", output.edited_body ?? output.body ?? ""],
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

function classifyMediaAsset(url: string, mimeType?: string | null, hintedType?: string): CampaignMediaAsset["type"] {
  const hint = `${mimeType ?? ""} ${hintedType ?? ""}`.toLowerCase();
  const lowerUrl = url.toLowerCase();
  // ad / postcard / photo creative are visual — render them as images even
  // when the URL carries no file extension (e.g. dynamic image endpoints).
  if (/image|photo|postcard|\bad\b|mockup/.test(hint) || /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/.test(lowerUrl)) return "image";
  if (hint.includes("video") || /\.(mp4|webm|mov|m4v)(\?|#|$)/.test(lowerUrl)) return "video";
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(lowerUrl)) return "embed";
  if (/\.(pdf|docx?|pptx?)(\?|#|$)/.test(lowerUrl)) return "file";
  return "link";
}

function buildReadablePreview(...values: unknown[]) {
  for (const value of values) {
    const preview = previewValue(value);
    if (preview) return preview;
  }
  return "No readable draft content has been attached yet.";
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
    return value.map(previewValue).filter(Boolean).slice(0, 4).join("\n");
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

  const entries = Object.entries(value)
    .filter(([key, entry]) => isReadableKey(key) && entry !== null && entry !== undefined && typeof entry !== "object")
    .slice(0, 6)
    .map(([key, entry]) => `${humanize(key)}: ${String(entry)}`);

  return entries.length > 0 ? entries.join("\n") : null;
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

/** Pick the primary asset's readable copy for a rendered preview cover.
 *  `assets` arrive newest-first; returns the first asset with real copy. */
function pickPreview(assets: CampaignAssetRow[]): { text: string; label: string } | null {
  for (const asset of assets) {
    const body = asset.approved_body ?? asset.edited_body ?? asset.draft_body ?? "";
    const text = buildReadablePreview(body, asset.prompt_inputs, asset.reasoning_payload);
    if (text && text !== "No readable draft content has been attached yet.") {
      return { text: text.slice(0, 360), label: humanize(asset.channel ?? asset.asset_type) };
    }
  }
  return null;
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

/** Strip machine-generated run-id / date suffixes Mark appends to campaign
 *  names (e.g. " 20260529203258", " - 2026-06-01") for cleaner display. */
function cleanCampaignName(name: string) {
  return name
    .replace(/\s*[-–]\s*\d{4}-\d{2}-\d{2}\s*$/, "")
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
