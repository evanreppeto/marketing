import { isOfficialPersonaMapping } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { type CrmObjectKey } from "./read-model";

export type CreateCrmInput = {
  objectKey: CrmObjectKey;
  /** Primary display name / title. Required. */
  name: string;
  /** Official persona key (e.g. persona_homeowner_emergency) or "" for none. */
  persona?: string;
  /** Lifecycle status; each object falls back to a sensible default when blank. */
  status?: string;
  /** Secondary field — email (contacts), website (companies), source (leads). */
  detail?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  /** Parent record to link (leads → company/contact/property; outcomes → job/lead). */
  parentType?: string;
  parentId?: string;
  /** Audit label for metadata.owner. */
  owner?: string;
};

// Parent link type → the FK column it fills. Leads and outcomes carry a DB check
// constraint requiring at least one of these.
const PARENT_COLUMN: Record<string, string> = {
  company: "company_id",
  contact: "contact_id",
  property: "property_id",
  job: "job_id",
  lead: "lead_id",
};

export type CreateCrmResult = { ok: true; id: string } | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured, so nothing was written.";

/**
 * Insert a new operator-created CRM record. Mirrors src/lib/interactions
 * persistence: self-guards on isSupabaseAdminConfigured(), org-scopes the write,
 * and stamps origin:'operator' so the record reads as human- (not Arc-) created.
 * Persona is only written when it's an official mapping — never the internal
 * `unassigned_persona`, which the DB check constraint rejects. Column sets are
 * kept to the fields the CRM read-model already selects.
 */
export async function insertCrmRecord(input: CreateCrmInput, orgId?: string): Promise<CreateCrmResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const scopedOrgId = orgId ?? (await getCurrentOrgId());
  const supabase = getSupabaseAdminClient();
  const persona = input.persona && isOfficialPersonaMapping(input.persona) ? input.persona : null;
  const metadata: Record<string, unknown> = input.owner ? { owner: input.owner } : {};
  const detail = input.detail?.trim() || null;

  const { table, row } = buildInsert(input, scopedOrgId, persona, metadata, detail);

  const { data, error } = await supabase
    .from(table)
    .insert(row as never)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

function buildInsert(
  input: CreateCrmInput,
  orgId: string,
  persona: string | null,
  metadata: Record<string, unknown>,
  detail: string | null,
): { table: string; row: Record<string, unknown> } {
  const name = input.name.trim();
  // Only write `persona` when we actually have one. Some tables (companies,
  // contacts) have persona NOT NULL WITH a default — explicitly inserting null
  // violates the constraint, so omit the key and let the default apply. Leads
  // require a real persona and the action guarantees one is present.
  const base: Record<string, unknown> = { org_id: orgId, metadata };
  if (persona) base.persona = persona;

  // Parent FK for leads/outcomes (satisfies the relationship check constraint).
  const parentCol = input.parentType ? PARENT_COLUMN[input.parentType] : undefined;
  const parentLink: Record<string, unknown> = parentCol && input.parentId ? { [parentCol]: input.parentId } : {};

  switch (input.objectKey) {
    case "companies":
      return {
        table: "companies",
        row: { ...base, name, status: input.status || "active", website_url: detail, origin: "operator" },
      };
    case "contacts": {
      // full_name is a GENERATED column (first + last) — never insert it directly.
      const [first, ...rest] = name.split(/\s+/);
      return {
        table: "contacts",
        row: {
          ...base,
          first_name: first ?? name,
          last_name: rest.join(" ") || null,
          email: detail,
          status: input.status || "active",
          origin: "operator",
        },
      };
    }
    case "properties":
      // city / state / postal_code are NOT NULL in the DB — the modal requires them.
      return {
        table: "properties",
        row: {
          ...base,
          street_line_1: name,
          city: input.city?.trim() || "",
          state: input.state?.trim() || "",
          postal_code: input.postalCode?.trim() || "",
          origin: "operator",
        },
      };
    case "leads":
      return {
        table: "leads",
        row: {
          ...base,
          ...parentLink,
          loss_summary: name,
          source: detail || "manual",
          status: input.status || "new",
          received_at: new Date().toISOString(),
          origin: "operator",
        },
      };
    case "jobs":
      // jobs/outcomes have no `origin` column in the read-model contract.
      return {
        table: "jobs",
        row: { ...base, job_number: name, status: input.status || "scheduled" },
      };
    case "outcomes":
      return {
        table: "outcomes",
        row: { ...base, ...parentLink, status: input.status || "won", metadata: { ...metadata, title: name } },
      };
  }
}

/**
 * Update the editable fields of a CRM record (persona and/or status). Org-scoped;
 * persona is only applied when it's an official mapping. Table name is the
 * objectKey (companies/contacts/…). Returns the row id.
 */
export async function updateCrmRecordFields(
  objectKey: CrmObjectKey,
  recordId: string,
  patch: { persona?: string; status?: string },
  orgId?: string,
): Promise<CreateCrmResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const row: Record<string, unknown> = {};
  if (patch.persona && isOfficialPersonaMapping(patch.persona)) row.persona = patch.persona;
  if (patch.status?.trim()) row.status = patch.status.trim();
  if (Object.keys(row).length === 0) return { ok: false, error: "Nothing to update." };

  const scopedOrgId = orgId ?? (await getCurrentOrgId());
  const { data, error } = await getSupabaseAdminClient()
    .from(objectKey)
    .update(row as never)
    .eq("id", recordId)
    .eq("org_id", scopedOrgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}
