import { type SupabaseClient } from "@supabase/supabase-js";

import { normalizePlanTier, type PlanTier } from "@/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

// Write side for org plans. Kept thin and admin-gated at the call site; the DB
// also enforces org-admin via RLS (org_plans_admin_write). No secrets.

/**
 * Assign (or update) an org's plan. `monthlyCapCentsOverride` is an optional
 * negotiated cap that overrides the tier default; pass null to clear it.
 */
export async function setOrgPlan(
  input: { orgId: string; tier: PlanTier; monthlyCapCentsOverride?: number | null },
  client?: SupabaseClient,
): Promise<void> {
  const db = client ?? getSupabaseAdminClient();
  const tier = normalizePlanTier(input.tier);
  const override =
    typeof input.monthlyCapCentsOverride === "number" && input.monthlyCapCentsOverride > 0
      ? input.monthlyCapCentsOverride
      : null;

  const { error } = await db
    .from("org_plans")
    .upsert(
      { org_id: input.orgId, plan_tier: tier, monthly_cap_cents: override, updated_at: new Date().toISOString() },
      { onConflict: "org_id" },
    );
  if (error) throw new Error(`org_plans upsert: ${error.message}`);
}
