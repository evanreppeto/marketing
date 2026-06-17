"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { NEUTRAL_DEFAULTS, validateBusinessProfile, type BusinessProfile } from "@/domain";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";
import { buildBusinessProfileFromForm } from "@/lib/brand-kit/form";

export type BrandKitActionState = { ok: boolean; message: string } | null;

const NOT_CONFIGURED: BrandKitActionState = {
  ok: false,
  message: "Supabase isn't configured, so the Brand Kit can't be saved.",
};

async function loadCurrent(orgId: string): Promise<BusinessProfile> {
  const existing = await getBusinessProfile(orgId);
  return existing ?? NEUTRAL_DEFAULTS;
}

export async function saveBrandKitAction(
  _previous: BrandKitActionState,
  formData: FormData,
): Promise<BrandKitActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const orgId = await getCurrentOrgId();
  const current = await loadCurrent(orgId);
  const profile = buildBusinessProfileFromForm(formData, current);

  const validation = validateBusinessProfile(profile);
  if (!validation.ok) {
    return { ok: false, message: `Please fix: ${validation.errors.join(", ")}.` };
  }

  try {
    await upsertBusinessProfile(orgId, profile);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save the Brand Kit." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/arc");
  return { ok: true, message: "Brand Kit saved." };
}
