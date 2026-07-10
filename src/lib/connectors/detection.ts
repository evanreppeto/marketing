import { type SupabaseClient } from "@supabase/supabase-js";

import type { OpportunityCandidate } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { upsertOpportunities } from "@/lib/opportunities/persistence";

import "./builtin"; // ensure the built-in signal sources are registered
import { getConnectorConfig } from "./config";
import { meterConnectorCall } from "./metering";
import { listWorkspaceConnectors } from "./read-model";
import { getSignalSource } from "./registry";

// ---------------------------------------------------------------------------
// Signal-source detection orchestrator (BSR-363). For every ENABLED signal_source
// connector in a workspace, run its read-only detect() and feed the candidates
// into upsertOpportunities — the same inbox path runColdLeadDetection uses.
// Signal sources are read-only; the ONLY write here is to `opportunities`.
//
// Cost governance (BSR-372) is enforced CENTRALLY here, not per-connector: every
// metered signal source's detect() runs through meterConnectorCall, which checks
// the workspace spend cap first and refuses (no scan, no spend) when a run would
// breach it. free / byo_key sources bypass the guard untouched and record nothing.
// ---------------------------------------------------------------------------

/** Why a signal source was skipped this run (today: only a spend-cap breach). */
export type DetectionRefusal = { reason: "cap_exceeded"; message: string };

export type DetectionResult =
  | { ok: true; bySource: Record<string, number>; total: number; refused: Record<string, DetectionRefusal> }
  | { ok: false; error: string };

export async function runSignalSourceDetection(input: {
  workspaceId: string;
  orgId: string;
  client?: SupabaseClient;
  now?: string;
}): Promise<DetectionResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "not_configured" };
  const client = input.client ?? getSupabaseAdminClient();
  const now = input.now ?? new Date().toISOString();

  const views = await listWorkspaceConnectors(client, input.workspaceId);
  const enabled = views.filter((v) => v.kind === "signal_source" && v.status === "connected");

  const bySource: Record<string, number> = {};
  const refused: Record<string, DetectionRefusal> = {};
  let total = 0;
  for (const view of enabled) {
    const source = getSignalSource(view.key);
    if (!source) continue; // catalog entry with no registered behaviour — skip
    const config = await getConnectorConfig(client, input.workspaceId, view.key);

    // Price the scan up front (metered sources only; free sources bypass) and run
    // detect() through the cost guard. A cap breach refuses the scan entirely —
    // detect() never fires and no spend is recorded.
    const estimatedUnits = source.estimateUnits ? source.estimateUnits(config) : 1;
    const outcome = await meterConnectorCall<OpportunityCandidate[]>(
      client,
      {
        orgId: input.orgId,
        workspaceId: input.workspaceId,
        connectorKey: view.key,
        estimatedUnits,
        context: { source: "signal_source_detection" },
      },
      () => source.detect({ client, orgId: input.orgId, workspaceId: input.workspaceId, now, config }),
    );

    if (!outcome.ok) {
      refused[view.key] = { reason: outcome.refusal.reason, message: outcome.refusal.message };
      bySource[view.key] = 0;
      continue;
    }

    const res = await upsertOpportunities(outcome.result, client, { orgId: input.orgId });
    const count = res.ok ? res.count : 0;
    bySource[view.key] = count;
    total += count;
  }
  return { ok: true, bySource, total, refused };
}
