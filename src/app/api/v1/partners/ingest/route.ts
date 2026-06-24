import { arcGuard, fail, ok, readJson, INVALID_JSON } from "@/app/api/v1/arc/_lib/http";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { ingestPartners, ingestPayloadSchema } from "@/lib/partners/ingest";

/**
 * POST /api/v1/partners/ingest
 * Token-guarded one-way ingest of the Big Shoulders partner directory.
 * The bearer token resolves (server-side) to the caller's org/workspace, so
 * partner rows can only land in that tenant. Idempotent on
 * metadata.source_plumber_id — safe to call repeatedly.
 */
export async function POST(request: Request) {
  const guard = await arcGuard(request);
  if (!guard.ok) return guard.response;

  const body = await readJson(request);
  if (body === INVALID_JSON) {
    return fail("invalid_request", "Request body must be valid JSON.", 400);
  }

  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return fail("invalid_request", parsed.error.issues[0]?.message ?? "Invalid payload.", 400);
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { created, updated, errors } = await ingestPartners(
      supabase,
      { orgId: guard.scope.orgId, workspaceId: guard.scope.workspaceId },
      parsed.data.partners,
    );
    return ok({ created, updated, skipped: 0, errors });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Partner ingest failed.", 502);
  }
}
