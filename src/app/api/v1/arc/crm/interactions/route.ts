import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { parseActivityInput, parseNoteInput, parseTaskInput } from "@/domain";
import { insertActivity, insertNote, insertTask } from "@/lib/interactions/persistence";

/**
 * Lets Arc attach notes, follow-up tasks, and timeline activities to any CRM
 * record. Writes through the same persistence path as the human UI, always as
 * author_kind = "agent". No outbound side effects.
 *
 *   POST /api/v1/arc/crm/interactions
 *   { "kind": "note" | "task" | "activity", ...payload }
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
  const kind = payload.kind;
  const authorName = typeof payload.author_name === "string" ? payload.author_name : "Arc";

  try {
    if (kind === "note") {
      const parsed = parseNoteInput({
        entityType: payload.entity_type,
        entityId: payload.entity_id,
        body: payload.body,
        isPinned: payload.is_pinned === true,
        isInternal: payload.is_internal === true,
        authorKind: "agent",
        authorName,
      });
      if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
      const result = await insertNote(parsed.value, scope);
      if (!result.ok) return fail("failed", result.error, 502);
      return ok({ id: result.id, kind: "note" }, 201);
    }

    if (kind === "task") {
      const parsed = parseTaskInput({
        entityType: payload.entity_type,
        entityId: payload.entity_id,
        title: payload.title,
        description: payload.description,
        dueAt: payload.due_at,
        priority: payload.priority,
        assigneeKind: payload.assignee_kind,
        assigneeName: payload.assignee_name,
        authorKind: "agent",
        authorName,
      });
      if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
      const result = await insertTask(parsed.value, scope);
      if (!result.ok) return fail("failed", result.error, 502);
      return ok({ id: result.id, kind: "task" }, 201);
    }

    if (kind === "activity") {
      const parsed = parseActivityInput({
        entityType: payload.entity_type,
        entityId: payload.entity_id,
        activityType: payload.activity_type,
        summary: payload.summary,
        detail: payload.detail,
        actorKind: "agent",
        actorName: authorName,
        metadata: payload.metadata,
      });
      if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
      const result = await insertActivity(parsed.value, scope);
      if (!result.ok) return fail("failed", result.error, 502);
      return ok({ id: result.id, kind: "activity" }, 201);
    }

    return fail("invalid_request", 'Field "kind" must be one of: note, task, activity.', 400);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to write interaction.", 502);
  }
}
