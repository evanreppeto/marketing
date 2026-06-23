import { type SupabaseClient } from "@supabase/supabase-js";

import { parseLeadIngestionPayload } from "@/domain";
import {
  persistLeadIngestion,
  type LeadProvenance,
  type PersistedLeadIngestion,
} from "@/lib/lead-ingestion/persistence";

export type ArcWritableTable = "leads" | "companies" | "contacts";

/** Per-table whitelist of columns Arc may set on an update. Pure data. */
const ALLOWED_UPDATE_FIELDS: Record<ArcWritableTable, readonly string[]> = {
  leads: [
    "persona",
    "status",
    "routing_recommendation",
    "loss_summary",
    "lead_score",
    "review_status",
    "company_id",
    "contact_id",
    "property_id",
  ],
  companies: [
    "name",
    "persona",
    "status",
    "partner_tier",
    "website_url",
    "phone",
    "email",
    "review_status",
  ],
  contacts: [
    "persona",
    "status",
    "first_name",
    "last_name",
    "email",
    "phone",
    "title",
    "review_status",
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
  | { ok: true; persisted: PersistedLeadIngestion; dedup: { companyMatched: boolean; contactMatched: boolean } }
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
      ? await findCompanyIdByNamePostal(
          params.supabase,
          params.orgId,
          input.company.name,
          input.property.postalCode,
        )
      : null;

  const contactMatchId = input.contact?.email
    ? await findContactIdByEmail(params.supabase, params.orgId, input.contact.email)
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
    existing: { companyId: companyMatchId, contactId: contactMatchId },
  });

  return {
    ok: true,
    persisted,
    dedup: { companyMatched: companyMatchId !== null, contactMatched: contactMatchId !== null },
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
