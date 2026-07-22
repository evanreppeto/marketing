"use server";

import { revalidatePath } from "next/cache";

import { entityTypeFromCrmObjectKey, parseTaskInput } from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getCurrentOrgId } from "@/lib/auth/org";
import { bulkUpdateCrmPersona, type CreateCrmInput, insertCrmRecord } from "@/lib/crm/create";
import { insertTask } from "@/lib/interactions/persistence";
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

export type BulkPersonaResult =
  | { ok: true; persisted: boolean; count?: number }
  | { ok: false; error: string };

/**
 * Bulk-assign one persona to the selected records (the CRM board's selection bar).
 * Internal only — never outbound. requireOperator() + org-scoped, and the persona
 * is validated against the workspace's taxonomy. `persisted: false` is the honest
 * offline/demo signal so the board can reflect it optimistically.
 */
export async function bulkAssignPersona(objectKey: string, ids: string[], persona: string): Promise<BulkPersonaResult> {
  await requireOperator();
  if (!VALID_KEYS.has(objectKey as CrmObjectKey)) return { ok: false, error: "Unknown record type." };
  if (!persona?.trim()) return { ok: false, error: "Choose a persona." };
  if (!ids?.length) return { ok: false, error: "Select at least one record." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const orgId = await getCurrentOrgId();
  const res = await bulkUpdateCrmPersona(objectKey as CrmObjectKey, ids, persona.trim(), orgId);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/crm");
  return { ok: true, persisted: true, count: res.count };
}

export type BulkTaskResult =
  | { ok: true; persisted: boolean; count?: number }
  | { ok: false; error: string };

/**
 * Add the same follow-up task to each selected record (the CRM board's selection
 * bar). Internal only — tasks never go outbound. requireOperator() + org-scoped
 * per insert. Optimistic/local ids are skipped (they aren't saved yet). Loops the
 * single-record insert — the selection is a handful of records, low frequency.
 */
export async function bulkAddTask(objectKey: string, ids: string[], title: string): Promise<BulkTaskResult> {
  await requireOperator();
  if (!VALID_KEYS.has(objectKey as CrmObjectKey)) return { ok: false, error: "Unknown record type." };
  const entityType = entityTypeFromCrmObjectKey(objectKey);
  if (!entityType) return { ok: false, error: "Unknown record type." };
  const body = title?.trim();
  if (!body) return { ok: false, error: "Enter a task." };
  const cleanIds = [...new Set(ids.map((id) => id.trim()).filter((id) => id && !id.startsWith("local-")))];
  if (cleanIds.length === 0) return { ok: false, error: "Select at least one saved record." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  const scope = { orgId: ctx.orgId, workspaceId: ctx.workspaceId ?? undefined };
  const actor = await getOperatorActor();

  let count = 0;
  for (const recordId of cleanIds) {
    const parsed = parseTaskInput({
      entityType,
      entityId: recordId,
      title: body,
      authorKind: "human",
      authorName: actor,
      assigneeKind: "human",
      assigneeName: actor,
    });
    if (!parsed.ok) continue;
    const result = await insertTask(parsed.value, scope);
    if (result.ok) count += 1;
  }
  if (count === 0) return { ok: false, error: "Could not add the task." };
  revalidatePath("/crm");
  return { ok: true, persisted: true, count };
}

export async function createCrmRecord(input: CreateCrmInput): Promise<CreateResult> {
  await requireOperator();

  if (!VALID_KEYS.has(input.objectKey)) return { ok: false, error: "Unknown record type." };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "A name is required." };

  // Enforce the object's DB-required columns / check constraints up front (they'd
  // otherwise fail the real insert after the optimistic row).
  // A lead requires a persona (NOT NULL). Validity against the org's taxonomy is
  // enforced in insertCrmRecord, which has the org scope to check it.
  if (input.objectKey === "leads" && !input.persona?.trim()) {
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
