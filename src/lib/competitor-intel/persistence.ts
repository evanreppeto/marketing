import { type SupabaseClient } from "@supabase/supabase-js";

import { parseCompetitorIntelPayload } from "@/domain";
import { type AgentTaskTenantFields } from "../agent-tasks/scope";
import { getSupabaseAdminClient } from "../supabase/server";

export type CompetitorIntelResult = { competitorCampaignId: string; status: "needs_review"; runId: string };

export async function persistCompetitorIntel(
  input: unknown = {},
  client: SupabaseClient = getSupabaseAdminClient(),
  tenant?: AgentTaskTenantFields,
): Promise<CompetitorIntelResult> {
  const req = parseCompetitorIntelPayload(input);
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const agentId = await upsertArcAgent(client);

  const competitorCampaignId = await insertOne(client, "competitor_campaigns", {
    ...(tenant ? { org_id: tenant.org_id } : {}),
    source: req.source,
    competitor_name: req.competitorName,
    competitor_url: req.competitorUrl ?? null,
    persona: req.persona ?? null,
    status: "needs_review",
    captured_at: req.capturedAt ?? new Date().toISOString(),
    summary: req.summary,
    channel_mix: req.channelMix,
    est_spend: req.estSpend ?? null,
    top_keywords: req.topKeywords,
    ad_creatives: req.adCreatives,
    raw_payload: req.rawPayload,
    created_by_agent_id: agentId,
    run_id: runId,
  });

  return { competitorCampaignId, status: "needs_review", runId };
}

async function upsertArcAgent(client: SupabaseClient): Promise<string> {
  const { data, error } = await client
    .from("agents")
    .upsert({ key: "arc", name: "Arc Orchestrator", status: "ready" }, { onConflict: "key" })
    .select("id")
    .single<{ id: string }>();
  if (error) {
    throw new Error(`agents upsert failed: ${error.message}`);
  }
  return data.id;
}

async function insertOne(client: SupabaseClient, table: string, values: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(values).select("id").single<{ id: string }>();
  if (error) {
    throw new Error(`${table} insert failed: ${error.message}`);
  }
  return data.id;
}
