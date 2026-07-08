"use server";

import { revalidatePath } from "next/cache";

import { isOfficialPersonaMapping } from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { type CreateCrmInput, insertCrmRecord } from "@/lib/crm/create";
import { type CrmObjectKey } from "@/lib/crm/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Real operator write for the CRM board's "Add {record}" button. A new CRM
 * record is internal (never outbound) so it persists directly — through
 * requireOperator() + org-scoped persistence, stamped origin:'operator'.
 * `persisted: false` is the honest offline/demo signal: the board may show the
 * new row optimistically without claiming it was saved.
 */
export type CreateResult =
  | { ok: true; persisted: boolean; id?: string }
  | { ok: false; error: string };

const VALID_KEYS = new Set<CrmObjectKey>([
  "companies",
  "contacts",
  "properties",
  "leads",
  "jobs",
  "outcomes",
]);

export async function createCrmRecord(input: CreateCrmInput): Promise<CreateResult> {
  await requireOperator();

  if (!VALID_KEYS.has(input.objectKey)) return { ok: false, error: "Unknown record type." };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "A name is required." };

  // Enforce the object's DB-required columns up front (they're NOT NULL in
  // Postgres, so a real insert would otherwise fail after the optimistic row).
  if (input.objectKey === "leads" && !isOfficialPersonaMapping(input.persona)) {
    return { ok: false, error: "A lead needs a persona." };
  }
  if (input.objectKey === "properties" && !(input.city?.trim() && input.state?.trim() && input.postalCode?.trim())) {
    return { ok: false, error: "A property needs a city, state, and ZIP." };
  }

  const actor = await getOperatorActor();

  // Offline/demo: no DB to write to. Report success-but-unpersisted so the board
  // can show the record without claiming it was saved.
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  // Leads and outcomes carry a DB check constraint requiring a linked parent
  // (a lead needs a company/contact/property; an outcome needs a job/lead), so
  // they can't be created bare. Fail honestly until the link picker exists,
  // rather than surface a raw Postgres constraint error.
  if (input.objectKey === "leads") {
    return { ok: false, error: "A lead must be linked to a company, contact, or property — add it from that record." };
  }
  if (input.objectKey === "outcomes") {
    return { ok: false, error: "An outcome must be linked to a job or lead — add it from that record." };
  }

  const ctx = await getCurrentWorkspaceContext();
  const result = await insertCrmRecord({ ...input, name, owner: actor }, ctx.orgId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/crm");
  return { ok: true, persisted: true, id: result.id };
}
