import "server-only";

import { getAuthMode } from "@/lib/auth/auth-mode";
import { getConfiguredOperatorCredentials } from "@/lib/auth/operator-shared";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type OperatorProfile = {
  avatarUrl: string | null;
  email: string | null;
  name: string;
};

function stringFromMetadata(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/**
 * The signed-in operator's display identity (name, email, avatar), resolved
 * across auth modes. Shared by the app chrome (rail profile) and the home
 * greeting so both always show the same person. Tenant-agnostic: the name comes
 * from the authenticated user / configured operator, never a hardcoded business.
 */
export async function getOperatorProfile(): Promise<OperatorProfile> {
  const configuredEmail = getConfiguredOperatorCredentials()?.email ?? null;
  const fallbackName = configuredEmail?.split("@")[0] || "Operator";

  if (getAuthMode() !== "supabase") {
    return { avatarUrl: null, email: configuredEmail, name: fallbackName };
  }

  const user = await getSupabaseAuthenticatedUser();
  if (!user) {
    return { avatarUrl: null, email: configuredEmail, name: fallbackName };
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metadataName = stringFromMetadata(metadata, ["full_name", "name", "display_name"]);
  const metadataAvatarUrl = stringFromMetadata(metadata, ["avatar_url", "picture", "photo_url"]);
  let profileName: string | null = null;
  let profileAvatarUrl: string | null = null;

  if (isSupabaseAdminConfigured()) {
    const { data } = await getSupabaseAdminClient()
      .from("profiles")
      .select("full_name,avatar_url")
      .eq("id", user.id)
      .maybeSingle<{ full_name: string | null; avatar_url: string | null }>();

    profileName = data?.full_name?.trim() || null;
    profileAvatarUrl = data?.avatar_url?.trim() || null;
  }

  const email = user.email?.trim().toLowerCase() || configuredEmail;

  return {
    avatarUrl: profileAvatarUrl ?? metadataAvatarUrl,
    email,
    name: profileName ?? metadataName ?? email?.split("@")[0] ?? fallbackName,
  };
}

/** First name for greetings — the leading token of the operator's display name. */
export function operatorFirstName(profile: OperatorProfile): string {
  return profile.name.split(/[\s._-]+/)[0] || profile.name;
}
