import { type SupabaseClient } from "@supabase/supabase-js";

import {
  computeConnectionStatus,
  CONNECTION_REGISTRY,
  missingRequiredEnvVars,
  type ConnectionKind,
  type ConnectionProvider,
  type ConnectionStatus,
} from "@/domain";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

export type ConnectionView = {
  provider: ConnectionProvider;
  kind: ConnectionKind;
  label: string;
  envVar: string | null;
  requiredEnvVars: string[];
  enabled: boolean;
  status: ConnectionStatus;
  fromEmail: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  lastUsedAt: string | null;
};

type ConnectionRow = {
  provider: ConnectionProvider;
  kind: ConnectionKind;
  label: string;
  enabled: boolean;
  env_var: string | null;
  config: Record<string, unknown> | null;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  last_used_at: string | null;
};

/** True when every env var the provider requires is present and non-blank. */
function isConfigured(provider: ConnectionProvider): boolean {
  return missingRequiredEnvVars(provider, process.env).length === 0;
}

/** The provider's required env vars from the registry (for display on the view). */
function requiredEnvVarsFor(provider: ConnectionProvider): string[] {
  return CONNECTION_REGISTRY.find((entry) => entry.provider === provider)?.requiredEnvVars ?? [];
}

function rowToView(row: ConnectionRow): ConnectionView {
  const config = row.config ?? {};
  return {
    provider: row.provider,
    kind: row.kind,
    label: row.label,
    envVar: row.env_var,
    requiredEnvVars: requiredEnvVarsFor(row.provider),
    enabled: row.enabled,
    status: computeConnectionStatus({
      envPresent: isConfigured(row.provider),
      enabled: row.enabled,
      lastTestOk: row.last_test_ok,
    }),
    fromEmail: typeof config.fromEmail === "string" ? config.fromEmail : null,
    lastTestedAt: row.last_tested_at,
    lastTestOk: row.last_test_ok,
    lastTestError: row.last_test_error,
    lastUsedAt: row.last_used_at,
  };
}

/** Fallback when Supabase isn't configured — derive views from the registry + env. */
function fallbackViews(): ConnectionView[] {
  return CONNECTION_REGISTRY.map((entry) => ({
    provider: entry.provider,
    kind: entry.kind,
    label: entry.label,
    envVar: entry.envVar,
    requiredEnvVars: entry.requiredEnvVars,
    enabled: false,
    status: computeConnectionStatus({ envPresent: isConfigured(entry.provider), enabled: false, lastTestOk: null }),
    fromEmail: null,
    lastTestedAt: null,
    lastTestOk: null,
    lastTestError: null,
    lastUsedAt: null,
  }));
}

function fallbackViewFor(entry: (typeof CONNECTION_REGISTRY)[number]): ConnectionView {
  return {
    provider: entry.provider,
    kind: entry.kind,
    label: entry.label,
    envVar: entry.envVar,
    requiredEnvVars: entry.requiredEnvVars,
    enabled: false,
    status: computeConnectionStatus({ envPresent: isConfigured(entry.provider), enabled: false, lastTestOk: null }),
    fromEmail: null,
    lastTestedAt: null,
    lastTestOk: null,
    lastTestError: null,
    lastUsedAt: null,
  };
}

/**
 * Connection list for the Settings UI. Status is computed here (env presence ×
 * operator switch × last test) — never stored. Degrades gracefully to a registry
 * view when Supabase isn't configured.
 */
export async function getConnections(client?: SupabaseClient): Promise<ConnectionView[]> {
  const supabase = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return fallbackViews();

  const { data, error } = await supabase
    .from("connections")
    .select("provider,kind,label,enabled,env_var,config,last_tested_at,last_test_ok,last_test_error,last_used_at")
    .order("kind", { ascending: true })
    .order("label", { ascending: true });

  // Degrade gracefully (e.g. the migration hasn't been applied yet): show the
  // registry-derived view rather than crashing the Settings page.
  if (error) {
    console.warn(`connections lookup failed, using registry fallback: ${error.message}`);
    return fallbackViews();
  }

  const views = ((data ?? []) as ConnectionRow[]).map(rowToView);
  const seen = new Set(views.map((view) => view.provider));
  for (const entry of CONNECTION_REGISTRY) {
    if (!seen.has(entry.provider)) views.push(fallbackViewFor(entry));
  }

  return views;
}
