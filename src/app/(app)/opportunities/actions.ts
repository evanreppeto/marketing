"use server";

import { revalidatePath } from "next/cache";

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { runColdLeadDetection } from "@/lib/opportunities/detector";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Operator-triggered opportunity scan: runs the deterministic cold-lead detector
 * over the current workspace's CRM and persists any new source-backed
 * opportunities, then refreshes the inbox. Org-scoped through the authenticated
 * request context (detector → listLeads() applies the org filter). Read-only
 * detection — nothing outbound, nothing drafted.
 */
export async function scanForOpportunitiesAction(): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  // Ensures the caller is authenticated + establishes the org scope the detector reads.
  await getCurrentWorkspaceContext();
  await runColdLeadDetection().catch(() => {
    // Detection is best-effort; a failure just leaves the inbox unchanged.
  });
  revalidatePath("/opportunities");
}
