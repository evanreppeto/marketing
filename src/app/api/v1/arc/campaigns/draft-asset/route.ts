import { NextResponse } from "next/server";

import { INVALID_JSON, arcGuard, fail, readJson } from "@/app/api/v1/arc/_lib/http";
import { linkConversationToCampaign } from "@/lib/arc-chat/persistence";
import { createCampaignShell, promoteAssetToCampaign } from "@/lib/campaigns/create";
import { markOpportunityDrafted } from "@/lib/opportunities/persistence";

/**
 * Lets Arc create an approval-gated campaign draft asset. If `campaign_id` is
 * given, the asset is attached to that campaign; otherwise a draft campaign
 * shell is created first (requires name/persona/restoration_focus). Reuses the
 * same persistence as the operator promote flow, so the asset gets a
 * campaign_assets row + an approval_items gate and is inline-approvable in chat.
 * Author is always "Arc". No outbound — the asset is pending_approval + locked.
 *
 *   POST /api/v1/arc/campaigns/draft-asset
 *   { campaign_id?, name?, persona?, restoration_focus?,
 *     asset_type, title, body?, media_url?, media_path?,
 *     media?: { source?, model?, jobId?, format?, riskFlags? },
 *     opportunity_id? }
 *   -> 201 { ok, status:"created", campaignId, assetId }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  const tenant = { org_id: allowed.scope.orgId, workspace_id: allowed.scope.workspaceId };

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const body = payload as Record<string, unknown>;

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const campaignIdIn = str(body.campaign_id);
  const assetType = str(body.asset_type);
  const title = str(body.title);
  const draftBody = str(body.body) || null;
  const mediaUrl = str(body.media_url) || null;
  const mediaPath = str(body.media_path) || null;
  const opportunityId = str(body.opportunity_id) || null;
  const conversationId = str(body.conversation_id) || null;

  // Optional generation provenance (AI source / model / jobId / risk flags) so the
  // AI tag survives on the durable asset record, not just the chat card.
  const mediaIn = typeof body.media === "object" && body.media !== null ? (body.media as Record<string, unknown>) : {};
  const media = {
    source: str(mediaIn.source) || undefined,
    model: str(mediaIn.model) || undefined,
    jobId: str(mediaIn.jobId) || undefined,
    format: str(mediaIn.format) || undefined,
    riskFlags: Array.isArray(mediaIn.riskFlags)
      ? mediaIn.riskFlags.filter((f): f is string => typeof f === "string")
      : undefined,
  };

  if (!assetType) return fail("rejected", "asset_type is required.", 400);
  if (!title) return fail("rejected", "title is required.", 400);

  const operator = "Arc";

  try {
    let campaignId = campaignIdIn;
    if (!campaignId) {
      const name = str(body.name);
      const persona = str(body.persona);
      const restorationFocus = str(body.restoration_focus);
      if (!name || !persona || !restorationFocus) {
        return fail(
          "rejected",
          "To create a new campaign, name, persona, and restoration_focus are required (or pass campaign_id to attach to an existing campaign).",
          400,
        );
      }
      const shell = await createCampaignShell({ operator, name, persona, restorationFocus, agentName: "Arc", tenant });
      campaignId = shell.campaignId;
    }

    const asset = await promoteAssetToCampaign({
      operator,
      campaignId,
      assetType,
      title,
      body: draftBody,
      mediaUrl,
      mediaPath,
      media,
      agentName: "Arc",
      tenant,
    });

    if (opportunityId) {
      // Link the source opportunity to this campaign and flip it to drafted.
      // Best-effort: the draft asset is already created, so a link hiccup must
      // not turn a successful 201 into a 502.
      await markOpportunityDrafted(opportunityId, campaignId, undefined, { orgId: allowed.scope.orgId }).catch(() => undefined);
    }

    if (conversationId) {
      await linkConversationToCampaign(conversationId, campaignId, str(body.name) || "Campaign workspace").catch(() => undefined);
    }

    return NextResponse.json(
      { ok: true, status: "created", campaignId, assetId: asset.assetId },
      { status: 201 },
    );
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to create campaign draft.", 502);
  }
}
