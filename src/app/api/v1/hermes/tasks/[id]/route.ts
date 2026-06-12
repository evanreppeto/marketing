import { fail, guard, ok } from "@/app/api/v1/hermes/_lib/http";
import { getAgentTaskForApi } from "@/lib/hermes-api";

/**
 * Full detail for a single agent task: normalized task + the underlying
 * read-model detail (agent, campaign, approval, inputs, outputs, logs).
 *
 *   GET /api/v1/hermes/tasks/:id
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;

  try {
    const result = await getAgentTaskForApi(id);
    if (!result.ok) {
      return result.reason === "not_found"
        ? fail("not_found", "No task with that id.", 404)
        : fail("failed", result.message, 502);
    }
    return ok({ task: result.task });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read task.", 502);
  }
}
