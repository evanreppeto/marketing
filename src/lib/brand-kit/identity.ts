import { cache } from "react";

import { getBusinessProfile } from "@/lib/brand-kit/persistence";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type BrandIdentity = {
  displayName?: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  shortMark?: string | null;
};

/** Per-org brand identity for render (cached per request). Empty on no-Supabase/error. */
export const resolveBrandIdentity = cache(async (): Promise<BrandIdentity> => {
  if (!isSupabaseAdminConfigured()) return {};
  try {
    const profile = await getBusinessProfile(await getCurrentOrgId());
    if (!profile) return {};
    return {
      displayName: profile.displayName || undefined,
      logoUrl: profile.logoUrl,
      faviconUrl: profile.faviconUrl,
      shortMark: profile.shortMark,
    };
  } catch {
    // Supabase down / no org — fall back to app_settings values.
    return {};
  }
});
