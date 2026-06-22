import { type SupabaseClient } from "@supabase/supabase-js";

import {
  PRICING_VERSION,
  estimateClaudeCostCents,
  estimateMediaCostCents,
  isPricedModel,
  type AiUsageService,
} from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type RecordUsageInput = {
  orgId: string;
  workspaceId: string;
  service: AiUsageService;
  model: string;
  actorUser?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  units?: number | null;
  taskId?: string | null;
  campaignId?: string | null;
  metadata?: Record<string, unknown>;
};

export type RecordUsageResult =
  | { recorded: true; id: string; costCents: number }
  | { recorded: false; reason: "not_configured" | "error" };

/** Compute the estimated cost (cents) for a usage event from the pricing module. */
function costForInput(input: RecordUsageInput): number {
  if (input.service === "arc_claude") {
    return estimateClaudeCostCents(input.model, input.inputTokens, input.outputTokens);
  }
  return estimateMediaCostCents(input.service, input.units);
}

/**
 * Record one AI usage event into the `ai_usage_events` ledger. Best-effort:
 * returns a result object and never throws, so a ledger failure can't break an
 * Arc reply or a media generation. No-ops cleanly when Supabase is unconfigured.
 */
export async function recordUsageEvent(input: RecordUsageInput): Promise<RecordUsageResult> {
  if (!isSupabaseAdminConfigured()) {
    return { recorded: false, reason: "not_configured" };
  }

  const costCents = costForInput(input);
  // `ai_usage_events` isn't in the generated Database types yet, so use the
  // established untyped-client cast (see src/lib/personas/persistence.ts).
  const db = getSupabaseAdminClient() as unknown as SupabaseClient;

  try {
    const { data, error } = await db
      .from("ai_usage_events")
      .insert({
        org_id: input.orgId,
        workspace_id: input.workspaceId,
        actor_user: input.actorUser ?? null,
        service: input.service,
        model: input.model,
        input_tokens: input.inputTokens ?? null,
        output_tokens: input.outputTokens ?? null,
        units: input.units ?? null,
        cost_estimate_cents: costCents,
        task_id: input.taskId ?? null,
        campaign_id: input.campaignId ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          pricing_version: PRICING_VERSION,
          priced_model: isPricedModel(input.model),
        },
      })
      .select("id")
      .single();

    if (error || !data) {
      console.warn(`[ai-usage] recordUsageEvent insert failed: ${error?.message ?? "no row returned"}`);
      return { recorded: false, reason: "error" };
    }
    return { recorded: true, id: (data as { id: string }).id, costCents };
  } catch (err) {
    console.warn(`[ai-usage] recordUsageEvent threw: ${err instanceof Error ? err.message : String(err)}`);
    return { recorded: false, reason: "error" };
  }
}
