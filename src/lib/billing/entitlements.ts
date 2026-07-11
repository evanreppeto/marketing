import { type SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_PLAN_TIER, normalizePlanTier, planCapCents, type PlanTier } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

// Per-org plan resolution + monthly-quota enforcement against the ai_usage_events
// ledger. The platform pays all provider API credits and bills tenants; a plan's
// monthly cap is what a tenant is allowed to spend before we block further work.
//
// Enforcement is DARK by default: `checkUsageAllowed` always computes the numbers,
// but only BLOCKS when ARC_BILLING_ENFORCEMENT=1 is set — so this ships inert and
// is armed deliberately (mirrors the ARC_SEND_ENABLED kill-switch posture), after
// real plans have been assigned.

export type OrgPlan = { tier: PlanTier; capCents: number };

export type UsageGate = {
  /** False only when enforcement is armed AND the org is at/over its cap. */
  allowed: boolean;
  /** Whether ARC_BILLING_ENFORCEMENT is armed (blocking) this deployment. */
  enforced: boolean;
  tier: PlanTier;
  usedCents: number;
  capCents: number;
  remainingCents: number;
  overCap: boolean;
};

/** Master kill-switch: quota blocking is inert unless explicitly armed. */
export function isBillingEnforcementEnabled(): boolean {
  return process.env.ARC_BILLING_ENFORCEMENT === "1";
}

const DEFAULT_PLAN: OrgPlan = { tier: DEFAULT_PLAN_TIER, capCents: planCapCents(DEFAULT_PLAN_TIER) };

/** The org's plan tier + effective monthly cap. Defaults to the free tier. */
export async function resolveOrgPlan(orgId: string, client?: SupabaseClient): Promise<OrgPlan> {
  if (!orgId || (!client && !isSupabaseAdminConfigured())) return DEFAULT_PLAN;
  try {
    const db = client ?? getSupabaseAdminClient();
    const { data, error } = await db
      .from("org_plans")
      .select("plan_tier,monthly_cap_cents")
      .eq("org_id", orgId)
      .maybeSingle<{ plan_tier: string; monthly_cap_cents: number | null }>();
    if (error || !data) return DEFAULT_PLAN;
    const tier = normalizePlanTier(data.plan_tier);
    return { tier, capCents: planCapCents(tier, data.monthly_cap_cents) };
  } catch {
    return DEFAULT_PLAN;
  }
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Sum of estimated provider cost (cents) charged to this org in the current UTC month. */
export async function getMonthToDateUsageCents(orgId: string, client?: SupabaseClient): Promise<number> {
  if (!orgId || (!client && !isSupabaseAdminConfigured())) return 0;
  try {
    const db = client ?? getSupabaseAdminClient();
    const start = startOfUtcMonth(new Date());
    const { data, error } = await db
      .from("ai_usage_events")
      .select("cost_estimate_cents")
      .eq("org_id", orgId)
      .gte("occurred_at", start.toISOString());
    if (error || !data) return 0;
    return (data as Array<{ cost_estimate_cents: number | null }>).reduce(
      (sum, row) => sum + (row.cost_estimate_cents ?? 0),
      0,
    );
  } catch {
    return 0;
  }
}

/**
 * Decide whether the org may incur more AI spend this month. `allowed` is true
 * whenever enforcement is disarmed, so callers can gate unconditionally on it.
 */
export async function checkUsageAllowed(orgId: string, client?: SupabaseClient): Promise<UsageGate> {
  const enforced = isBillingEnforcementEnabled();
  const [plan, usedCents] = await Promise.all([
    resolveOrgPlan(orgId, client),
    getMonthToDateUsageCents(orgId, client),
  ]);
  const overCap = usedCents >= plan.capCents;
  return {
    allowed: !enforced || !overCap,
    enforced,
    tier: plan.tier,
    usedCents,
    capCents: plan.capCents,
    remainingCents: Math.max(0, plan.capCents - usedCents),
    overCap,
  };
}

/** Human-facing dollar string for a cents amount (e.g. plan-limit messages). */
export function formatCentsUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}
