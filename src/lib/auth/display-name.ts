import { cache } from "react";

import { getSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Full display name for the current viewer. Prefers the signed-in user's name;
 * in open/demo mode (no session) it falls back to the workspace owner's name so
 * the shell and greeting show a real person instead of a bare "there".
 *
 * Memoized per request with `cache()`: the layout and home page both resolve the
 * viewer name from the same (cached) user + orgId, so the owner lookups run once
 * per navigation instead of twice.
 */
export const resolveViewerName = cache(async (
  orgId: string,
  user: { user_metadata?: { full_name?: string } } | null,
): Promise<string> => {
  const metaName = String(user?.user_metadata?.full_name ?? "").trim();
  if (metaName) return metaName;
  try {
    const admin = getSupabaseAdminClient();
    const { data: member } = await admin
      .from("workspace_memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ user_id: string }>();
    if (member?.user_id) {
      const { data: prof } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", member.user_id)
        .maybeSingle<{ full_name: string | null }>();
      return String(prof?.full_name ?? "").trim();
    }
  } catch {
    // fall through to the empty default
  }
  return "";
});
