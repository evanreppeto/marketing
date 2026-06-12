import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type AgentConnectionStatus = "ok" | "error" | "unreachable";
export type FieldSource = "env" | "db" | "default";

export type AgentConnectionRow = {
  workspace_id: string;
  display_name: string | null;
  agent_key: string | null;
  webhook_url: string | null;
  webhook_secret_ref: string | null;
  enabled: boolean;
  last_seen_at: string | null;
  last_status: AgentConnectionStatus | null;
  last_error: string | null;
};

export type EffectiveAgentConnection = {
  workspaceId: string;
  displayName: string;
  agentKey: string;
  webhookUrl: string | null;
  webhookSecretRef: string | null;
  enabled: boolean;
  health: {
    lastSeenAt: string | null;
    lastStatus: AgentConnectionStatus | null;
    lastError: string | null;
  };
  source: {
    displayName: FieldSource;
    agentKey: FieldSource;
    webhookUrl: FieldSource;
    enabled: FieldSource;
  };
};

export const DEFAULT_WORKSPACE_ID = "default";
export const DEFAULT_CONNECTION = { displayName: "Mark", agentKey: "mark" };

type EnvLike = Record<string, string | undefined>;

function pick<T>(envVal: T | undefined, dbVal: T | null | undefined, fallback: T): [T, FieldSource] {
  if (envVal !== undefined && envVal !== null && envVal !== "") return [envVal, "env"];
  if (dbVal !== undefined && dbVal !== null) return [dbVal, "db"];
  return [fallback, "default"];
}

/** Pure precedence: env overrides DB, DB overrides default. */
export function mergeConnection(env: EnvLike, row: AgentConnectionRow | null): EffectiveAgentConnection {
  const envWebhook = env.MARK_RUNNER_URL?.trim() || env.MARK_WEBHOOK_URL?.trim() || undefined;
  const [displayName, displayNameSource] = pick(
    env.MARK_DISPLAY_NAME?.trim() || undefined,
    row?.display_name,
    DEFAULT_CONNECTION.displayName,
  );
  const [agentKey, agentKeySource] = pick(
    env.MARK_AGENT_KEY?.trim() || undefined,
    row?.agent_key,
    DEFAULT_CONNECTION.agentKey,
  );
  const [webhookUrl, webhookUrlSource] = pick<string | null>(envWebhook, row?.webhook_url ?? null, null);
  const envEnabled = env.MARK_WEBHOOK_DISABLED === "1" ? false : undefined;
  const [enabled, enabledSource] = pick<boolean>(envEnabled, row?.enabled, true);

  return {
    workspaceId: row?.workspace_id ?? DEFAULT_WORKSPACE_ID,
    displayName,
    agentKey,
    webhookUrl,
    webhookSecretRef: row?.webhook_secret_ref ?? null,
    enabled,
    health: {
      lastSeenAt: row?.last_seen_at ?? null,
      lastStatus: row?.last_status ?? null,
      lastError: row?.last_error ?? null,
    },
    source: {
      displayName: displayNameSource,
      agentKey: agentKeySource,
      webhookUrl: webhookUrlSource,
      enabled: enabledSource,
    },
  };
}

/** Fetch the singleton connection row and merge it with env. Degrades to defaults. */
export async function resolveAgentConnection(client?: SupabaseClient): Promise<EffectiveAgentConnection> {
  const supabase: SupabaseClient | null = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return mergeConnection(process.env, null);

  try {
    const { data, error } = await supabase
      .from("agent_connections")
      .select("*")
      .eq("workspace_id", DEFAULT_WORKSPACE_ID)
      .maybeSingle<AgentConnectionRow>();
    if (error) return mergeConnection(process.env, null);
    return mergeConnection(process.env, data ?? null);
  } catch {
    return mergeConnection(process.env, null);
  }
}
