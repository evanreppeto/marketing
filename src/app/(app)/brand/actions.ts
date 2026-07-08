"use server";

import { revalidatePath } from "next/cache";

import { NEUTRAL_DEFAULTS } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Edit the brand identity (name, tagline, website, voice guidance) and persist
 * it to the org's business_profiles row. Internal config — nothing outbound.
 * Fetch-merge-upsert so we only touch the identity fields and leave palette,
 * services, guardrails, etc. intact. `persisted: false` is the honest offline
 * signal so the UI can reflect the edit without claiming it saved.
 */
export type BrandIdentityInput = {
  displayName: string;
  tagline: string;
  websiteUrl: string;
  voiceGuidance: string;
};

export type BrandSaveResult = { ok: true; persisted: boolean } | { ok: false; error: string };

export async function updateBrandIdentity(input: BrandIdentityInput): Promise<BrandSaveResult> {
  await requireOperator();

  const displayName = input.displayName?.trim();
  if (!displayName) return { ok: false, error: "A brand name is required." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  try {
    const current = (await getBusinessProfile(ctx.orgId)) ?? NEUTRAL_DEFAULTS;
    await upsertBusinessProfile(ctx.orgId, {
      ...current,
      displayName,
      tagline: input.tagline?.trim() || null,
      websiteUrl: input.websiteUrl?.trim() || null,
      voiceGuidance: input.voiceGuidance?.trim() || null,
    });
    revalidatePath("/brand");
    return { ok: true, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save brand changes." };
  }
}
