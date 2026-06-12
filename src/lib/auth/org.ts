import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Current-organization resolution — the single chokepoint for tenant isolation.
 *
 * The app talks to Supabase with the service-role client, which BYPASSES RLS, so
 * isolation is enforced here in the app layer: every interaction-layer query is
 * scoped by the org id this returns. Today it resolves the single seeded org
 * (BSR). When real multi-tenant auth lands, swap the body for session/subdomain
 * resolution — call sites do not change.
 */
export const DEFAULT_ORG_SLUG = process.env.DEFAULT_ORG_SLUG ?? "big-shoulders-restoration";

let cachedOrgId: string | null = null;

export class OrgUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgUnavailableError";
  }
}

export async function getCurrentOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  if (!isSupabaseAdminConfigured()) {
    throw new OrgUnavailableError("Supabase is not configured, so no organization is available.");
  }
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", DEFAULT_ORG_SLUG)
    .maybeSingle<{ id: string }>();
  if (error) throw new OrgUnavailableError(error.message);
  if (!data) throw new OrgUnavailableError(`No organization found for slug "${DEFAULT_ORG_SLUG}".`);
  cachedOrgId = data.id;
  return cachedOrgId;
}

/** Test-only: reset the memoized org id between cases. */
export function __resetOrgCache() {
  cachedOrgId = null;
}
