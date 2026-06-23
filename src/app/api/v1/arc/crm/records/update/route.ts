import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { parseActivityInput } from "@/domain";
import { updateArcRecord, type ArcWritableTable } from "@/lib/arc/record-writes";
import { insertActivity } from "@/lib/interactions/persistence";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const ENTITY_TYPE: Record<ArcWritableTable, string> = {
  leads: "lead",
  companies: "company",
  contacts: "contact",
};

const WRITABLE_TABLES: ArcWritableTable[] = ["leads", "companies", "contacts"];

/**
 * Lets Arc UPDATE whitelisted fields on an existing lead/company/contact, then
 * logs a timeline activity for the change. Never inserts or deletes. Internal
 * only — no outbound side effects.
 *
 *   POST /api/v1/arc/crm/records/update
 *   { "table": "leads"|"companies"|"contacts", "id": "<uuid>",
 *     "fields": { ...whitelisted columns... }, "summary"?: "why" }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  const scope = { orgId: allowed.scope.orgId, workspaceId: allowed.scope.workspaceId };

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }
  const payload = body as Record<string, unknown>;

  const table = payload.table;
  if (typeof table !== "string" || !(WRITABLE_TABLES as string[]).includes(table)) {
    return fail("invalid_request", 'Field "table" must be one of: leads, companies, contacts.', 400);
  }
  const id = payload.id;
  if (typeof id !== "string" || id.length === 0) {
    return fail("invalid_request", 'Field "id" is required.', 400);
  }
  const fields = payload.fields;
  if (typeof fields !== "object" || fields === null) {
    return fail("invalid_request", 'Field "fields" must be a JSON object.', 400);
  }

  try {
    const result = await updateArcRecord({
      table: table as ArcWritableTable,
      id,
      fields: fields as Record<string, unknown>,
      supabase: getSupabaseAdminClient(),
      orgId: allowed.scope.orgId,
    });
    if (!result.ok) return fail("failed", result.message, result.httpStatus);

    // Audit trail: log what Arc changed as a timeline activity. Best-effort — a
    // failed log must not fail the write. "arc_update" is not in CRM_ACTIVITY_TYPES,
    // so we use "record_updated" which is the canonical enum value for this event.
    const summary =
      typeof payload.summary === "string" && payload.summary.length > 0
        ? payload.summary
        : `Arc updated ${Object.keys(result.applied).join(", ")}`;
    const activity = parseActivityInput({
      entityType: ENTITY_TYPE[table as ArcWritableTable],
      entityId: id,
      activityType: "record_updated",
      summary,
      actorKind: "agent",
      actorName: "Arc",
      metadata: { fields: result.applied },
    });
    if (activity.ok) {
      try {
        await insertActivity(activity.value, scope);
      } catch {
        /* best-effort audit log — ignore failures */
      }
    }

    return ok({ id: result.id, table, applied: result.applied }, 200);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to update record.", 502);
  }
}
