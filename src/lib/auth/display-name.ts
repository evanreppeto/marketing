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

/**
 * Profile photo URL for the current viewer, or null for initials. Prefers an
 * OAuth-provider avatar (user_metadata.avatar_url) then the uploaded
 * profiles.avatar_url. Unlike resolveViewerName there is NO owner fallback —
 * a viewer only ever sees their own photo, never someone else's. Memoized per
 * request so the layout + settings page share one lookup.
 */
export const getViewerAvatarUrl = cache(async (
  user: { id?: string; user_metadata?: { avatar_url?: string } } | null,
): Promise<string | null> => {
  if (!user) return null;
  const metaUrl = String(user.user_metadata?.avatar_url ?? "").trim();
  if (metaUrl.startsWith("http")) return metaUrl;
  if (!user.id) return null;
  try {
    const admin = getSupabaseAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle<{ avatar_url: string | null }>();
    const url = String(data?.avatar_url ?? "").trim();
    return url.startsWith("http") ? url : null;
  } catch {
    return null;
  }
});
