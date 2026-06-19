import { NextResponse } from "next/server";

import { INVALID_JSON, arcGuard, fail, readJson } from "@/app/api/v1/arc/_lib/http";
import { blockAgentTask } from "@/lib/arc-api";

/**
 * Arc marks a task blocked (-> blocked) with a reason. Lifecycle-only; the
 * reason is stored on the task metadata and the run-log timeline.
 *
 *   POST /api/v1/arc/tasks/:id/block
 *   body: { reason, needs?, metadata? }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const { id } = await params;

  const payload = await readJson(request);
  if (payload === INVALID_JSON) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const body = payload as { reason?: unknown; needs?: unknown; metadata?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return fail("rejected", "A non-empty reason is required to block a task.", 400);
  }

  const metadata: Record<string, unknown> =
    body.metadata && typeof body.metadata === "object" ? { ...(body.metadata as Record<string, unknown>) } : {};
  if (body.needs !== undefined) {
    metadata.needs = body.needs;
  }

  try {
    const result = await blockAgentTask(id, { reason, metadata }, undefined, allowed.scope);
    if (!result.ok) {
      return result.reason === "not_found"
        ? fail("not_found", "No task with that id.", 404)
        : fail("rejected", `Task cannot be blocked (status=${result.currentStatus}).`, 409);
    }
    return NextResponse.json({ ok: true, status: "blocked", task: result.task }, { status: 201 });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to block task.", 502);
  }
}
