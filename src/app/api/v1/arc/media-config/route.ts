import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { DEFAULT_MEDIA_CONFIG, resolveMediaDefaults } from "@/domain";
import { getWorkspaceMediaConfig } from "@/lib/media-config/read-model";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * The workspace's media generation config (Layer 2 model selection — which
 * Higgsfield model Arc defaults to per category, plus the generation toggles).
 * Bearer + workspace gated; the runner reads this to steer its Higgsfield calls.
 *   GET /api/v1/arc/media-config -> { ok, config: MediaConfig, defaults: ResolvedMediaDefaults }
 * `defaults` is the roster resolution done here (the runner can't import @/domain),
 * so the runner just injects it. Degrades to defaults when Supabase isn't configured.
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  if (!isSupabaseAdminConfigured()) {
    return ok({ config: DEFAULT_MEDIA_CONFIG, defaults: resolveMediaDefaults(DEFAULT_MEDIA_CONFIG) });
  }
  const { workspaceId } = allowed.scope;
  try {
    const config = await getWorkspaceMediaConfig(getSupabaseAdminClient(), workspaceId);
    return ok({ config, defaults: resolveMediaDefaults(config) });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to load media config.", 502);
  }
}
