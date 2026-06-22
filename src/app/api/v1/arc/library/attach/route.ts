import { NextResponse } from "next/server";

import { INVALID_JSON, arcGuard, fail, readJson } from "@/app/api/v1/arc/_lib/http";
import { createCampaignShell, promoteAssetToCampaign } from "@/lib/campaigns/create";
import { resolveAvailableArcMediaAsset } from "@/lib/media-library/arc-handoff";

/**
 * Attach a REAL Library asset (available_to_arc) to a campaign as an
 * approval-gated draft asset — the approval-safe path for reusing authentic BSR
 * media. The asset is resolved + validated server-side (org-scoped, must be
 * available_to_arc), so Arc can never attach an arbitrary URL or a private file.
 * Author is always "Arc"; the asset stays pending_approval + dispatch_locked.
 *
 *   POST /api/v1/arc/library/attach
 *   { library_asset_id, title, asset_type?,
 *     campaign_id? | (name + persona + restoration_focus) }
 *   -> 201 { ok, status:"created", campaignId, assetId, media }
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

  const libraryAssetId = str(body.library_asset_id);
  const title = str(body.title);
  const assetType = str(body.asset_type) || "social_ad";
  if (!libraryAssetId) return fail("rejected", "library_asset_id is required.", 400);
  if (!title) return fail("rejected", "title is required.", 400);

  try {
    const asset = await resolveAvailableArcMediaAsset(allowed.scope.orgId, libraryAssetId);
    if (!asset) return fail("not_found", "No library asset with that id is available to Arc.", 404);

    let campaignId = str(body.campaign_id);
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
      const shell = await createCampaignShell({ operator: "Arc", name, persona, restorationFocus, agentName: "Arc", tenant });
      campaignId = shell.campaignId;
    }

    const promoted = await promoteAssetToCampaign({
      operator: "Arc",
      campaignId,
      assetType,
      title,
      body: null,
      mediaUrl: asset.public_url,
      mediaPath: asset.storage_path,
      media: { source: "bsr_real", libraryAssetId, riskFlags: asset.risk_flags },
      agentName: "Arc",
      tenant,
    });

    const media = {
      kind: asset.kind === "video" ? "video" : "image",
      url: asset.public_url,
      source: "bsr_real",
      sourceId: libraryAssetId,
      status: "draft",
      ...(asset.risk_flags.length ? { riskFlags: asset.risk_flags } : {}),
    };

    return NextResponse.json({ ok: true, status: "created", campaignId, assetId: promoted.assetId, media }, { status: 201 });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to attach library media.", 502);
  }
}
