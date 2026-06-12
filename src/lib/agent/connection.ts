import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type AgentConnectionRow = {
  workspace_id: string;
  display_name: string | null;
  agent_key: string | null;
  webhook_url: string | null;
  webhook_secret_ref: string | null;
  enabled: boolean;
  last_seen_at: string | null;
  last_status: "ok" | "error" | "unreachable" | null;
  last_error: string | null;
};

export type FieldSource = "env" | "db" | "default";

export type EffectiveAgentConnection = {
  workspaceId: string;
  displayName: string;
  agentKey: string;
  webhookUrl: string | null;
  /** Vault ref for the signing secret; resolved separately in secret.ts. */
  webhookSecretRef: string | null;
  enabled: boolean;
  health: { lastSeenAt: string | null; lastStatus: "ok" | "error" | "unreachable" | null; lastError: string | null };
  source: { displayName: FieldSource; agentKey: FieldSource; webhookUrl: FieldSource; enabled: FieldSource };
};

export const DEFAULT_WORKSPACE_ID = "default";
export const DEFAULT_CONNECTION = { displayName: "Mark", agentKey: "mark" };

type EnvLike = Record<string, string | undefined>;

/** Pure precedence: env ?? db ?? default, with a source marker per field. */
export function mergeConnection(env: EnvLike, row: AgentConnectionRow | null): EffectiveAgentConnection {
  const envWebhook = env.MARK_RUNNER_URL ?? env.MARK_WEBHOOK_URL ?? undefined;
  // Precedence: a present, non-empty env value wins; else the db value; else the default.
  // The `!== ""` guard treats blank string env vars as absent. Boolean `false` passes it
  // (false !== ""), so `false` IS a valid env override for boolean fields — intentional.
  const pick = <T>(envVal: T | undefined, dbVal: T | null | undefined, def: T): [T, FieldSource] =>
    envVal != null && envVal !== "" ? [envVal, "env"] : dbVal != null ? [dbVal as T, "db"] : [def, "default"];

  const [displayName, dnSrc] = pick(env.MARK_DISPLAY_NAME?.trim() || undefined, row?.display_name, DEFAULT_CONNECTION.displayName);
  const [agentKey, akSrc] = pick(env.MARK_AGENT_KEY?.trim() || undefined, row?.agent_key, DEFAULT_CONNECTION.agentKey);
  const [webhookUrl, urlSrc] = pick<string | null>(envWebhook, row?.webhook_url ?? null, null);
  // enabled: env presence of MARK_WEBHOOK_DISABLED=1 forces off; else db; else default true.
  const envDisabled = env.MARK_WEBHOOK_DISABLED === "1" ? false : undefined;
  const [enabled, enSrc] = pick<boolean>(envDisabled, row?.enabled, true);

  return {
    workspaceId: row?.workspace_id ?? DEFAULT_WORKSPACE_ID,
    displayName,
    agentKey,
    webhookUrl,
    webhookSecretRef: row?.webhook_secret_ref ?? null,
    enabled,
    health: { lastSeenAt: row?.last_seen_at ?? null, lastStatus: row?.last_status ?? null, lastError: row?.last_error ?? null },
    source: { displayName: dnSrc, agentKey: akSrc, webhookUrl: urlSrc, enabled: enSrc },
  };
}

/** Fetch the singleton row (or null) and merge with env. Never throws. */
export async function resolveAgentConnection(client?: SupabaseClient): Promise<EffectiveAgentConnection> {
  const supabase = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return mergeConnection(process.env, null);
  try {
    const { data } = await supabase
      .from("agent_connections")
      .select("*")
      .eq("workspace_id", DEFAULT_WORKSPACE_ID)
      .maybeSingle<AgentConnectionRow>();
    return mergeConnection(process.env, data ?? null);
  } catch (error) {
    // Never throw — connection resolution feeds health/status and the send path.
    // Surface the failure for ops (matches getAppSettings' degrade-and-warn posture).
    console.warn(`agent_connections lookup failed, using env/defaults: ${error instanceof Error ? error.message : String(error)}`);
    return mergeConnection(process.env, null);
  }
}
