import { type SupabaseClient } from "@supabase/supabase-js";

import { normalizePhoneKey, parseLeadIngestionPayload } from "@/domain";
import { syncRecordToBrain } from "@/lib/brain-ingestion/sync";
import {
  persistLeadIngestion,
  type LeadProvenance,
  type PersistedLeadIngestion,
} from "@/lib/lead-ingestion/persistence";

export type ArcWritableTable = "leads" | "companies" | "contacts";

/**
 * Per-table whitelist of columns Arc may set on an update. Pure data.
 *
 * Deliberately EXCLUDES:
 * - `review_status`: the human-confirm gate. Arc sets it once at creation
 *   (active for operator-initiated, proposed for its own discovery), but only a
 *   human may clear `proposed` → `active`, so it is not updatable here.
 * - the lead FK link columns (`company_id`/`contact_id`/`property_id`):
 *   re-linking a record to a different entity isn't a phase-1 need, and omitting
 *   them closes a cross-org FK gap (a foreign id can't be validated for org
 *   membership here).
 */
const ALLOWED_UPDATE_FIELDS: Record<ArcWritableTable, readonly string[]> = {
  leads: [
    "persona",
    "status",
    "routing_recommendation",
    "loss_summary",
    "lead_score",
  ],
  companies: [
    "name",
    "persona",
    "status",
    "partner_tier",
    "website_url",
    "phone",
    "email",
  ],
  contacts: [
    "persona",
    "status",
    "first_name",
    "last_name",
    "email",
    "phone",
    "title",
  ],
};

/** Pure: drop any key not in the table's whitelist. Never lets Arc set id/org_id. */
export function pickAllowedFields(
  table: ArcWritableTable,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = ALLOWED_UPDATE_FIELDS[table];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in fields && fields[key] !== undefined) {
      out[key] = fields[key];
    }
  }
  return out;
}

export type CreateArcLeadResult =
  | {
      ok: true;
      persisted: PersistedLeadIngestion;
      dedup: { companyMatched: boolean; contactMatched: boolean; propertyMatched: boolean; leadMatched: boolean };
    }
  | { ok: false; httpStatus: number; errors: Array<{ code: string; message: string }> };

/**
 * Arc creates a full company->contact->property->lead bundle through the same
 * domain pipeline the human ingest uses, stamped with provenance. Dedups the
 * company (by name + postal) and contact (by email) so Arc linking to an
 * existing account doesn't spawn duplicates.
 */
export async function createArcLead(params: {
  payload: unknown;
  supabase: SupabaseClient;
  orgId: string;
  reviewStatus: LeadProvenance["reviewStatus"];
  agentConfidence?: number | null;
}): Promise<CreateArcLeadResult> {
  const result = parseLeadIngestionPayload(params.payload);
  if (!result.ok) {
    return { ok: false, httpStatus: result.httpStatus, errors: result.errors };
  }

  const input = result.normalizedInput;

  const companyMatchId =
    input.company && input.property
      ? await findCompanyIdByNamePostal(params.supabase, params.orgId, input.company.name, input.property.postalCode)
      : null;
  // Name-only fallback so a company without a matching property still dedups.
  const companyId =
    companyMatchId ??
    (input.company ? await findCompanyIdByName(params.supabase, params.orgId, input.company.name) : null);

  const contactMatchId = input.contact?.email
    ? await findContactIdByEmail(params.supabase, params.orgId, input.contact.email)
    : input.contact?.phone
      ? await findContactIdByPhone(params.supabase, params.orgId, input.contact.phone)
      : null;

  const propertyMatchId = input.property
    ? await findPropertyId(params.supabase, params.orgId, input.property.streetLine1, input.property.postalCode)
    : null;

  // Only treat as the SAME lead when we matched both an existing company and contact.
  const leadMatchId =
    companyId && contactMatchId
      ? await findActiveLeadId(params.supabase, params.orgId, companyId, contactMatchId)
      : null;

  const persisted = await persistLeadIngestion({
    input,
    result,
    supabase: params.supabase,
    orgId: params.orgId,
    provenance: {
      origin: "agent",
      reviewStatus: params.reviewStatus,
      agentConfidence: params.agentConfidence ?? null,
    },
    existing: {
      companyId,
      contactId: contactMatchId,
      propertyId: propertyMatchId,
      leadId: leadMatchId,
    },
  });

  return {
    ok: true,
    persisted,
    dedup: {
      companyMatched: companyId !== null,
      contactMatched: contactMatchId !== null,
      propertyMatched: propertyMatchId !== null,
      leadMatched: leadMatchId !== null,
    },
  };
}

export type UpdateArcRecordResult =
  | { ok: true; id: string; applied: Record<string, unknown> }
  | { ok: false; httpStatus: number; message: string };

/** Arc updates an existing record's whitelisted fields. Never inserts, never deletes. */
export async function updateArcRecord(params: {
  table: ArcWritableTable;
  id: string;
  fields: Record<string, unknown>;
  supabase: SupabaseClient;
  orgId: string;
}): Promise<UpdateArcRecordResult> {
  const applied = pickAllowedFields(params.table, params.fields);
  if (Object.keys(applied).length === 0) {
    return { ok: false, httpStatus: 400, message: "No updatable fields supplied." };
  }

  const { data, error } = await params.supabase
    .from(params.table)
    .update({ ...applied, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("org_id", params.orgId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return { ok: false, httpStatus: 502, message: `Failed to update ${params.table}: ${error.message}` };
  }
  if (!data?.id) {
    return { ok: false, httpStatus: 404, message: `No ${params.table} record with id ${params.id}.` };
  }

  // Best-effort: mirror Arc's edit into the Brain so updated CRM facts stay
  // searchable. Creation is already covered via persistLeadIngestion in
  // createArcLead. A Brain failure must never fail the record update.
  try {
    await syncRecordToBrain(params.table, data.id, { client: params.supabase, orgId: params.orgId });
  } catch {
    /* ignore */
  }

  return { ok: true, id: data.id, applied };
}

async function findCompanyIdByNamePostal(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  postalCode: string,
): Promise<string | null> {
  // Match a company by exact name within the org that also has a property in the
  // same postal code — a conservative dedup that avoids cross-region collisions.
  const { data } = await supabase
    .from("companies")
    .select("id, properties!inner(postal_code)")
    .eq("org_id", orgId)
    .ilike("name", name)
    .eq("properties.postal_code", postalCode)
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

async function findContactIdByEmail(
  supabase: SupabaseClient,
  orgId: string,
  email: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

async function findCompanyIdByName(supabase: SupabaseClient, orgId: string, name: string): Promise<string | null> {
  const { data } = await supabase
    .from("companies")
    .select("id")
    .eq("org_id", orgId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

async function findContactIdByPhone(supabase: SupabaseClient, orgId: string, phone: string): Promise<string | null> {
  const key = normalizePhoneKey(phone);
  if (!key) return null;
  // Phone is stored unnormalized; fetch a small candidate set and compare keys in app code.
  const { data } = (await supabase
    .from("contacts")
    .select("id, phone")
    .eq("org_id", orgId)
    .not("phone", "is", null)
    .limit(200)) as { data: Array<{ id: string; phone: string | null }> | null };
  const match = (data ?? []).find((row) => normalizePhoneKey(row.phone) === key);
  return match?.id ?? null;
}

async function findPropertyId(
  supabase: SupabaseClient,
  orgId: string,
  streetLine1: string,
  postalCode: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("properties")
    .select("id")
    .eq("org_id", orgId)
    .ilike("street_line_1", streetLine1)
    .eq("postal_code", postalCode)
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

async function findActiveLeadId(
  supabase: SupabaseClient,
  orgId: string,
  companyId: string,
  contactId: string,
): Promise<string | null> {
  // Same company + contact + not archived == the same lead; refresh it instead of duplicating.
  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("org_id", orgId)
    .eq("company_id", companyId)
    .eq("contact_id", contactId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}
