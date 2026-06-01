import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

export type CrmTone = "amber" | "green" | "red" | "blue";

export type CrmPipelineRow = {
  id: string;
  record: string;
  account: string;
  type: string;
  stage: string;
  owner: string;
  value: string;
  nextStep: string;
  updated: string;
  score: number;
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

    return {
      id: lead.id,
      record: lead.loss_summary || titleize(lead.source ?? "Lead"),
      account: company?.name ?? contactName(contact) ?? "Unassigned account",
      type: titleize(lead.persona ?? "Lead"),
      stage: titleize(lead.status ?? "new"),
      owner: getString(asRecord(lead.metadata).owner) ?? "Hermes",
      value: scoreValue(lead.lead_score),
      nextStep: nextStepForLead(lead.status),
      updated: lead.updated_at ?? lead.received_at ?? "Now",
      score: lead.lead_score ?? 0,
      href: `/crm/leads/${lead.id}`,
      tone: toneForStatus(lead.status ?? "new"),
    } satisfies CrmPipelineRow;
  });

  const jobRows = data.jobs.slice(0, 4).map((job) => {
    const company = job.company_id ? companyById.get(job.company_id) : undefined;
    const contact = job.contact_id ? contactById.get(job.contact_id) : undefined;

    return {
      id: job.id,
      record: job.job_number ?? `Job ${shortId(job.id)}`,
      account: company?.name ?? contactName(contact) ?? "Linked job",
      type: titleize(job.persona ?? "Job"),
      stage: titleize(job.status ?? "pending"),
      owner: getString(asRecord(job.metadata).owner) ?? "Ops",
      value: formatMoney(job.estimated_revenue_cents ?? 0),
      nextStep: job.status === "completed" ? "Review outcome" : "Coordinate job step",
      updated: job.updated_at ?? job.created_at ?? "Now",
      score: job.status === "completed" ? 80 : 62,
      href: `/crm/jobs/${job.id}`,
      tone: toneForStatus(job.status ?? "pending"),
    } satisfies CrmPipelineRow;
  });

  const partnerRows = data.companies
    .filter((company) => company.partner_tier)
    .slice(0, 4)
    .map((company) => ({
      id: company.id,
      record: company.name ?? `Company ${shortId(company.id)}`,
      account: company.partner_tier ? `Tier ${company.partner_tier} partner` : "Company",
      type: titleize(company.persona ?? "Company"),
      stage: titleize(company.status ?? "active"),
      owner: getString(asRecord(company.metadata).owner) ?? "Robby",
      value: "Partner",
      nextStep: "Review partner follow-up",
      updated: company.updated_at ?? company.created_at ?? "Now",
      score: partnerScore(company.partner_tier),
      href: `/crm/companies/${company.id}`,
      tone: toneForStatus(company.status ?? "active"),
    }));

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
