import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { listArcFolders } from "@/lib/media-library/arc-handoff";

/**
 * The org's Library folders with available-to-Arc asset counts and descriptions,
 * so Arc understands what each folder is for and can file media correctly.
 * Read-only.
 *
 *   GET /api/v1/arc/folders  ->  { ok, folders: ArcFolderSummary[] }
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  try {
    const folders = await listArcFolders(allowed.scope.orgId);
    return ok({ folders });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list folders.", 502);
  }
}
