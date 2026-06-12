import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { type AgentConnectionStatus, DEFAULT_WORKSPACE_ID } from "./connection";

export async function recordAgentSeen(client?: SupabaseClient): Promise<void> {
  const supabase: SupabaseClient | null = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return;

  try {
    await supabase
      .from("agent_connections")
      .update({ last_seen_at: new Date().toISOString(), last_status: "ok", last_error: null })
      .eq("workspace_id", DEFAULT_WORKSPACE_ID);
  } catch {
    // Best-effort telemetry only.
  }
}

export async function recordTestResult(
  result: { status: AgentConnectionStatus; error?: string | null },
  client?: SupabaseClient,
): Promise<void> {
  const supabase: SupabaseClient | null = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return;

  try {
    const patch: Record<string, unknown> = {
      last_status: result.status,
      last_error: result.error ?? null,
    };
    if (result.status === "ok") patch.last_seen_at = new Date().toISOString();
    await supabase.from("agent_connections").update(patch).eq("workspace_id", DEFAULT_WORKSPACE_ID);
  } catch {
    // Best-effort telemetry only.
  }
}
