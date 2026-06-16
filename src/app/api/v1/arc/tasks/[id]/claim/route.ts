import { NextResponse } from "next/server";

import { fail, guard } from "@/app/api/v1/arc/_lib/http";
import { claimAgentTask } from "@/lib/arc-api";

/**
 * Arc claims a queued task (queued -> running). Lifecycle-only; outbound stays
 * locked. Returns 409 if the task is not in a claimable state.
 *
 *   POST /api/v1/arc/tasks/:id/claim
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;

  try {
    const result = await claimAgentTask(id);
    if (!result.ok) {
      return result.reason === "not_found"
        ? fail("not_found", "No task with that id.", 404)
        : fail("rejected", `Task is not claimable (status=${result.currentStatus}).`, 409);
    }
    return NextResponse.json({ ok: true, status: "claimed", task: result.task }, { status: 201 });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to claim task.", 502);
  }
}
