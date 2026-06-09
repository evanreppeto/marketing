import { NextResponse } from "next/server";

import { INVALID_JSON, fail, guard, readJson } from "@/app/api/v1/hermes/_lib/http";
import { createApprovalDraft } from "@/lib/hermes-api";

/**
 * Mark submits a review-ready draft into the human approval queue. The created
 * approval item is ALWAYS pending_approval + locked — Mark drafts, the human
 * decides. No approval, launch, send, or dispatch happens here.
 *
 *   POST /api/v1/hermes/drafts
 *   body: {
 *     item_type, draft,                       // required
 *     title?, summary?, risk_level?,
 *     prompt_inputs?, agent?, metadata?,
 *     campaign_id?, campaign_asset_id?,
 *     company_id?, contact_id?, lead_id?, task_id?
 *   }
 */
export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;

  const payload = await readJson(request);
  if (payload === INVALID_JSON) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const body = payload as Record<string, unknown>;
  const itemType = typeof body.item_type === "string" ? body.item_type.trim() : "";
  const draft = typeof body.draft === "string" ? body.draft.trim() : "";
  if (!itemType) {
    return fail("rejected", "item_type is required.", 400);
  }
  if (!draft) {
    return fail("rejected", "A non-empty draft is required.", 400);
  }

  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : undefined);

  try {
    const result = await createApprovalDraft({
      itemType,
      draft,
      title: str("title"),
      summary: str("summary"),
      riskLevel: str("risk_level"),
      promptInputs:
        body.prompt_inputs && typeof body.prompt_inputs === "object"
          ? (body.prompt_inputs as Record<string, unknown>)
          : undefined,
      agent: str("agent"),
      campaignId: str("campaign_id"),
      campaignAssetId: str("campaign_asset_id"),
      companyId: str("company_id"),
      contactId: str("contact_id"),
      leadId: str("lead_id"),
      taskId: str("task_id"),
      metadata: body.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : undefined,
    });
    return NextResponse.json(
      { ok: true, status: "drafted", approvalItemId: result.approvalItemId, agentOutputId: result.agentOutputId },
      { status: 201 },
    );
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to create draft.", 502);
  }
}
