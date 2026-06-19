import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
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
