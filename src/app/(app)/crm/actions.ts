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

const LEAD_PARENTS = new Set(["company", "contact", "property"]);
const OUTCOME_PARENTS = new Set(["job", "lead"]);

export async function createCrmRecord(input: CreateCrmInput): Promise<CreateResult> {
  await requireOperator();

  if (!VALID_KEYS.has(input.objectKey)) return { ok: false, error: "Unknown record type." };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "A name is required." };

  // Enforce the object's DB-required columns / check constraints up front (they'd
  // otherwise fail the real insert after the optimistic row).
  if (input.objectKey === "leads" && !isOfficialPersonaMapping(input.persona)) {
    return { ok: false, error: "A lead needs a persona." };
  }
  if (input.objectKey === "properties" && !(input.city?.trim() && input.state?.trim() && input.postalCode?.trim())) {
    return { ok: false, error: "A property needs a city, state, and ZIP." };
  }
  // Leads and outcomes carry a "must link a parent" check constraint.
  if (input.objectKey === "leads" && !LEAD_PARENTS.has(input.parentType ?? "")) {
    return { ok: false, error: "Link the lead to a company, contact, or property." };
  }
  if (input.objectKey === "outcomes" && !OUTCOME_PARENTS.has(input.parentType ?? "")) {
    return { ok: false, error: "Link the outcome to a job or lead." };
  }
  if ((input.objectKey === "leads" || input.objectKey === "outcomes") && !input.parentId) {
    return { ok: false, error: "Choose a record to link to." };
  }

  const actor = await getOperatorActor();

  // Offline/demo: no DB to write to. Report success-but-unpersisted so the board
  // can show the record without claiming it was saved.
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  const result = await insertCrmRecord({ ...input, name, owner: actor }, ctx.orgId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/crm");
  return { ok: true, persisted: true, id: result.id };
}
