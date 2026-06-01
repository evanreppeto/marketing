import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "../supabase/server";

const ACTIVE_APPROVAL_STATUSES = [
  "needs_compliance",
  "pending_approval",
  "pending_owner_approval",
  "revision_requested",
] as const;

export type ApprovalQueueFilter = {
  statuses?: string[];
  limit?: number;
};

export type ApprovalCard = {
  id: string;
  type: string;
  title: string;
  previewText: string;
  status: string;
  statusLabel: string;
  riskLevel: string;
  persona: string;
  channel: string;
  sourceAgent: string;
  submittedAt: string;
  campaign: {
    id: string | null;
    name: string;
    status: string;
    objective: string;
  };
  asset: {
    id: string | null;
    type: string;
    title: string;
    status: string;
  };
  relatedRecords: {
    company: RelatedRecord | null;
    contact: RelatedRecord | null;
    lead: RelatedRecord | null;
  };
  promptInput: string;
  draftOutput: string;
  structuredDraft: ApprovalStructuredDraft | null;
  complianceFlags: string[];
  riskFlags: string[];
  recommendedAction: string;
  evidence: string[];
};

export type RelatedRecord = {
  id: string;
  label: string;
  detail: string;
};

export type ApprovalStructuredDraft =
  | {
      kind: "partner_lead_list";
      leadListType: string;
      targetMarket: string;
      targetZips: string[];
      suggestedOwnerAction: string;
      candidates: ApprovalLeadCandidate[];
    };

export type ApprovalLeadCandidate = {
  companyName: string;
  persona: string;
  targetZips: string[];
  sourceUrl: string | null;
  evidenceSummary: string;
  partnerScore: number | null;
  scoreFactors: string[];
  recommendedNextAction: string;
};

type JsonObject = Record<string, unknown>;

type ApprovalItemRow = {
  id: string;
  campaign_id: string | null;
  campaign_asset_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  item_type: string;
  status: string;
  prompt_inputs: JsonObject | null;
  draft_output: string | null;
  edited_output: string | null;
  requested_by: string | null;
  locked_until_approved: boolean;
  submitted_at: string;
  risk_level: string;
  compliance_notes: string | null;
  decision_notes: string | null;
  reasoning_payload: JsonObject | null;
  audit_payload: JsonObject | null;
  created_at: string;
  updated_at: string;
};

type CampaignRow = {
  id: string;
  name: string;
  persona: string;
  status: string;
  objective: string | null;
  audience_summary: string | null;
  offer_summary: string | null;
  compliance_notes: string | null;
};

type CampaignAssetRow = {
  id: string;
  title: string;
  asset_type: string;
  channel: string | null;
  status: string;
  prompt_input: string | null;
  prompt_inputs: JsonObject | null;
  draft_body: string | null;
  edited_body: string | null;
  approved_body: string | null;
  compliance_notes: string | null;
  reasoning_payload: JsonObject | null;
};

type CompanyRow = {
  id: string;
  name: string;
  persona: string;
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
  lead_score: number;
  loss_summary: string | null;
  metadata: JsonObject | null;
};

type AgentOutputRow = {
  id: string;
  approval_item_id: string | null;
  output_type: string;
  title: string;
  body: string | null;
  risk_level: string;
  approval_status: string;
  structured_payload: JsonObject | null;
};

export async function listApprovalCards(
  filter: ApprovalQueueFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ApprovalCard[]> {
  const statuses = filter.statuses ?? [...ACTIVE_APPROVAL_STATUSES];
  const limit = filter.limit ?? 50;

  const query = client
    .from("approval_items")
    .select(
      "id,campaign_id,campaign_asset_id,company_id,contact_id,lead_id,item_type,status,prompt_inputs,draft_output,edited_output,requested_by,locked_until_approved,submitted_at,risk_level,compliance_notes,decision_notes,reasoning_payload,audit_payload,created_at,updated_at",
    )
    .in("status", statuses)
    .order("submitted_at", { ascending: false })
    .limit(limit);

  const { data, error } = await query;

  if (error) {
    throw new Error(`listApprovalCards failed: ${error.message}`);
  }

  const approvalItems = (data ?? []) as ApprovalItemRow[];

  if (approvalItems.length === 0) {
    return [];
  }

  const [campaigns, assets, companies, contacts, leads, agentOutputs] = await Promise.all([
    fetchByIds<CampaignRow>(
      client,
      "campaigns",
      "id,name,persona,status,objective,audience_summary,offer_summary,compliance_notes",
      collectIds(approvalItems, "campaign_id"),
    ),
    fetchByIds<CampaignAssetRow>(
      client,
      "campaign_assets",
      "id,title,asset_type,channel,status,prompt_input,prompt_inputs,draft_body,edited_body,approved_body,compliance_notes,reasoning_payload",
      collectIds(approvalItems, "campaign_asset_id"),
    ),
    fetchByIds<CompanyRow>(client, "companies", "id,name,persona,partner_tier", collectIds(approvalItems, "company_id")),
    fetchByIds<ContactRow>(client, "contacts", "id,full_name,email,phone,title", collectIds(approvalItems, "contact_id")),
    fetchByIds<LeadRow>(client, "leads", "id,source,status,lead_score,loss_summary,metadata", collectIds(approvalItems, "lead_id")),
    fetchAgentOutputs(client, approvalItems.map((item) => item.id)),
  ]);

  const campaignById = indexById(campaigns);
  const assetById = indexById(assets);
  const companyById = indexById(companies);
  const contactById = indexById(contacts);
  const leadById = indexById(leads);
  const outputByApprovalId = indexAgentOutputs(agentOutputs);

  return approvalItems.map((item) =>
    mapApprovalCard({
      item,
      campaign: item.campaign_id ? campaignById.get(item.campaign_id) : undefined,
      asset: item.campaign_asset_id ? assetById.get(item.campaign_asset_id) : undefined,
      company: item.company_id ? companyById.get(item.company_id) : undefined,
      contact: item.contact_id ? contactById.get(item.contact_id) : undefined,
      lead: item.lead_id ? leadById.get(item.lead_id) : undefined,
      agentOutput: outputByApprovalId.get(item.id),
    }),
  );
}

async function fetchByIds<Row extends { id: string }>(
  client: SupabaseClient,
  table: string,
  select: string,
  ids: string[],
): Promise<Row[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await client.from(table).select(select).in("id", ids);

  if (error) {
    throw new Error(`${table} lookup failed: ${error.message}`);
  }

  return (data ?? []) as unknown as Row[];
}

async function fetchAgentOutputs(client: SupabaseClient, approvalItemIds: string[]): Promise<AgentOutputRow[]> {
  if (approvalItemIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("agent_outputs")
    .select("id,approval_item_id,output_type,title,body,risk_level,approval_status,structured_payload")
    .in("approval_item_id", approvalItemIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`agent_outputs lookup failed: ${error.message}`);
  }

  return (data ?? []) as unknown as AgentOutputRow[];
}

function mapApprovalCard(input: {
  item: ApprovalItemRow;
  campaign?: CampaignRow;
  asset?: CampaignAssetRow;
  company?: CompanyRow;
  contact?: ContactRow;
  lead?: LeadRow;
  agentOutput?: AgentOutputRow;
}): ApprovalCard {
  const { item, campaign, asset, company, contact, lead, agentOutput } = input;
  const promptInputs = mergeObjects(asset?.prompt_inputs, item.prompt_inputs);
  const reasoningPayload = item.reasoning_payload ?? {};
  const leadMetadata = lead?.metadata ?? {};
  const sourceData = getObject(reasoningPayload.source_data);
  const draftOutput = item.edited_output ?? item.draft_output ?? asset?.edited_body ?? asset?.draft_body ?? agentOutput?.body ?? "";
  const structuredDraft = buildStructuredDraft({
    draftOutput,
    structuredPayload: agentOutput?.structured_payload,
    reasoningPayload,
  });

  return {
    id: item.id,
    type: humanize(item.item_type),
    title: agentOutput?.title ?? asset?.title ?? campaign?.name ?? humanize(item.item_type),
    previewText: buildPreviewText(structuredDraft, draftOutput),
    status: item.status,
    statusLabel: statusLabel(item.status),
    riskLevel: item.risk_level,
    persona: campaign?.persona ?? company?.persona ?? getString(promptInputs.persona) ?? "unassigned",
    channel: asset?.channel ?? getString(promptInputs.channel) ?? "review",
    sourceAgent: item.requested_by ?? getString(item.audit_payload?.created_by_agent_id) ?? "Hermes",
    submittedAt: item.submitted_at,
    campaign: {
      id: campaign?.id ?? null,
      name: campaign?.name ?? "No campaign linked",
      status: campaign?.status ?? "unlinked",
      objective: campaign?.objective ?? "Review generated work before use.",
    },
    asset: {
      id: asset?.id ?? null,
      type: asset?.asset_type ?? item.item_type,
      title: asset?.title ?? agentOutput?.title ?? "Generated approval item",
      status: asset?.status ?? item.status,
    },
    relatedRecords: {
      company: company
        ? {
            id: company.id,
            label: company.name,
            detail: company.partner_tier ? `Tier ${company.partner_tier} partner candidate` : company.persona,
          }
        : null,
      contact: contact
        ? {
            id: contact.id,
            label: contact.full_name ?? contact.email ?? contact.phone ?? "Unnamed contact",
            detail: contact.title ?? contact.email ?? contact.phone ?? "Contact record",
          }
        : null,
      lead: lead
        ? {
            id: lead.id,
            label: `${lead.source} lead`,
            detail: `${lead.status}, score ${lead.lead_score}`,
          }
        : null,
    },
    promptInput: formatPromptInput(promptInputs, asset?.prompt_input),
    draftOutput,
    structuredDraft,
    complianceFlags: buildComplianceFlags(item, asset, campaign),
    riskFlags: buildRiskFlags(item, asset, lead),
    recommendedAction:
      getString(reasoningPayload.recommended_action) ??
      getString(leadMetadata.recommended_action) ??
      "Review the source data, edit if needed, then approve or request revision.",
    evidence: buildEvidence(leadMetadata, sourceData, structuredDraft),
  };
}

function collectIds(rows: ApprovalItemRow[], key: "campaign_id" | "campaign_asset_id" | "company_id" | "contact_id" | "lead_id") {
  return [...new Set(rows.map((row) => row[key]).filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function indexById<Row extends { id: string }>(rows: Row[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function indexAgentOutputs(rows: AgentOutputRow[]) {
  const byApprovalId = new Map<string, AgentOutputRow>();

  for (const row of rows) {
    if (row.approval_item_id && !byApprovalId.has(row.approval_item_id)) {
      byApprovalId.set(row.approval_item_id, row);
    }
  }

  return byApprovalId;
}

function formatPromptInput(promptInputs: JsonObject, fallback?: string | null) {
  const entries = Object.entries(promptInputs)
    .filter(([, value]) => value !== null && value !== undefined && !isObject(value))
    .map(([key, value]) => `${humanize(key)}: ${String(value)}`);

  if (entries.length > 0) {
    return entries.join("\n");
  }

  return fallback ?? "No structured prompt input was captured.";
}

function buildComplianceFlags(item: ApprovalItemRow, asset?: CampaignAssetRow, campaign?: CampaignRow) {
  const flags = new Set<string>();
  for (const note of [item.compliance_notes, asset?.compliance_notes, campaign?.compliance_notes]) {
    if (!note) continue;
    if (/coverage-neutral/i.test(note)) flags.add("Coverage-neutral");
    if (/claim|insurance/i.test(note)) flags.add("Insurance language reviewed");
    if (/review before outbound|review before use/i.test(note)) flags.add("Human review required");
    if (/no .*promise|no .*guarantee/i.test(note)) flags.add("No guarantee language");
  }

  if (flags.size === 0) {
    flags.add("Needs compliance review");
  }

  return [...flags];
}

function buildRiskFlags(item: ApprovalItemRow, asset?: CampaignAssetRow, lead?: LeadRow) {
  const flags = new Set<string>();

  if (item.risk_level !== "low") {
    flags.add(`${humanize(item.risk_level)} risk`);
  }
  if (item.locked_until_approved !== false) {
    flags.add("Locked until approved");
  }
  if (asset?.status && asset.status !== "approved") {
    flags.add(`Asset ${humanize(asset.status)}`);
  }
  if (lead && lead.lead_score >= 80) {
    flags.add("High-value lead");
  }

  return [...flags];
}

function buildStructuredDraft(input: {
  draftOutput: string;
  structuredPayload?: JsonObject | null;
  reasoningPayload: JsonObject;
}): ApprovalStructuredDraft | null {
  const payloadDraft = getObject(input.structuredPayload?.draft_output);
  const reasoningDraft = getObject(input.reasoningPayload.draft_output);
  const parsedDraft = getObject(parseDraftJson(input.draftOutput));
  const candidateSource = [payloadDraft, reasoningDraft, parsedDraft].find((draft) => Array.isArray(draft.candidates));

  if (!candidateSource) {
    return null;
  }

  const candidates = getArray(candidateSource.candidates)
    .map(mapLeadCandidate)
    .filter((candidate): candidate is ApprovalLeadCandidate => Boolean(candidate));

  if (candidates.length === 0) {
    return null;
  }

  return {
    kind: "partner_lead_list",
    leadListType: getString(candidateSource.lead_list_type) ?? "Partner lead recommendations",
    targetMarket: getString(candidateSource.target_market) ?? "Review partner lead recommendations before any external use.",
    targetZips: getArray(candidateSource.target_zips_used).filter(isString),
    suggestedOwnerAction: getString(candidateSource.suggested_owner_action) ?? "Review the list, approve enrichment, or request revisions.",
    candidates,
  };
}

function mapLeadCandidate(value: unknown): ApprovalLeadCandidate | null {
  if (!isObject(value)) {
    return null;
  }

  const companyName = getString(value.company_name);
  if (!companyName) {
    return null;
  }

  return {
    companyName,
    persona: getString(value.persona) ?? "Unassigned",
    targetZips: getArray(value.target_zips).filter(isString),
    sourceUrl: getString(value.source_url) ?? null,
    evidenceSummary: getString(value.evidence_summary) ?? "No evidence summary was provided.",
    partnerScore: getNumber(value.partner_score),
    scoreFactors: getArray(value.score_factors).filter(isString),
    recommendedNextAction: getString(value.recommended_next_action) ?? "Review before next action.",
  };
}

function parseDraftJson(value: string) {
  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    return JSON.parse(value.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function buildPreviewText(structuredDraft: ApprovalStructuredDraft | null, fallback: string) {
  if (structuredDraft?.kind === "partner_lead_list") {
    const topCandidates = structuredDraft.candidates
      .slice(0, 3)
      .map((candidate) => candidate.companyName)
      .join(", ");
    return `${structuredDraft.candidates.length} partner candidates: ${topCandidates}`;
  }

  return fallback;
}

function buildEvidence(leadMetadata: JsonObject, sourceData: JsonObject, structuredDraft?: ApprovalStructuredDraft | null) {
  const evidence = new Set<string>();
  const evidenceUrls = leadMetadata.evidence_urls;

  if (Array.isArray(evidenceUrls)) {
    for (const url of evidenceUrls) {
      if (typeof url === "string") evidence.add(url);
    }
  }

  for (const value of Object.values(sourceData)) {
    if (typeof value === "string" && value.startsWith("http")) {
      evidence.add(value);
    }
  }

  if (structuredDraft?.kind === "partner_lead_list") {
    for (const candidate of structuredDraft.candidates) {
      if (candidate.sourceUrl) {
        evidence.add(candidate.sourceUrl);
      }
    }
  }

  return [...evidence];
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
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mergeObjects(...objects: Array<JsonObject | null | undefined>) {
  return Object.assign({}, ...objects.filter((object): object is JsonObject => Boolean(object)));
}

function getObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function getString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
