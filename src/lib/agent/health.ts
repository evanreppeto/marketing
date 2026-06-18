import { type SupabaseClient } from "@supabase/supabase-js";

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { type AgentConnectionStatus, DEFAULT_WORKSPACE_ID } from "./connection";

async function scopedConnectionUpdate(client: SupabaseClient, patch: Record<string, unknown>, explicitClient: boolean) {
  const context = explicitClient ? null : await getCurrentWorkspaceContext().catch(() => null);
  const workspaceId = context?.workspaceKey ?? DEFAULT_WORKSPACE_ID;
  let query = client.from("agent_connections").update(patch).eq("workspace_id", workspaceId);
  if (context?.orgId) query = query.eq("org_id", context.orgId);
  const { error } = await query;
  if (error && context?.orgId) {
    await client.from("agent_connections").update(patch).eq("workspace_id", workspaceId);
  }
}

export async function recordAgentSeen(client?: SupabaseClient): Promise<void> {
  const supabase: SupabaseClient | null = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return;

  try {
    await scopedConnectionUpdate(
      supabase,
      { last_seen_at: new Date().toISOString(), last_status: "ok", last_error: null },
      Boolean(client),
    );
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
    await scopedConnectionUpdate(supabase, patch, Boolean(client));
  } catch {
    // Best-effort telemetry only.
  }
}
