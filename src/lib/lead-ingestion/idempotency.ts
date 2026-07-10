import { type SupabaseClient } from "@supabase/supabase-js";

// Idempotency lookup for CRM import (BSR-368). `persistLeadIngestion` will UPDATE
// a lead in place when handed pre-resolved `existing` ids, but it does not itself
// find them — so an import that pulls the same external record twice would insert
// a duplicate. This helper closes that gap: it resolves an existing lead (and its
// attached company/contact/property) by (org_id, external_lead_id), giving the
// import path an idempotent upsert keyed on the source system's own id.
//
// Org-scoped by contract: every query filters org_id, so a lookup can never match
// another tenant's lead (RLS is bypassed by the service-role client the import
// runs under, so this in-code org filter IS the boundary — see docs/TENANCY.md).

export type ExistingLeadRefs = {
  leadId: string;
  companyId: string | null;
  contactId: string | null;
  propertyId: string | null;
};

type LeadRow = {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  property_id: string | null;
};

/**
 * Find an existing lead for (orgId, externalLeadId), returning its id plus the
 * attached company/contact/property ids so the caller can update them in place
 * instead of inserting duplicates. Returns null when no such lead exists (a fresh
 * import) or the id is blank. Best-effort: a query error resolves to null so a
 * lookup blip degrades to "insert a new row" rather than throwing the whole batch.
 */
export async function findExistingLeadByExternalId(
  client: SupabaseClient,
  orgId: string,
  externalLeadId: string | null | undefined,
): Promise<ExistingLeadRefs | null> {
  const externalId = externalLeadId?.trim();
  if (!externalId) return null;

  const { data, error } = await client
    .from("leads")
    .select("id,company_id,contact_id,property_id")
    .eq("org_id", orgId)
    .eq("external_lead_id", externalId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<LeadRow>();

  if (error || !data) return null;
  return {
    leadId: data.id,
    companyId: data.company_id,
    contactId: data.contact_id,
    propertyId: data.property_id,
  };
}
