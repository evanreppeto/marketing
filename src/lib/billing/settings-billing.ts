import { DEFAULT_PLAN_TIER, PLAN_TIERS, planForTier, type PlanTier } from "@/domain";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { isWorkspaceAdminRole } from "@/lib/auth/workspace-roles";
import { isDemoDataEnabled } from "@/lib/demo/demo-mode";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { resolveOrgPlan } from "./entitlements";

// Read-model for the Settings → Usage & billing plan control. Surfaces the org's
// current plan + the selectable tiers, and whether the viewer may change it
// (owner/admin only). No secrets; display + gating metadata.

const USD0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export type BillingPlanOption = { tier: PlanTier; label: string; capLabel: string };

export type SettingsBillingView = {
  /** True when backed by real org data (vs. offline/default display). */
  configured: boolean;
  /** Whether the current viewer (owner/admin) may change the plan. */
  canManage: boolean;
  tier: PlanTier;
  planLabel: string;
  capLabel: string;
  options: BillingPlanOption[];
};

function planOptions(): BillingPlanOption[] {
  return PLAN_TIERS.map((tier) => {
    const plan = planForTier(tier);
    return { tier, label: plan.label, capLabel: `${USD0.format(plan.monthlyCapCents / 100)}/mo` };
  });
}

function viewForTier(tier: PlanTier, configured: boolean, canManage: boolean): SettingsBillingView {
  const plan = planForTier(tier);
  return {
    configured,
    canManage,
    tier,
    planLabel: plan.label,
    capLabel: `${USD0.format(plan.monthlyCapCents / 100)}/mo`,
    options: planOptions(),
  };
}

export async function getSettingsBillingView(): Promise<SettingsBillingView> {
  if (!isSupabaseAdminConfigured()) {
    // Offline preview: coherent with the demo usage card (Starter), interactive so
    // the picker can be tried; a real write no-ops (persisted:false).
    return isDemoDataEnabled()
      ? viewForTier("starter", false, true)
      : viewForTier(DEFAULT_PLAN_TIER, false, false);
  }
  try {
    const ctx = await getCurrentWorkspaceContext();
    if (!ctx.orgId) return viewForTier(DEFAULT_PLAN_TIER, false, false);
    const plan = await resolveOrgPlan(ctx.orgId);
    return {
      configured: true,
      canManage: isWorkspaceAdminRole(ctx.role ?? ""),
      tier: plan.tier,
      planLabel: planForTier(plan.tier).label,
      capLabel: `${USD0.format(plan.capCents / 100)}/mo`,
      options: planOptions(),
    };
  } catch {
    return viewForTier(DEFAULT_PLAN_TIER, false, false);
  }
}
