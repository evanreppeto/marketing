import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { upsertOpportunities } from "@/lib/opportunities/persistence";

import "./builtin"; // ensure the built-in signal sources are registered
import { getConnectorConfig } from "./config";
import { listWorkspaceConnectors } from "./read-model";
import { getSignalSource } from "./registry";

// ---------------------------------------------------------------------------
// Signal-source detection orchestrator (BSR-363). For every ENABLED signal_source
// connector in a workspace, run its read-only detect() and feed the candidates
// into upsertOpportunities — the same inbox path runColdLeadDetection uses.
// Signal sources are read-only; the ONLY write here is to `opportunities`.
// ---------------------------------------------------------------------------

export type DetectionResult =
  | { ok: true; bySource: Record<string, number>; total: number }
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
  let total = 0;
  for (const view of enabled) {
    const source = getSignalSource(view.key);
    if (!source) continue; // catalog entry with no registered behaviour — skip
    const config = await getConnectorConfig(client, input.workspaceId, view.key);
    const candidates = await source.detect({
      client,
      orgId: input.orgId,
      workspaceId: input.workspaceId,
      now,
      config,
    });
    const res = await upsertOpportunities(candidates, client, { orgId: input.orgId });
    const count = res.ok ? res.count : 0;
    bySource[view.key] = count;
    total += count;
  }
  return { ok: true, bySource, total };
}
