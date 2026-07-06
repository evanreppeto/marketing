import { type SupabaseClient } from "@supabase/supabase-js";

import { getAuthMode } from "@/lib/auth/auth-mode";
import { getCurrentOrgId } from "@/lib/auth/org";

import { createSupabaseAuthServerClient } from "./auth-server";
import { getSupabaseAdminClient } from "./server";

/**
 * A resolved handle for reading org-scoped data.
 *
 * The app historically ran every query through the service-role admin client,
 * which BYPASSES row-level security — so tenant isolation lived entirely in
 * application code (every read had to remember `.eq("org_id", …)`). This handle
 * moves the enforcement into the database for signed-in users:
 *
 * - `supabase` auth mode with a live session → `client` is the user's session
 *   client (anon key + JWT). RLS enforces `is_org_member(org_id)` on every row,
 *   so a forgotten filter can no longer leak another tenant's data. `orgId` is
 *   still returned so callers pin to the *active* workspace (a user may belong
 *   to several orgs; RLS permits all of them, the filter narrows to one).
 * - open / operator mode, or no request scope / no session → `client` is the
 *   admin client and `orgId` is the current org. Behavior is unchanged from
 *   before: RLS is not in play, the explicit filter is the only scoping. This
 *   keeps local dev (open mode) and the single-operator deployment working.
 *
 * Callers pass `{ client, orgId }` straight into the existing read helpers,
 * which already apply `orgId` only when it is set.
 */
export type TenantReadHandle = {
  // Plain `SupabaseClient` (not `SupabaseClient<Database>`) to match the read-model
  // helpers this feeds, and so the `client ? { client } : handle` idiom at call
  // sites collapses to a single client type instead of an uncallable union.
  client: SupabaseClient;
  orgId: string;
};

/**
 * Resolve the correct client + active org for the current request. See
 * {@link TenantReadHandle}. Never throws for auth reasons — if the session
 * client can't be built (e.g. called outside a request scope, during static
 * rendering, or Supabase Auth is misconfigured) it degrades to the admin
 * client, which is still tenant-safe because `orgId` is always applied.
 *
 * `getCurrentOrgId()` may still throw `OrgUnavailableError` when there is no
 * resolvable workspace; callers already handle that (the CRM read-model wraps
 * these reads and falls back to its unavailable/demo state).
 */
export async function resolveTenantReadHandle(): Promise<TenantReadHandle> {
  const orgId = await getCurrentOrgId();

  if (getAuthMode() === "supabase") {
    try {
      const supabase = await createSupabaseAuthServerClient();
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) {
        // User-scoped client: RLS enforces org membership; the explicit orgId
        // narrows to the active workspace.
        return { client: supabase, orgId };
      }
    } catch {
      // No cookies / request scope, or an auth failure. Fall through to the
      // admin client — still isolated by the explicit orgId filter below.
    }
  }

  return { client: getSupabaseAdminClient(), orgId };
}
