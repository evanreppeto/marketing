import { NextResponse } from "next/server";

import { INVALID_JSON, arcGuard, fail, readJson } from "@/app/api/v1/arc/_lib/http";
import { AGENT_RUN_STATUS_VALUES, normalizeAgentRunStatus } from "@/domain";
import { appendAgentRunLog } from "@/lib/arc-api";

/**
 * Arc appends a run-log entry to a task. Writes to `agent_run_logs` only — it
 * does NOT change task lifecycle state.
 *
 *   POST /api/v1/arc/tasks/:id/log
 *   body: { message?, reasoning_summary?, run_status?, model_provider?, model_name?, metadata? }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const { id } = await params;

  const payload = await readJson(request);
  if (payload === INVALID_JSON) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }

  const body = payload as {
    message?: unknown;
    reasoning_summary?: unknown;
    run_status?: unknown;
    model_provider?: unknown;
    model_name?: unknown;
    metadata?: unknown;
  };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const reasoningSummary = typeof body.reasoning_summary === "string" ? body.reasoning_summary.trim() : "";
  if (!message && !reasoningSummary) {
    return fail("rejected", "A non-empty message or reasoning_summary is required.", 400);
  }

  // run_status writes to the agent_run_status Postgres enum. Normalize the model's
  // synonyms (in_progress->running, done->completed…) and reject an unknown value
  // with a clean 400 rather than forwarding it to a late, opaque Postgres 502.
  let runStatus: string | undefined;
  if (typeof body.run_status === "string" && body.run_status.trim().length > 0) {
    const normalized = normalizeAgentRunStatus(body.run_status);
    if (!normalized) {
      return fail("rejected", `Unknown run_status "${body.run_status}". Use one of: ${AGENT_RUN_STATUS_VALUES.join(", ")}.`, 400);
    }
    runStatus = normalized;
  }

  try {
    const result = await appendAgentRunLog(id, {
      message: message || undefined,
      reasoningSummary: reasoningSummary || undefined,
      runStatus,
      modelProvider: typeof body.model_provider === "string" ? body.model_provider : undefined,
      modelName: typeof body.model_name === "string" ? body.model_name : undefined,
      metadata: body.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : undefined,
    }, undefined, allowed.scope);
    if (!result.ok) {
      return fail("not_found", "No task with that id.", 404);
    }
    return NextResponse.json({ ok: true, status: "recorded", logId: result.logId }, { status: 201 });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to record log.", 502);
  }
}
