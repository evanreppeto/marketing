import { type SupabaseClient } from "@supabase/supabase-js";

import { getCurrentOrgId } from "@/lib/auth/org";
import { isDemoDataEnabled } from "@/lib/demo/demo-mode";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { resolveTenantReadHandle } from "@/lib/supabase/tenant-client";

import { buildDemoOpportunities } from "./demo";

type OpportunityEvidence = {
  persona?: string;
  daysCold?: number;
  leadScore?: number;
  lastActivityAt?: string;
  evidence_urls?: string[];
};

type OpportunityRecord = {
  id: string;
  subject_type: string;
  subject_id: string;
  title: string;
  summary: string;
  confidence: number;
  urgency: "low" | "medium" | "high";
  status: string;
  recommended_action: string;
  evidence?: OpportunityEvidence | null;
};

export type { OpportunityRecord, OpportunityEvidence };

/** Open opportunities (pending/drafting/drafted) for the inbox. Empty when unconfigured. */
export async function listOpenOpportunities(
  client?: SupabaseClient,
  orgId?: string,
): Promise<OpportunityRecord[]> {
  // Guard BEFORE touching the admin client — a default arg of
  // `getSupabaseAdminClient()` would throw during arg evaluation, before this
  // guard could run, crashing the page in demo/unconfigured mode.
  if (!client && !isSupabaseAdminConfigured()) {
    return isDemoDataEnabled() ? buildDemoOpportunities() : [];
  }
  const { client: db, orgId: handleOrgId } = client ? { client, orgId: null } : await resolveTenantReadHandle();
  const resolvedOrgId = orgId ?? handleOrgId ?? (await getCurrentOrgId());
  const { data, error } = await db
    .from("opportunities")
    .select("id, subject_type, subject_id, title, summary, confidence, urgency, status, recommended_action, evidence")
    .eq("org_id", resolvedOrgId)
    .in("status", ["pending", "drafting", "drafted"])
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as OpportunityRecord[];
}

/** Count of pending (un-triaged) opportunities, for the /arc chip. */
export async function countPendingOpportunities(client?: SupabaseClient): Promise<number> {
  if (!client && !isSupabaseAdminConfigured()) {
    return isDemoDataEnabled() ? buildDemoOpportunities().filter((o) => o.status === "pending").length : 0;
  }
  const { client: db, orgId } = client ? { client, orgId: await getCurrentOrgId() } : await resolveTenantReadHandle();
  const { count } = await db
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "pending");
  return count ?? 0;
}

export type OpportunityForDraft = {
  id: string;
  subjectId: string;
  title: string;
  summary: string;
  urgency: "low" | "medium" | "high";
  confidence: number;
  recommendedAction: string;
  persona: string;
};

/** Load one opportunity (+ its persona from evidence) for the Draft-with-Arc flow. */
export async function getOpportunityForDraft(
  id: string,
  client?: SupabaseClient,
): Promise<OpportunityForDraft | null> {
  if (!client && !isSupabaseAdminConfigured()) {
    if (!isDemoDataEnabled()) return null;
    const match = buildDemoOpportunities().find((o) => o.id === id);
    if (!match) return null;
    const persona = typeof match.evidence?.persona === "string" ? match.evidence.persona : "";
    return {
      id: match.id,
      subjectId: match.subject_id,
      title: match.title,
      summary: match.summary,
      urgency: match.urgency,
      confidence: match.confidence,
      recommendedAction: match.recommended_action,
      persona,
    };
  }
  const { client: db, orgId } = client ? { client, orgId: await getCurrentOrgId() } : await resolveTenantReadHandle();
  const { data, error } = await db
    .from("opportunities")
    .select("id, subject_id, title, summary, urgency, confidence, recommended_action, evidence")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const evidence = (data.evidence ?? {}) as { persona?: string };
  return {
    id: data.id,
    subjectId: data.subject_id,
    title: data.title,
    summary: data.summary,
    urgency: data.urgency,
    confidence: data.confidence,
    recommendedAction: data.recommended_action,
    persona: typeof evidence.persona === "string" ? evidence.persona : "",
  };
}
