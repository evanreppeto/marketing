import { type SupabaseClient } from "@supabase/supabase-js";

import type { OpportunityCandidate } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type PersistResult = { ok: true; count: number } | { ok: false; error: string };
export type MutateResult = { ok: true } | { ok: false; error: string };
export type OpportunityScope = { orgId: string };

const NOT_CONFIGURED = "Supabase isn't configured, so opportunities can't be saved.";
const OPEN_STATUSES = ["pending", "drafting", "drafted"];

/**
 * Insert new opportunities, skipping any subject that already has an OPEN
 * opportunity of the same kind (app-level dedup; the partial unique index is the
 * DB safety net). Re-scans therefore don't flood the inbox.
 */
export async function upsertOpportunities(
  candidates: OpportunityCandidate[],
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  if (candidates.length === 0) return { ok: true, count: 0 };
  const orgId = await getCurrentOrgId();
  const kind = candidates[0].kind;

  const { data: open, error: readErr } = await client
    .from("opportunities")
    .select("subject_id")
    .eq("org_id", orgId)
    .eq("kind", kind)
    .in("status", OPEN_STATUSES);
  if (readErr) return { ok: false, error: readErr.message };

  const openIds = new Set((open ?? []).map((r: { subject_id: string }) => r.subject_id));
  const fresh = candidates.filter((c) => !openIds.has(c.subjectId));
  if (fresh.length === 0) return { ok: true, count: 0 };

  const rows = fresh.map((c) => ({
    org_id: orgId,
    kind: c.kind,
    subject_type: c.subjectType,
    subject_id: c.subjectId,
    title: c.title,
    summary: c.summary,
    confidence: c.confidence,
    urgency: c.urgency,
    evidence: c.evidence,
    recommended_action: c.recommendedAction,
    recommended_campaign_type: c.recommendedCampaignType,
    status: "pending",
    detected_by: "arc",
  }));
  const { error: insErr } = await client.from("opportunities").insert(rows);
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, count: rows.length };
}

async function setStatus(
  id: string,
  patch: Record<string, unknown>,
  client: SupabaseClient,
  scope?: OpportunityScope,
): Promise<MutateResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = scope?.orgId ?? await getCurrentOrgId();
  const { error } = await client.from("opportunities").update(patch).eq("org_id", orgId).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function dismissOpportunity(id: string, client: SupabaseClient = getSupabaseAdminClient(), scope?: OpportunityScope) {
  return setStatus(id, { status: "dismissed", dismissed_at: new Date().toISOString() }, client, scope);
}

export function snoozeOpportunity(id: string, untilIso: string, client: SupabaseClient = getSupabaseAdminClient(), scope?: OpportunityScope) {
  return setStatus(id, { status: "snoozed", snoozed_until: untilIso }, client, scope);
}

export function markOpportunityDrafting(id: string, agentTaskId: string, client: SupabaseClient = getSupabaseAdminClient(), scope?: OpportunityScope) {
  return setStatus(id, { status: "drafting", agent_task_id: agentTaskId }, client, scope);
}

export function markOpportunityDrafted(id: string, campaignId: string, client: SupabaseClient = getSupabaseAdminClient(), scope?: OpportunityScope) {
  return setStatus(id, { status: "drafted", campaign_id: campaignId }, client, scope);
}
