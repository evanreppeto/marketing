import { NextResponse } from "next/server";

import { INVALID_JSON, arcGuard, fail, readJson } from "@/app/api/v1/arc/_lib/http";
import { addApprovalRecommendation } from "@/lib/arc-api";

/**
 * Arc adds a RECOMMENDATION to an approval item. This is advisory only: it
 * writes to the `approval_recommendations` ledger and NEVER approves, rejects,
 * launches, sends, or publishes. The human approval gate is untouched.
 *
 *   POST /api/v1/arc/approvals/:id/recommendation
 *   body: { recommendation, rationale?, risk_flags?, suggested_edits?, agent?, metadata? }
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
    recommendation?: unknown;
    rationale?: unknown;
    risk_flags?: unknown;
    suggested_edits?: unknown;
    agent?: unknown;
    metadata?: unknown;
  };
  const recommendation = typeof body.recommendation === "string" ? body.recommendation.trim() : "";
  if (!recommendation) {
    return fail("rejected", "A non-empty recommendation is required.", 400);
  }

  const riskFlags = Array.isArray(body.risk_flags)
    ? body.risk_flags.filter((flag): flag is string => typeof flag === "string")
    : undefined;

  try {
    const result = await addApprovalRecommendation(
      {
        approvalItemId: id,
        agent: typeof body.agent === "string" ? body.agent : undefined,
        recommendation,
        rationale: typeof body.rationale === "string" ? body.rationale : undefined,
        riskFlags,
        suggestedEdits: typeof body.suggested_edits === "string" ? body.suggested_edits : undefined,
        metadata: body.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : undefined,
      },
      undefined,
      { orgId: allowed.scope.orgId, workspaceId: allowed.scope.workspaceId },
    );
    if (!result.ok) {
      return fail("not_found", "No approval item with that id.", 404);
    }
    return NextResponse.json(
      { ok: true, status: "recorded", recommendationId: result.recommendationId },
      { status: 201 },
    );
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to record recommendation.", 502);
  }
}
