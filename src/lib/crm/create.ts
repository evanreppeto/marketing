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
  /** Audit label for metadata.owner. */
  owner?: string;
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
  const base = { org_id: orgId, persona, metadata };

  switch (input.objectKey) {
    case "companies":
      return {
        table: "companies",
        row: { ...base, name, status: input.status || "active", website_url: detail, origin: "operator" },
      };
    case "contacts": {
      const [first, ...rest] = name.split(/\s+/);
      return {
        table: "contacts",
        row: {
          ...base,
          full_name: name,
          first_name: first ?? name,
          last_name: rest.join(" ") || null,
          email: detail,
          status: input.status || "active",
          origin: "operator",
        },
      };
    }
    case "properties":
      return {
        table: "properties",
        row: {
          ...base,
          street_line_1: name,
          city: input.city?.trim() || null,
          state: input.state?.trim() || null,
          origin: "operator",
        },
      };
    case "leads":
      return {
        table: "leads",
        row: {
          ...base,
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
        row: { ...base, status: input.status || "won", metadata: { ...metadata, title: name } },
      };
  }
}
