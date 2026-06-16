import { NextResponse } from "next/server";

import { checkBearerToken } from "@/lib/auth/api-token";
import { listApprovalHistory } from "@/lib/approvals/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Read-only ledger of human approval decisions, newest first. Arc calls this to
 * reference what has already been approved/declined/reverted when planning.
 *
 *   GET /api/v1/approvals/history?campaign_id=<uuid>&limit=<n>
 *   Authorization: Bearer <ARC_AGENT_API_TOKEN>
 *
 *   200 -> { ok: true, count, decisions: [...] }
 *   401 -> bad/missing token
 *   503 -> token or Supabase admin not configured
 */
export async function GET(request: Request) {
  const auth = checkBearerToken(request, "ARC_AGENT_API_TOKEN");

  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set ARC_AGENT_API_TOKEN on this deployment to read approval history." }
        : { ok: false, status: "unauthorized", message: "Approval history requires a valid bearer token." },
      { status: auth.status },
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required to read approval history." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaign_id") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 100, 1), 500) : 100;

  const decisions = await listApprovalHistory({ campaignId, limit });

  return NextResponse.json({ ok: true, count: decisions.length, decisions }, { status: 200 });
}
