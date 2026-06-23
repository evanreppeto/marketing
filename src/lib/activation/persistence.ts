import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

const TABLE = "org_onboarding_state";

// org_onboarding_state is not in the generated database.types yet; query it through
// an untyped client (same pattern as ai-usage).
async function upsertOnboarding(orgId: string, patch: Record<string, unknown>): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const db = getSupabaseAdminClient() as unknown as SupabaseClient;
  const now = new Date().toISOString();
  const { error } = await db
    .from(TABLE)
    .upsert({ org_id: orgId, updated_at: now, ...patch }, { onConflict: "org_id" });
  if (error) throw new Error(`Failed to update onboarding state: ${error.message}`);
}

/** Record that the owner captured their brand during first-run setup. */
export async function markBrandCaptured(orgId: string): Promise<void> {
  await upsertOnboarding(orgId, { brand_captured_at: new Date().toISOString() });
}

/** Record that the owner dismissed the home "finish setting up" checklist. */
export async function dismissActivation(orgId: string): Promise<void> {
  await upsertOnboarding(orgId, { dismissed_at: new Date().toISOString() });
}
