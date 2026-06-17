import { type SupabaseClient } from "@supabase/supabase-js";

import { detectColdLeadOpportunities, type ColdLeadInput } from "@/domain";
import { listLeads } from "@/lib/repos/leads";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { upsertOpportunities, type PersistResult } from "./persistence";

// Non-terminal campaign_status values (everything except 'archived'/'blocked') —
// a lead with one of these is already being worked, so skip it.
const ACTIVE_CAMPAIGN_STATUSES = ["draft", "briefing", "generating", "pending_approval", "approved", "active", "paused"];

/**
 * Run cold-lead detection over current CRM data and persist new opportunities.
 * Recency = the lead's latest `events` row, falling back to its received_at.
 */
export async function runColdLeadDetection(
  client: SupabaseClient = getSupabaseAdminClient(),
  now: string = new Date().toISOString(),
): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "not_configured" };

  // Org-scope at the source: listLeads() (no client) applies the org filter, so the
  // lead ids — and the events/campaigns queries bounded by them — stay org-scoped.
  const leads = await listLeads({ limit: 500 });
  if (leads.length === 0) return { ok: true, count: 0 };
  const leadIds = leads.map((l) => l.id);

  // Latest activity per lead from the events log (one query, newest first).
  const { data: events } = await client
    .from("events")
    .select("subject_id, occurred_at")
    .eq("subject_type", "lead")
    .in("subject_id", leadIds)
    .order("occurred_at", { ascending: false });
  const latestActivity = new Map<string, string>();
  for (const e of (events ?? []) as Array<{ subject_id: string; occurred_at: string }>) {
    if (!latestActivity.has(e.subject_id)) latestActivity.set(e.subject_id, e.occurred_at);
  }

  // Leads that already have a non-terminal campaign.
  const { data: camps } = await client
    .from("campaigns")
    .select("lead_id, status")
    .in("lead_id", leadIds)
    .in("status", ACTIVE_CAMPAIGN_STATUSES);
  const leadsWithCampaign = new Set((camps ?? []).map((c: { lead_id: string }) => c.lead_id).filter(Boolean));

  const inputs: ColdLeadInput[] = leads.map((l) => ({
    id: l.id,
    label: l.lossSummary?.slice(0, 60) || `Lead ${l.id.slice(0, 8)}`,
    persona: l.persona,
    leadScore: l.leadScore,
    status: l.status,
    lastActivityAt: latestActivity.get(l.id) ?? l.receivedAt,
    hasActiveCampaign: leadsWithCampaign.has(l.id),
  }));

  const candidates = detectColdLeadOpportunities(inputs, { now });
  return upsertOpportunities(candidates, client);
}
