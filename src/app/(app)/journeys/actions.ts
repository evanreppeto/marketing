"use server";

import { revalidatePath } from "next/cache";

import { normalizeConsentMode } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { requireOperator } from "@/lib/auth/operator";
import { saveAppSettings } from "@/lib/settings/store";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type ConsentWriteResult = { ok: boolean; message?: string };

/**
 * Set the workspace's journey consent mode. Operator-gated: this changes what the
 * public collector will record for every visitor, so it's a real state transition,
 * not a preview. The mode is read back and enforced server-side at
 * POST /api/v1/journey/collect — the browser is never the gate.
 */
export async function setJourneyConsentMode(mode: string): Promise<ConsentWriteResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured, so the consent mode can't be saved here." };
  }
  try {
    const orgId = await getCurrentOrgId();
    await saveAppSettings(getSupabaseAdminClient(), orgId, { journey_consent_mode: normalizeConsentMode(mode) });
    revalidatePath("/journeys");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save the consent mode." };
  }
}
