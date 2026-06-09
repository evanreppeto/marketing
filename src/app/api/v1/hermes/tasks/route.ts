import { fail, guard, ok } from "@/app/api/v1/hermes/_lib/http";
import { resolveStatusFilter } from "@/domain";
import { listAgentTasks } from "@/lib/hermes-api";

/**
 * List agent tasks for Mark. Read-only; returns normalized task objects with a
 * hardcoded `outbound_locked: true`.
 *
 *   GET /api/v1/hermes/tasks?status=blocked&assignee=mark&limit=20
 *
 * `status` accepts both the spec vocabulary (pending|in_progress|…) and the
 * native enum (queued|running|blocked|needs_approval|completed|failed|canceled).
 */
export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;

  const url = new URL(request.url);

  const statusParam = url.searchParams.get("status");
  let status;
  if (statusParam) {
    const resolved = resolveStatusFilter(statusParam);
    if (!resolved) {
      return fail("rejected", `Unknown status filter: ${statusParam}`, 400);
    }
    status = resolved;
  }

  const assignee = url.searchParams.get("assignee") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const tasks = await listAgentTasks({ status, assignee, limit });
    return ok({ tasks });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list tasks.", 502);
  }
}
