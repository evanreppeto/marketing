import { NextResponse } from "next/server";

import { INVALID_JSON, fail, guard, readJson } from "@/app/api/v1/hermes/_lib/http";
import { completeAgentTask } from "@/lib/hermes-api";

/**
 * Mark marks a task completed (-> completed). Lifecycle-only; never unlocks
 * outbound. Returns 409 if the task is already in a terminal state.
 *
 *   POST /api/v1/hermes/tasks/:id/complete
 *   body: { summary?, outputs?, metadata? }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guard(request);
  if (denied) return denied;

  const { id } = await params;

  const payload = await readJson(request);
  if (payload === INVALID_JSON) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const body = (payload ?? {}) as { summary?: unknown; outputs?: unknown; metadata?: unknown };

  const metadata: Record<string, unknown> =
    body.metadata && typeof body.metadata === "object" ? { ...(body.metadata as Record<string, unknown>) } : {};
  if (body.outputs !== undefined) {
    metadata.outputs = body.outputs;
  }

  try {
    const result = await completeAgentTask(id, {
      summary: typeof body.summary === "string" ? body.summary : undefined,
      metadata,
    });
    if (!result.ok) {
      return result.reason === "not_found"
        ? fail("not_found", "No task with that id.", 404)
        : fail("rejected", `Task cannot be completed (status=${result.currentStatus}).`, 409);
    }
    return NextResponse.json({ ok: true, status: "completed", task: result.task }, { status: 201 });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to complete task.", 502);
  }
}
