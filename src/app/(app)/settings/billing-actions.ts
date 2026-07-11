"use server";

import { revalidatePath } from "next/cache";

import { normalizePlanTier, planForTier } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { isWorkspaceAdminRole } from "@/lib/auth/workspace-roles";
import { setOrgPlan } from "@/lib/billing/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import type { SettingsWriteResult } from "./actions";

/**
 * Change the current org's billing plan. Owner/admin only (checked here AND by
 * org_plans RLS). Offline/demo returns success-but-unpersisted so the picker can
 * update optimistically without claiming a real write.
 */
export async function updateOrgPlanAction(input: { tier: string }): Promise<SettingsWriteResult> {
  await requireOperator();
  const tier = normalizePlanTier(input.tier);

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx?.orgId) return { ok: false, error: "No active org to update." };
  if (!isWorkspaceAdminRole(ctx.role ?? "")) {
    return { ok: false, error: "Only owners and admins can change the plan." };
  }

  try {
    await setOrgPlan({ orgId: ctx.orgId, tier });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the plan." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: `Plan set to ${planForTier(tier).label}.` };
}
