/**
 * Pure validation + normalization for Arc research-sourced CRM leads. No I/O.
 * Persistence and org-scoping live in src/lib/lead-research/. Unknown or
 * malformed contact details are coerced to null — never fabricated.
 */
import { type ParseResult } from "./interactions";
import { OFFICIAL_PERSONA_MAPPINGS, validateLeadIngestionPersona } from "./personas";

export type LeadResearchCompanyInput = {
  name: string;
  websiteUrl: string | null;
  phone: string | null;
  email: string | null;
};

export type LeadResearchContactInput = {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
};

export type LeadResearchPropertyInput = {
  streetLine1: string;
  streetLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  propertyType: string | null;
};

export type LeadResearchEvidence = { url: string; note: string | null };

export type ParsedLeadResearchInput = {
  persona: string;
  company: LeadResearchCompanyInput;
  contacts: LeadResearchContactInput[];
  property: LeadResearchPropertyInput | null;
  evidence: LeadResearchEvidence[];
  confidence: number | null;
  existingCompanyId: string | null;
  existingContactId: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strOrNull(value: unknown): string | null {
  const s = str(value);
  return s ? s : null;
}

function emailOrNull(value: unknown): string | null {
  const s = str(value).toLowerCase();
  return s && EMAIL_RE.test(s) ? s : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLeadResearchInput(
  raw: unknown,
  opts: { allowedPersonas?: readonly string[] } = {},
): ParseResult<ParsedLeadResearchInput> {
  if (!isObject(raw)) return { ok: false, error: "Request body must be an object." };

  const persona = validateLeadIngestionPersona(
    raw.persona,
    opts.allowedPersonas ?? OFFICIAL_PERSONA_MAPPINGS,
  );
  if (!persona.ok) return { ok: false, error: persona.message };

  if (!isObject(raw.company)) return { ok: false, error: "A research lead needs a company." };
  const companyName = str(raw.company.name);
  if (!companyName) return { ok: false, error: "The company needs a name." };
  const company: LeadResearchCompanyInput = {
    name: companyName,
    websiteUrl: strOrNull(raw.company.website_url),
    phone: strOrNull(raw.company.phone),
    email: emailOrNull(raw.company.email),
  };

  if (!Array.isArray(raw.contacts) || raw.contacts.length === 0) {
    return { ok: false, error: "A research lead needs at least one contact." };
  }
  const contacts: LeadResearchContactInput[] = [];
  for (const rawContact of raw.contacts) {
    if (!isObject(rawContact)) return { ok: false, error: "Each contact must be an object." };
    const contact: LeadResearchContactInput = {
      firstName: strOrNull(rawContact.first_name),
      lastName: strOrNull(rawContact.last_name),
      title: strOrNull(rawContact.title),
      email: emailOrNull(rawContact.email),
      phone: strOrNull(rawContact.phone),
    };
    if (!contact.firstName && !contact.lastName && !contact.email && !contact.phone) {
      return { ok: false, error: "Each contact needs at least a name, email, or phone." };
    }
    contacts.push(contact);
  }

  let property: LeadResearchPropertyInput | null = null;
  if (raw.property != null) {
    if (!isObject(raw.property)) return { ok: false, error: "Property must be an object." };
    const streetLine1 = str(raw.property.street_line_1);
    const city = str(raw.property.city);
    const state = str(raw.property.state);
    const postalCode = str(raw.property.postal_code);
    if (!streetLine1 || !city || state.length !== 2 || !postalCode) {
      return { ok: false, error: "A property needs street, city, 2-letter state, and postal code." };
    }
    property = {
      streetLine1,
      streetLine2: strOrNull(raw.property.street_line_2),
      city,
      state: state.toUpperCase(),
      postalCode,
      propertyType: strOrNull(raw.property.property_type),
    };
  }

  if (!Array.isArray(raw.evidence)) return { ok: false, error: "A research lead must cite its sources." };
  const evidence: LeadResearchEvidence[] = [];
  for (const rawEvidence of raw.evidence) {
    if (!isObject(rawEvidence)) continue;
    const url = str(rawEvidence.url);
    if (!url) continue;
    evidence.push({ url, note: strOrNull(rawEvidence.note) });
  }
  if (evidence.length === 0) {
    return { ok: false, error: "A research lead must cite at least one source URL." };
  }

  const confidence =
    typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
      ? raw.confidence
      : null;

  return {
    ok: true,
    value: {
      persona: persona.persona,
      company,
      contacts,
      property,
      evidence,
      confidence,
      existingCompanyId: strOrNull(raw.existing_company_id),
      existingContactId: strOrNull(raw.existing_contact_id),
    },
  };
}
