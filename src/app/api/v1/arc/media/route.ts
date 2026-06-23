import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { arcCreateFolder, arcFileAsset } from "@/lib/arc-api/media";
import { listAvailableArcMedia } from "@/lib/media-library/arc-handoff";

/**
 * The org's Library media that the operator has marked available_to_arc, so Arc
 * can reuse authentic approved BSR media instead of always generating new AI
 * images. Read-only.
 *
 *   GET /api/v1/arc/media?kind=image&limit=50  ->  { ok, media: ArcMediaSummary[] }
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind")?.trim() || undefined;
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
  try {
    const media = await listAvailableArcMedia(allowed.scope.orgId, { kind, limit });
    return ok({ media });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list media.", 502);
  }
}

/**
 * Arc organizes the Library: create a folder, or file an existing asset into a
 * folder. Direct, org-scoped writes — nothing leaves the workspace, and
 * cross-org ids are rejected in the lib layer.
 *
 *   POST /api/v1/arc/media
 *   { "action": "create_folder", "name": "Proof photos", "parent_id"?: "<id>" }
 *   { "action": "file_asset", "asset_id": "<id>", "folder_id": "<id>" | null }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }

  const payload = body as Record<string, unknown>;
  const deps = { orgId: allowed.scope.orgId };

  try {
    if (payload.action === "create_folder") {
      const result = await arcCreateFolder(payload, deps);
      if (!result.ok) return fail("invalid_request", result.error, 400);
      return ok({ action: "create_folder", folder_id: result.id }, 201);
    }

    if (payload.action === "file_asset") {
      const result = await arcFileAsset(payload, deps);
      if (!result.ok) return fail("invalid_request", result.error, 400);
      return ok({ action: "file_asset", asset_id: result.id }, 200);
    }

    return fail("invalid_request", 'action must be "create_folder" or "file_asset".', 400);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to update the media library.", 502);
  }
}
