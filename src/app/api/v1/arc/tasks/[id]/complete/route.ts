import { NextResponse } from "next/server";

import { INVALID_JSON, arcGuard, fail, readJson } from "@/app/api/v1/arc/_lib/http";
import { completeAgentTask } from "@/lib/arc-api";

/**
 * Arc marks a task completed (-> completed). Lifecycle-only; never unlocks
 * outbound. Returns 409 if the task is already in a terminal state.
 *
 *   POST /api/v1/arc/tasks/:id/complete
 *   body: { summary?, outputs?, metadata? }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

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
    const result = await completeAgentTask(
      id,
      {
        summary: typeof body.summary === "string" ? body.summary : undefined,
        metadata,
      },
      undefined,
      allowed.scope,
    );
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
