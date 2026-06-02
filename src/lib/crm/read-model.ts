import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

export type CrmTone = "amber" | "green" | "red" | "blue";

export type CrmPipelineRow = {
  id: string;
  record: string;
  account: string;
  type: string;
  objectType: "lead" | "job" | "partner";
  stage: string;
  owner: string;
  value: string;
  nextStep: string;
  updated: string;
  score: number;
  personaTag: string;
  serviceTags: string[];
  urgencyTag: string;
  sourceTag: string;
  lifecycleTag: string;
  missingTags: string[];
  href: string;
  tone: CrmTone;
};

export type CrmWorkspaceStat = {
  label: string;
  value: number | string;
  delta: string;
  forecast: string;
};

export type CrmObjectRow = {
  id: string;
  name: string;
  detail: string;
  status: string;
  owner: string;
  updated: string;
};

export type CrmObjectData = {
  status: "live";
  key: CrmObjectKey;
  label: string;
  href: string;
  description: string;
  count: number;
  relationships: string;
  lastActivity: string;
  primaryField: string;
  secondaryField: string;
  sampleRows: CrmObjectRow[];
};

export type CrmObjectKey = "companies" | "contacts" | "properties" | "leads" | "jobs" | "outcomes";

export type CrmOverviewData =
  | {
      status: "live";
      stats: CrmWorkspaceStat[];
      rows: CrmPipelineRow[];
    }
  | {
      status: "unavailable";
      message: string;
    };

export type CrmObjectReadResult =
  | CrmObjectData
  | {
      status: "unavailable";
      message: string;
    };

export type CrmRecordField = {
  label: string;
  value: string;
};

export type CrmRecordRelationship = {
  label: string;
  value: string;
  href: string;
};

export type CrmRecordData = {
  status: "live";
  key: CrmObjectKey;
  label: string;
  href: string;
  id: string;
  name: string;
  detail: string;
  lifecycleStatus: string;
  owner: string;
  updated: string;
  persona: string;
  confidence: string;
  journeyStage: string;
  urgency: string;
  leadScore: number | null;
  partnerScore: number | null;
  revenueScore: string | null;
  attentionReason: string;
  nextBestAction: string;
  cta: string;
  messageAngle: string;
  guardrailStatus: string;
  proofPoints: string[];
  evidence: Array<{ label: string; href?: string | null; detail?: string | null }>;
  fields: CrmRecordField[];
  relationships: CrmRecordRelationship[];
  missingFields: string[];
};

export type CrmRecordReadResult =
  | CrmRecordData
  | {
      status: "unavailable";
      message: string;
    }
  | {
      status: "not_found";
    };

type CompanyRow = {
  id: string;
  name: string | null;
  persona: string | null;
  status: string | null;
  website_url: string | null;
  phone: string | null;
  email: string | null;
  partner_tier: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type ContactRow = {
  id: string;
  company_id: string | null;
  persona: string | null;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type PropertyRow = {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  persona: string | null;
  street_line_1: string | null;
  street_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  property_type: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type LeadRow = {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  property_id: string | null;
  persona: string | null;
  status: string | null;
  routing_recommendation: string | null;
  source: string | null;
  loss_summary: string | null;
  loss_signals: string[] | null;
  lead_score: number | null;
  received_at: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type JobRow = {
  id: string;
  lead_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  property_id: string | null;
  persona: string | null;
  status: string | null;
  job_number: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  estimated_revenue_cents: number | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type OutcomeRow = {
  id: string;
  job_id: string | null;
  lead_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  property_id: string | null;
  persona: string | null;
  status: string | null;
  gross_revenue_cents: number | null;
  gross_margin_cents: number | null;
  closed_at: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
};

export async function getCrmOverviewData(client?: SupabaseClient): Promise<CrmOverviewData> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const data = await getCrmTableBundle(client);
    const rows = buildPipelineRows(data);

    return {
      status: "live",
      stats: [
        {
          label: "Leads found",
          value: data.leads.length,
          delta: `${data.leads.filter((lead) => ["new", "needs_review", "validated"].includes(lead.status ?? "")).length} need review`,
          forecast: "Hermes-created lead records appear here before approval.",
        },
        {
          label: "Companies",
          value: data.companies.length,
          delta: `${data.companies.filter((company) => company.partner_tier).length} partner-tiered`,
          forecast: "Partners, referral sources, and target companies stay separate from ops data.",
        },
        {
          label: "Jobs tracked",
          value: data.jobs.length,
          delta: `${data.jobs.filter((job) => job.status === "completed").length} completed`,
          forecast: "Later this becomes the bridge back to BSR Manager outcomes.",
        },
        {
          label: "Revenue linked",
          value: formatMoney(data.outcomes.reduce((sum, outcome) => sum + (outcome.gross_revenue_cents ?? 0), 0)),
          delta: `${data.outcomes.filter((outcome) => outcome.status === "won").length} won outcomes`,
          forecast: "Attribution will connect campaigns and partners to revenue.",
        },
      ],
      rows,
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "CRM data is unavailable." };
  }
}

export async function getCrmObjectData(key: CrmObjectKey, client?: SupabaseClient): Promise<CrmObjectReadResult> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const data = await getCrmTableBundle(client);
    const rows = mapObjectRows(key, data);
    const objectMeta = objectMetaByKey[key];

    return {
      status: "live",
      key,
      label: objectMeta.label,
      href: `/crm/${key}`,
      description: objectMeta.description,
      count: rows.length,
      relationships: buildRelationships(key, data),
      lastActivity: rows[0]?.updated ?? "No activity",
      primaryField: objectMeta.primaryField,
      secondaryField: objectMeta.secondaryField,
      sampleRows: rows,
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "CRM object data is unavailable." };
  }
}

export async function getCrmRecordData(key: CrmObjectKey, recordId: string, client?: SupabaseClient): Promise<CrmRecordReadResult> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const data = await getCrmTableBundle(client);
    const objectMeta = objectMetaByKey[key];
    const record = findRecord(key, recordId, data);

    if (!record) {
      return { status: "not_found" };
    }

    const metadata = asRecord(record.metadata);
    const persona = getString(record.persona) ?? getString(metadata.persona) ?? "Unassigned persona";
    const lifecycleStatus = titleize(recordStatus(key, record));
    const owner = getString(metadata.owner) ?? defaultOwnerForObject(key);
    const updated = record.updated_at ?? record.created_at ?? "Now";
    const scoreSet = getScores(key, record, metadata);
    const evidence = buildRecordEvidence(metadata);

    return {
      status: "live",
      key,
      label: objectMeta.label,
      href: `/crm/${key}/${recordId}`,
      id: recordId,
      name: recordName(key, record),
      detail: recordDetail(key, record, data),
      lifecycleStatus,
      owner,
      updated,
      persona: titleize(persona),
      confidence: confidenceValue(metadata),
      journeyStage: journeyStageForRecord(key, lifecycleStatus, metadata),
      urgency: urgencyForRecord(key, scoreSet.leadScore, metadata),
      leadScore: scoreSet.leadScore,
      partnerScore: scoreSet.partnerScore,
      revenueScore: scoreSet.revenueScore,
      attentionReason: attentionReasonForRecord(key, record, metadata),
      nextBestAction: nextBestActionForRecord(key, record, metadata),
      cta: ctaForPersona(persona),
      messageAngle: messageAngleForPersona(persona),
      guardrailStatus: "Internal CRM review only. No outreach, publishing, spend, or dispatch is enabled from this record.",
      proofPoints: proofPointsForRecord(key, record, metadata),
      evidence,
      fields: fieldsForRecord(key, record),
      relationships: relationshipsForRecord(key, record, data),
      missingFields: missingFieldsForRecord(key, record, evidence),
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "CRM record data is unavailable." };
  }
}

async function getCrmTableBundle(client?: SupabaseClient) {
  const supabase = client ?? getSupabaseAdminClient();
  const [companies, contacts, properties, leads, jobs, outcomes] = await Promise.all([
    supabase
      .from("companies")
      .select("id,name,persona,status,website_url,phone,email,partner_tier,metadata,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("contacts")
      .select("id,company_id,persona,status,first_name,last_name,full_name,email,phone,title,metadata,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("properties")
      .select("id,company_id,contact_id,persona,street_line_1,street_line_2,city,state,postal_code,property_type,metadata,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("leads")
      .select("id,company_id,contact_id,property_id,persona,status,routing_recommendation,source,loss_summary,loss_signals,lead_score,received_at,metadata,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("jobs")
      .select("id,lead_id,company_id,contact_id,property_id,persona,status,job_number,scheduled_at,completed_at,estimated_revenue_cents,metadata,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("outcomes")
      .select("id,job_id,lead_id,company_id,contact_id,property_id,persona,status,gross_revenue_cents,gross_margin_cents,closed_at,metadata,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  assertResult("companies", companies.error);
  assertResult("contacts", contacts.error);
  assertResult("properties", properties.error);
  assertResult("leads", leads.error);
  assertResult("jobs", jobs.error);
  assertResult("outcomes", outcomes.error);

  return {
    companies: (companies.data ?? []) as CompanyRow[],
    contacts: (contacts.data ?? []) as ContactRow[],
    properties: (properties.data ?? []) as PropertyRow[],
    leads: (leads.data ?? []) as LeadRow[],
    jobs: (jobs.data ?? []) as JobRow[],
    outcomes: (outcomes.data ?? []) as OutcomeRow[],
  };
}

function assertResult(table: string, error: { message?: string } | null) {
  if (error) {
    throw new Error(`${table} lookup failed: ${error.message ?? "Unknown Supabase error"}`);
  }
}

function buildPipelineRows(data: Awaited<ReturnType<typeof getCrmTableBundle>>): CrmPipelineRow[] {
  const companyById = new Map(data.companies.map((company) => [company.id, company]));
  const contactById = new Map(data.contacts.map((contact) => [contact.id, contact]));

  const leadRows = data.leads.slice(0, 8).map((lead) => {
    const company = lead.company_id ? companyById.get(lead.company_id) : undefined;
    const contact = lead.contact_id ? contactById.get(lead.contact_id) : undefined;
    const metadata = asRecord(lead.metadata);
    const score = lead.lead_score ?? 0;
    const evidence = buildRecordEvidence(metadata);

    return {
      id: lead.id,
      record: lead.loss_summary || titleize(lead.source ?? "Lead"),
      account: company?.name ?? contactName(contact) ?? "Unassigned account",
      type: titleize(lead.persona ?? "Lead"),
      objectType: "lead",
      stage: titleize(lead.status ?? "new"),
      owner: getString(metadata.owner) ?? "Hermes",
      value: scoreValue(lead.lead_score),
      nextStep: nextStepForLead(lead.status),
      updated: lead.updated_at ?? lead.received_at ?? "Now",
      score,
      personaTag: normalizeTag(lead.persona ?? getString(metadata.persona) ?? "unassigned_persona"),
      serviceTags: serviceTagsForLead(lead, metadata),
      urgencyTag: urgencyTagForScore(score, metadata),
      sourceTag: normalizeTag(lead.source ?? getString(metadata.source) ?? "unknown_source"),
      lifecycleTag: normalizeTag(lead.status ?? "new"),
      missingTags: missingTagsForPipelineRow({
        persona: lead.persona,
        evidenceCount: evidence.length,
        score: lead.lead_score,
        serviceTags: lead.loss_signals,
        source: lead.source,
      }),
      href: `/crm/leads/${lead.id}`,
      tone: toneForStatus(lead.status ?? "new"),
    } satisfies CrmPipelineRow;
  });

  const jobRows = data.jobs.slice(0, 4).map((job) => {
    const company = job.company_id ? companyById.get(job.company_id) : undefined;
    const contact = job.contact_id ? contactById.get(job.contact_id) : undefined;
    const metadata = asRecord(job.metadata);
    const score = job.status === "completed" ? 80 : 62;
    const revenueCents = job.estimated_revenue_cents ?? 0;

    return {
      id: job.id,
      record: job.job_number ?? `Job ${shortId(job.id)}`,
      account: company?.name ?? contactName(contact) ?? "Linked job",
      type: titleize(job.persona ?? "Job"),
      objectType: "job",
      stage: titleize(job.status ?? "pending"),
      owner: getString(metadata.owner) ?? "Ops",
      value: formatMoney(revenueCents),
      nextStep: job.status === "completed" ? "Review outcome" : "Coordinate job step",
      updated: job.updated_at ?? job.created_at ?? "Now",
      score,
      personaTag: normalizeTag(job.persona ?? getString(metadata.persona) ?? "unassigned_persona"),
      serviceTags: getStringArray(metadata.service_tags).map(normalizeTag),
      urgencyTag: getString(metadata.urgency_tag) ?? (revenueCents >= 1000000 ? "high_value" : "standard"),
      sourceTag: normalizeTag(getString(metadata.source) ?? "job_record"),
      lifecycleTag: normalizeTag(job.status ?? "pending"),
      missingTags: missingTagsForPipelineRow({
        persona: job.persona,
        evidenceCount: buildRecordEvidence(metadata).length,
        score,
        serviceTags: getStringArray(metadata.service_tags),
        source: getString(metadata.source),
      }),
      href: `/crm/jobs/${job.id}`,
      tone: toneForStatus(job.status ?? "pending"),
    } satisfies CrmPipelineRow;
  });

  const partnerRows = data.companies
    .filter((company) => company.partner_tier)
    .slice(0, 4)
    .map((company) => {
      const metadata = asRecord(company.metadata);
      const score = getNumber(metadata.partner_score) ?? partnerScore(company.partner_tier);
      return {
        id: company.id,
        record: company.name ?? `Company ${shortId(company.id)}`,
        account: company.partner_tier ? `Tier ${company.partner_tier} partner` : "Company",
        type: titleize(company.persona ?? "Company"),
        objectType: "partner",
        stage: titleize(company.status ?? "active"),
        owner: getString(metadata.owner) ?? "Robby",
        value: "Partner",
        nextStep: "Review partner follow-up",
        updated: company.updated_at ?? company.created_at ?? "Now",
        score,
        personaTag: normalizeTag(company.persona ?? getString(metadata.persona) ?? "unassigned_persona"),
        serviceTags: getStringArray(metadata.service_tags).map(normalizeTag),
        urgencyTag: getString(metadata.urgency_tag) ?? (score >= 80 ? "partner_priority" : "partner_review"),
        sourceTag: normalizeTag(getString(metadata.source) ?? "company_record"),
        lifecycleTag: normalizeTag(company.status ?? "active"),
        missingTags: missingTagsForPipelineRow({
          persona: company.persona,
          evidenceCount: buildRecordEvidence(metadata).length,
          score,
          serviceTags: getStringArray(metadata.service_tags),
          source: getString(metadata.source),
        }),
        href: `/crm/companies/${company.id}`,
        tone: toneForStatus(company.status ?? "active"),
      } satisfies CrmPipelineRow;
    });

  return [...leadRows, ...jobRows, ...partnerRows].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));
}

function mapObjectRows(key: CrmObjectKey, data: Awaited<ReturnType<typeof getCrmTableBundle>>): CrmObjectRow[] {
  const companyById = new Map(data.companies.map((company) => [company.id, company]));
  const contactById = new Map(data.contacts.map((contact) => [contact.id, contact]));

  if (key === "companies") {
    return data.companies.map((company) => ({
      id: company.id,
      name: company.name ?? `Company ${shortId(company.id)}`,
      detail: [titleize(company.persona ?? "company"), company.partner_tier ? `Tier ${company.partner_tier}` : null].filter(Boolean).join(" / "),
      status: titleize(company.status ?? "active"),
      owner: getString(asRecord(company.metadata).owner) ?? "Robby",
      updated: company.updated_at ?? company.created_at ?? "Now",
    }));
  }

  if (key === "contacts") {
    return data.contacts.map((contact) => ({
      id: contact.id,
      name: contactName(contact) ?? `Contact ${shortId(contact.id)}`,
      detail: [contact.title, contact.email, contact.phone].filter(Boolean).join(" / ") || titleize(contact.persona ?? "contact"),
      status: titleize(contact.status ?? "active"),
      owner: getString(asRecord(contact.metadata).owner) ?? "Robby",
      updated: contact.updated_at ?? contact.created_at ?? "Now",
    }));
  }

  if (key === "properties") {
    return data.properties.map((property) => ({
      id: property.id,
      name: propertyAddress(property),
      detail: [titleize(property.property_type ?? "property"), property.city].filter(Boolean).join(" / "),
      status: titleize(property.persona ?? "unassigned"),
      owner: getString(asRecord(property.metadata).owner) ?? "Ops",
      updated: property.updated_at ?? property.created_at ?? "Now",
    }));
  }

  if (key === "leads") {
    return data.leads.map((lead) => {
      const company = lead.company_id ? companyById.get(lead.company_id) : undefined;
      const contact = lead.contact_id ? contactById.get(lead.contact_id) : undefined;
      return {
        id: lead.id,
        name: lead.loss_summary ?? titleize(lead.source ?? "Lead"),
        detail: company?.name ?? contactName(contact) ?? titleize(lead.persona ?? "Lead"),
        status: titleize(lead.status ?? "new"),
        owner: getString(asRecord(lead.metadata).owner) ?? "Hermes",
        updated: lead.updated_at ?? lead.received_at ?? "Now",
      };
    });
  }

  if (key === "jobs") {
    return data.jobs.map((job) => ({
      id: job.id,
      name: job.job_number ?? `Job ${shortId(job.id)}`,
      detail: formatMoney(job.estimated_revenue_cents ?? 0),
      status: titleize(job.status ?? "pending"),
      owner: getString(asRecord(job.metadata).owner) ?? "Ops",
      updated: job.updated_at ?? job.created_at ?? "Now",
    }));
  }

  return data.outcomes.map((outcome) => ({
    id: outcome.id,
    name: `${titleize(outcome.status ?? "outcome")} ${shortId(outcome.id)}`,
    detail: formatMoney(outcome.gross_revenue_cents ?? 0),
    status: titleize(outcome.status ?? "pending"),
    owner: getString(asRecord(outcome.metadata).owner) ?? "Finance",
    updated: outcome.updated_at ?? outcome.closed_at ?? "Now",
  }));
}

type CrmBundle = Awaited<ReturnType<typeof getCrmTableBundle>>;
type AnyCrmRecord = CompanyRow | ContactRow | PropertyRow | LeadRow | JobRow | OutcomeRow;

function findRecord(key: CrmObjectKey, recordId: string, data: CrmBundle): AnyCrmRecord | null {
  if (key === "companies") return data.companies.find((row) => row.id === recordId) ?? null;
  if (key === "contacts") return data.contacts.find((row) => row.id === recordId) ?? null;
  if (key === "properties") return data.properties.find((row) => row.id === recordId) ?? null;
  if (key === "leads") return data.leads.find((row) => row.id === recordId) ?? null;
  if (key === "jobs") return data.jobs.find((row) => row.id === recordId) ?? null;
  return data.outcomes.find((row) => row.id === recordId) ?? null;
}

function recordName(key: CrmObjectKey, record: AnyCrmRecord) {
  if (key === "companies") return (record as CompanyRow).name ?? `Company ${shortId(record.id)}`;
  if (key === "contacts") return contactName(record as ContactRow) ?? `Contact ${shortId(record.id)}`;
  if (key === "properties") return propertyAddress(record as PropertyRow);
  if (key === "leads") return (record as LeadRow).loss_summary ?? titleize((record as LeadRow).source ?? "Lead");
  if (key === "jobs") return (record as JobRow).job_number ?? `Job ${shortId(record.id)}`;
  return `${titleize((record as OutcomeRow).status ?? "Outcome")} ${shortId(record.id)}`;
}

function recordDetail(key: CrmObjectKey, record: AnyCrmRecord, data: CrmBundle) {
  if (key === "companies") {
    const company = record as CompanyRow;
    return [titleize(company.persona ?? "company"), company.partner_tier ? `Tier ${company.partner_tier} partner` : null, company.website_url].filter(Boolean).join(" / ");
  }
  if (key === "contacts") {
    const contact = record as ContactRow;
    const company = contact.company_id ? data.companies.find((item) => item.id === contact.company_id) : null;
    return [contact.title, company?.name, contact.email, contact.phone].filter(Boolean).join(" / ") || titleize(contact.persona ?? "contact");
  }
  if (key === "properties") {
    const property = record as PropertyRow;
    return [titleize(property.property_type ?? "property"), property.city, property.postal_code].filter(Boolean).join(" / ");
  }
  if (key === "leads") {
    const lead = record as LeadRow;
    return [titleize(lead.persona ?? "lead"), lead.source ? `Source: ${lead.source}` : null, lead.routing_recommendation].filter(Boolean).join(" / ");
  }
  if (key === "jobs") {
    const job = record as JobRow;
    return [titleize(job.status ?? "job"), formatMoney(job.estimated_revenue_cents ?? 0), job.scheduled_at ? `Scheduled ${formatDateOnly(job.scheduled_at)}` : null].filter(Boolean).join(" / ");
  }
  const outcome = record as OutcomeRow;
  return [titleize(outcome.status ?? "outcome"), formatMoney(outcome.gross_revenue_cents ?? 0), outcome.closed_at ? `Closed ${formatDateOnly(outcome.closed_at)}` : null].filter(Boolean).join(" / ");
}

function recordStatus(key: CrmObjectKey, record: AnyCrmRecord) {
  if (key === "properties") return (record as PropertyRow).property_type ?? "property";
  return getString((record as Exclude<AnyCrmRecord, PropertyRow>).status) ?? "active";
}

function getScores(key: CrmObjectKey, record: AnyCrmRecord, metadata: Record<string, unknown>) {
  const leadScore = key === "leads" ? (record as LeadRow).lead_score : getNumber(metadata.lead_score);
  const partnerFitScore =
    key === "companies"
      ? getNumber(metadata.partner_score) ?? partnerScore((record as CompanyRow).partner_tier)
      : getNumber(metadata.partner_score);
  const revenueScore =
    key === "jobs"
      ? formatMoney((record as JobRow).estimated_revenue_cents ?? 0)
      : key === "outcomes"
        ? formatMoney((record as OutcomeRow).gross_revenue_cents ?? 0)
        : getString(metadata.revenue_score) ?? null;

  return { leadScore, partnerScore: partnerFitScore, revenueScore };
}

function buildRecordEvidence(metadata: Record<string, unknown>) {
  const evidenceUrls = getStringArray(metadata.evidence_urls);
  const sourceUrls = getStringArray(metadata.source_urls);
  const urls = uniqueStrings([...evidenceUrls, ...sourceUrls]);
  const notes = getStringArray(metadata.evidence_notes);

  return [
    ...urls.map((url) => ({ label: getHostLabel(url), href: url, detail: "Evidence URL from record metadata." })),
    ...notes.map((note) => ({ label: "Evidence note", detail: note })),
  ];
}

function confidenceValue(metadata: Record<string, unknown>) {
  return getString(metadata.confidence) ?? getString(metadata.confidence_score) ?? getString(metadata.enrichment_confidence) ?? "Missing";
}

function journeyStageForRecord(key: CrmObjectKey, lifecycleStatus: string, metadata: Record<string, unknown>) {
  return getString(metadata.journey_stage) ?? getString(metadata.relationship_stage) ?? `${objectMetaByKey[key].label} / ${lifecycleStatus}`;
}

function urgencyForRecord(key: CrmObjectKey, leadScore: number | null, metadata: Record<string, unknown>) {
  const explicit = getString(metadata.urgency) ?? getString(metadata.urgency_tag);
  if (explicit) return titleize(explicit);
  if (typeof leadScore === "number" && leadScore >= 80) return "High-value urgent";
  if (key === "leads") return "Needs review";
  if (key === "companies") return "Partner development";
  return "Normal";
}

function attentionReasonForRecord(key: CrmObjectKey, record: AnyCrmRecord, metadata: Record<string, unknown>) {
  const explicit = getString(metadata.attention_reason) ?? getString(metadata.why_mark_created_it);
  if (explicit) return explicit;
  if (key === "leads") return (record as LeadRow).loss_summary ?? "Lead needs validation, scoring, enrichment, and approval before outreach.";
  if (key === "companies") return "Company may support referral, partner, or campaign development workflows.";
  if (key === "contacts") return "Contact record can connect persona, company, lead, and approval history.";
  if (key === "outcomes") return "Outcome record can close the loop between marketing activity and revenue.";
  return "Record is available for Mark review and human inspection.";
}

function nextBestActionForRecord(key: CrmObjectKey, record: AnyCrmRecord, metadata: Record<string, unknown>) {
  const explicit = getString(metadata.next_best_action) ?? getString(metadata.recommended_action);
  if (explicit) return explicit;
  if (key === "leads") return nextStepForLead((record as LeadRow).status);
  if (key === "companies") return "Review partner fit, missing evidence, and next touch before asking Mark to draft outreach.";
  if (key === "contacts") return "Confirm role, persona, consent, and company relationship before campaign use.";
  if (key === "jobs") return "Connect job status and revenue context back to originating lead or campaign.";
  if (key === "outcomes") return "Review attribution and feed performance learning back into scoring.";
  return "Enrich missing record context before campaign or approval work.";
}

function ctaForPersona(persona: string) {
  const lower = persona.toLowerCase();
  if (lower.includes("property manager")) return "Request Vendor Packet";
  if (lower.includes("insurance")) return "Refer a Client";
  if (lower.includes("plumb") || lower.includes("sewer") || lower.includes("trade") || lower.includes("contractor")) return "Become a Partner";
  return "Call Now / Upload Photos";
}

function messageAngleForPersona(persona: string) {
  const lower = persona.toLowerCase();
  if (lower.includes("property manager")) return "Fast mitigation documentation, tenant-safe coordination, and vendor packet readiness.";
  if (lower.includes("insurance")) return "Clean documentation, claim-neutral restoration support, and easy referral handoff.";
  if (lower.includes("plumb") || lower.includes("sewer")) return "Water-loss handoff after the source is stopped, with mitigation and rebuild documentation.";
  return "Restoration, mitigation, documentation, rebuild coordination, and approval-safe next steps.";
}

function proofPointsForRecord(key: CrmObjectKey, record: AnyCrmRecord, metadata: Record<string, unknown>) {
  const proof = getStringArray(metadata.proof_points);
  if (proof.length > 0) return proof;

  if (key === "companies") {
    const company = record as CompanyRow;
    return [company.website_url ? `Website: ${company.website_url}` : null, company.phone ? `Phone: ${company.phone}` : null, company.partner_tier ? `Partner tier: ${company.partner_tier}` : null].filter(Boolean) as string[];
  }
  if (key === "contacts") {
    const contact = record as ContactRow;
    return [contact.title ? `Title: ${contact.title}` : null, contact.email ? `Email captured` : null, contact.phone ? `Phone captured` : null].filter(Boolean) as string[];
  }
  if (key === "leads") {
    const lead = record as LeadRow;
    return [lead.source ? `Source: ${lead.source}` : null, lead.routing_recommendation ? `Routing: ${lead.routing_recommendation}` : null, ...(lead.loss_signals ?? []).slice(0, 3)].filter(Boolean) as string[];
  }
  return [];
}

function fieldsForRecord(key: CrmObjectKey, record: AnyCrmRecord): CrmRecordField[] {
  if (key === "companies") {
    const company = record as CompanyRow;
    return compactFields([
      ["Name", company.name],
      ["Persona", titleize(company.persona ?? "unassigned")],
      ["Status", titleize(company.status ?? "active")],
      ["Website", company.website_url],
      ["Phone", company.phone],
      ["Email", company.email],
      ["Partner tier", company.partner_tier],
    ]);
  }
  if (key === "contacts") {
    const contact = record as ContactRow;
    return compactFields([
      ["Name", contactName(contact)],
      ["Title", contact.title],
      ["Persona", titleize(contact.persona ?? "unassigned")],
      ["Email", contact.email],
      ["Phone", contact.phone],
      ["Company id", contact.company_id],
    ]);
  }
  if (key === "properties") {
    const property = record as PropertyRow;
    return compactFields([
      ["Address", propertyAddress(property)],
      ["Type", titleize(property.property_type ?? "property")],
      ["City", property.city],
      ["State", property.state],
      ["ZIP", property.postal_code],
      ["Contact id", property.contact_id],
    ]);
  }
  if (key === "leads") {
    const lead = record as LeadRow;
    return compactFields([
      ["Loss summary", lead.loss_summary],
      ["Persona", titleize(lead.persona ?? "unassigned")],
      ["Status", titleize(lead.status ?? "new")],
      ["Source", lead.source],
      ["Lead score", typeof lead.lead_score === "number" ? `${lead.lead_score}/100` : null],
      ["Routing", lead.routing_recommendation],
    ]);
  }
  if (key === "jobs") {
    const job = record as JobRow;
    return compactFields([
      ["Job number", job.job_number],
      ["Status", titleize(job.status ?? "pending")],
      ["Estimated revenue", formatMoney(job.estimated_revenue_cents ?? 0)],
      ["Scheduled", job.scheduled_at ? formatDateOnly(job.scheduled_at) : null],
      ["Completed", job.completed_at ? formatDateOnly(job.completed_at) : null],
    ]);
  }
  const outcome = record as OutcomeRow;
  return compactFields([
    ["Status", titleize(outcome.status ?? "pending")],
    ["Revenue", formatMoney(outcome.gross_revenue_cents ?? 0)],
    ["Margin", formatMoney(outcome.gross_margin_cents ?? 0)],
    ["Closed", outcome.closed_at ? formatDateOnly(outcome.closed_at) : null],
    ["Job id", outcome.job_id],
  ]);
}

function relationshipsForRecord(key: CrmObjectKey, record: AnyCrmRecord, data: CrmBundle): CrmRecordRelationship[] {
  const relationships: CrmRecordRelationship[] = [];
  const pushCompany = (companyId: string | null | undefined) => {
    const company = companyId ? data.companies.find((item) => item.id === companyId) : null;
    if (company) relationships.push({ label: "Company", value: company.name ?? `Company ${shortId(company.id)}`, href: `/crm/companies/${company.id}` });
  };
  const pushContact = (contactId: string | null | undefined) => {
    const contact = contactId ? data.contacts.find((item) => item.id === contactId) : null;
    if (contact) relationships.push({ label: "Contact", value: contactName(contact) ?? `Contact ${shortId(contact.id)}`, href: `/crm/contacts/${contact.id}` });
  };
  const pushLead = (leadId: string | null | undefined) => {
    const lead = leadId ? data.leads.find((item) => item.id === leadId) : null;
    if (lead) relationships.push({ label: "Lead", value: lead.loss_summary ?? titleize(lead.source ?? "Lead"), href: `/crm/leads/${lead.id}` });
  };
  const pushProperty = (propertyId: string | null | undefined) => {
    const property = propertyId ? data.properties.find((item) => item.id === propertyId) : null;
    if (property) relationships.push({ label: "Property", value: propertyAddress(property), href: `/crm/properties/${property.id}` });
  };
  const pushJob = (jobId: string | null | undefined) => {
    const job = jobId ? data.jobs.find((item) => item.id === jobId) : null;
    if (job) relationships.push({ label: "Job", value: job.job_number ?? `Job ${shortId(job.id)}`, href: `/crm/jobs/${job.id}` });
  };

  if (key === "companies") {
    const company = record as CompanyRow;
    data.contacts.filter((item) => item.company_id === company.id).slice(0, 3).forEach((item) => pushContact(item.id));
    data.leads.filter((item) => item.company_id === company.id).slice(0, 3).forEach((item) => pushLead(item.id));
  } else if (key === "contacts") {
    const contact = record as ContactRow;
    pushCompany(contact.company_id);
    data.leads.filter((item) => item.contact_id === contact.id).slice(0, 3).forEach((item) => pushLead(item.id));
  } else if (key === "properties") {
    const property = record as PropertyRow;
    pushCompany(property.company_id);
    pushContact(property.contact_id);
    data.leads.filter((item) => item.property_id === property.id).slice(0, 3).forEach((item) => pushLead(item.id));
  } else if (key === "leads") {
    const lead = record as LeadRow;
    pushCompany(lead.company_id);
    pushContact(lead.contact_id);
    pushProperty(lead.property_id);
    data.jobs.filter((item) => item.lead_id === lead.id).slice(0, 2).forEach((item) => pushJob(item.id));
  } else if (key === "jobs") {
    const job = record as JobRow;
    pushLead(job.lead_id);
    pushCompany(job.company_id);
    pushContact(job.contact_id);
    pushProperty(job.property_id);
  } else {
    const outcome = record as OutcomeRow;
    pushJob(outcome.job_id);
    pushLead(outcome.lead_id);
    pushCompany(outcome.company_id);
    pushContact(outcome.contact_id);
    pushProperty(outcome.property_id);
  }

  return relationships;
}

function missingFieldsForRecord(key: CrmObjectKey, record: AnyCrmRecord, evidence: CrmRecordData["evidence"]) {
  const missing: string[] = [];
  if (!record.persona) missing.push("persona");
  if (evidence.length === 0) missing.push("evidence_urls");
  if (key === "companies") {
    const company = record as CompanyRow;
    if (!company.partner_tier) missing.push("partner_tier");
    if (!company.website_url) missing.push("website_url");
    if (!company.phone && !company.email) missing.push("phone_or_email");
  }
  if (key === "contacts") {
    const contact = record as ContactRow;
    if (!contact.title) missing.push("title");
    if (!contact.email && !contact.phone) missing.push("email_or_phone");
  }
  if (key === "leads") {
    const lead = record as LeadRow;
    if (typeof lead.lead_score !== "number") missing.push("lead_score");
    if (!lead.routing_recommendation) missing.push("routing_recommendation");
    if (!lead.loss_summary) missing.push("loss_summary");
  }
  return missing;
}

function compactFields(items: Array<[string, string | null | undefined]>): CrmRecordField[] {
  return items.map(([label, value]) => ({ label, value: value || "Missing" }));
}

function buildRelationships(key: CrmObjectKey, data: Awaited<ReturnType<typeof getCrmTableBundle>>) {
  if (key === "companies") return `${data.contacts.length} contacts / ${data.leads.length} leads / ${data.jobs.length} jobs`;
  if (key === "contacts") return `${data.companies.length} companies / ${data.leads.length} leads / ${data.outcomes.length} outcomes`;
  if (key === "properties") return `${data.contacts.length} contacts / ${data.jobs.length} jobs / ${data.leads.length} leads`;
  if (key === "leads") return `${data.contacts.length} contacts / ${data.companies.length} companies / ${data.jobs.length} jobs`;
  if (key === "jobs") return `${data.leads.length} leads / ${data.outcomes.length} outcomes / ${data.companies.length} companies`;
  return `${data.jobs.length} jobs / ${data.leads.length} leads / ${formatMoney(data.outcomes.reduce((sum, row) => sum + (row.gross_revenue_cents ?? 0), 0))} linked`;
}

const objectMetaByKey: Record<
  CrmObjectKey,
  Omit<CrmObjectData, "status" | "key" | "href" | "count" | "relationships" | "lastActivity" | "sampleRows">
> = {
  companies: {
    label: "Companies",
    description: "Referral partners, agencies, managers, and organizations.",
    primaryField: "Company",
    secondaryField: "Type",
  },
  contacts: {
    label: "Contacts",
    description: "Owners, agents, managers, vendors, and decision-makers.",
    primaryField: "Contact",
    secondaryField: "Relationship",
  },
  properties: {
    label: "Properties",
    description: "Homes, buildings, portfolios, and loss locations.",
    primaryField: "Property",
    secondaryField: "Owner / contact",
  },
  leads: {
    label: "Leads",
    description: "Validated opportunities, scores, source, and routing decision.",
    primaryField: "Lead",
    secondaryField: "Signal",
  },
  jobs: {
    label: "Jobs",
    description: "Scheduled, active, and completed restoration work.",
    primaryField: "Job",
    secondaryField: "Stage",
  },
  outcomes: {
    label: "Outcomes",
    description: "Closed revenue, margin, attribution, and conversion results.",
    primaryField: "Outcome",
    secondaryField: "Attribution",
  },
};

function nextStepForLead(status: string | null) {
  if (status === "needs_review" || status === "new") return "Review and approve lead";
  if (status === "qualified") return "Create opportunity";
  if (status === "converted") return "Review outcome";
  if (status === "lost") return "Archive or learn";
  return "Review next step";
}

function toneForStatus(status: string): CrmTone {
  if (["active", "validated", "qualified", "converted", "completed", "won", "paid"].includes(status)) return "green";
  if (["lost", "canceled", "written_off", "archived", "inactive", "do_not_contact"].includes(status)) return "red";
  if (["running", "in_progress", "scheduled"].includes(status)) return "blue";
  return "amber";
}

function partnerScore(tier: string | null) {
  if (tier === "A") return 90;
  if (tier === "B") return 76;
  if (tier === "C") return 58;
  return 40;
}

function serviceTagsForLead(lead: LeadRow, metadata: Record<string, unknown>) {
  const explicit = getStringArray(metadata.service_tags);
  const signals = lead.loss_signals ?? [];
  const summary = lead.loss_summary ?? "";
  const inferred: string[] = [];

  if (/water|flood|pipe|sump|sewer|drain/i.test(summary)) inferred.push("water_mitigation");
  if (/mold/i.test(summary)) inferred.push("mold");
  if (/fire|smoke/i.test(summary)) inferred.push("fire_smoke");
  if (/rebuild|reconstruction|drywall|floor/i.test(summary)) inferred.push("rebuild");

  const tags = uniqueStrings([...explicit, ...signals, ...inferred]).map(normalizeTag);
  return tags.length > 0 ? tags : ["service_unknown"];
}

function urgencyTagForScore(score: number, metadata: Record<string, unknown>) {
  const explicit = getString(metadata.urgency_tag) ?? getString(metadata.urgency);
  if (explicit) return normalizeTag(explicit);
  if (score >= 80) return "high_value_urgent";
  if (score >= 60) return "review_next";
  return "needs_enrichment";
}

function missingTagsForPipelineRow(input: {
  persona: string | null;
  evidenceCount: number;
  score: number | null;
  serviceTags: string[] | null;
  source: string | null;
}) {
  const missing: string[] = [];
  if (!input.persona) missing.push("missing_persona");
  if (input.evidenceCount === 0) missing.push("missing_evidence");
  if (typeof input.score !== "number") missing.push("missing_score");
  if (!input.serviceTags || input.serviceTags.length === 0) missing.push("missing_service_tag");
  if (!input.source) missing.push("missing_source");
  return missing;
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "untagged";
}

function scoreValue(score: number | null) {
  return typeof score === "number" ? `${score}/100` : "Unscored";
}

function contactName(contact?: ContactRow) {
  if (!contact) return null;
  return contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || contact.phone;
}

function propertyAddress(property: PropertyRow) {
  return [property.street_line_1, property.city, property.state].filter(Boolean).join(", ") || `Property ${shortId(property.id)}`;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDateOnly(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function titleize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortId(id: string) {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function defaultOwnerForObject(key: CrmObjectKey) {
  if (key === "leads") return "Mark";
  if (key === "jobs" || key === "properties") return "Ops";
  if (key === "outcomes") return "Revenue";
  return "Operator";
}

function getHostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source link";
  }
}
