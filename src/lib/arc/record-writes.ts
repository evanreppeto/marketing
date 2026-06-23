import { type SupabaseClient } from "@supabase/supabase-js";

import { parseLeadIngestionPayload } from "@/domain";
import { syncArcLeadToBrain } from "@/lib/arc/lead-brain-sync";
import {
  persistLeadIngestion,
  type LeadProvenance,
  type PersistedLeadIngestion,
} from "@/lib/lead-ingestion/persistence";
import { type TypedSupabaseClient } from "@/lib/supabase/server";

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

  // Mirror the new lead bundle into the brain so Arc can recall what it created.
  // Best-effort: the lead is already persisted, so a knowledge-graph failure must
  // never fail the CRM write.
  try {
    await syncArcLeadToBrain({
      input,
      result,
      persisted,
      client: params.supabase as unknown as TypedSupabaseClient,
      orgId: params.orgId,
    });
  } catch {
    // swallow — brain sync is an enhancement, not part of the write contract.
  }

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
