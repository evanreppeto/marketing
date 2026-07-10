import { type SupabaseClient } from "@supabase/supabase-js";

import {
  computeConnectionStatus,
  CONNECTION_REGISTRY,
  missingRequiredEnvVars,
  type ConnectionKind,
  type ConnectionProvider,
  type ConnectionStatus,
} from "@/domain";

import { getCurrentOrgId } from "../auth/org";
import { getOperatorActor, getOperatorIntegrationKey } from "../auth/operator";
import { getConfiguredOperatorCredentials } from "../auth/operator-shared";
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

type GoogleDriveConnectionStatusRow = {
  connected_by: string;
  connected_email: string | null;
  connected_at: string;
  last_import_at: string | null;
  last_error: string | null;
};

type UntypedSelectChain = {
  eq(column: string, value: string): UntypedSelectChain;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
};

type UntypedSupabaseClient = SupabaseClient & {
  from(table: string): {
    select(columns: string): UntypedSelectChain;
  };
};

type GetConnectionsOptions = {
  orgId?: string;
  connectedBy?: string;
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

async function connectedByCandidates(primary: string): Promise<string[]> {
  const candidates = new Set<string>();
  candidates.add(primary);
  candidates.add(await getOperatorActor());

  const configuredEmail = getConfiguredOperatorCredentials()?.email;
  if (configuredEmail) candidates.add(configuredEmail);

  candidates.add("Operator");
  return [...candidates];
}

async function getGoogleDriveStatusConnection(
  client: SupabaseClient,
  options: GetConnectionsOptions,
  resolveRequestScope: boolean,
): Promise<GoogleDriveConnectionStatusRow | null> {
  const orgId = options.orgId ?? (resolveRequestScope ? await getCurrentOrgId().catch(() => null) : null);
  if (!orgId) return null;

  const connectedBy = options.connectedBy ?? (await getOperatorIntegrationKey());
  for (const candidate of await connectedByCandidates(connectedBy)) {
    const { data, error } = await (client as UntypedSupabaseClient)
      .from("google_drive_connections")
      .select("connected_by,connected_email,connected_at,last_import_at,last_error")
      .eq("org_id", orgId)
      .eq("connected_by", candidate)
      .maybeSingle();

    if (error) {
      console.warn(`google_drive_connections status lookup failed: ${error.message}`);
      return null;
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as GoogleDriveConnectionStatusRow;
    }
  }

  return null;
}

function applyGoogleDriveConnectionStatus(
  views: ConnectionView[],
  driveConnection: GoogleDriveConnectionStatusRow | null,
): ConnectionView[] {
  if (!driveConnection) return views;

  return views.map((view) => {
    if (view.provider !== "google_drive") return view;

    return {
      ...view,
      status: computeConnectionStatus({
        envPresent: isConfigured("google_drive"),
        enabled: view.enabled,
        lastTestOk: true,
      }),
      fromEmail: driveConnection.connected_email ?? driveConnection.connected_by,
      lastTestedAt: driveConnection.connected_at,
      lastTestOk: true,
      lastTestError: driveConnection.last_error,
      lastUsedAt: driveConnection.last_import_at ?? view.lastUsedAt,
    };
  });
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
export async function getConnections(client?: SupabaseClient, options: GetConnectionsOptions = {}): Promise<ConnectionView[]> {
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

  const driveConnection = await getGoogleDriveStatusConnection(supabase, options, !client);
  return applyGoogleDriveConnectionStatus(views, driveConnection);
}

/**
 * Focused read for the Settings email card: just the Resend row (or a registry
 * fallback when it doesn't exist yet). Lighter than getConnections — no social /
 * Google Drive lookups — since the email card only needs enable + from + last test.
 */
export async function getEmailConnection(client?: SupabaseClient): Promise<ConnectionView> {
  const entry = CONNECTION_REGISTRY.find((e) => e.provider === "resend")!;
  const supabase = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return fallbackViewFor(entry);

  const { data, error } = await supabase
    .from("connections")
    .select("provider,kind,label,enabled,env_var,config,last_tested_at,last_test_ok,last_test_error,last_used_at")
    .eq("provider", "resend")
    .maybeSingle();

  if (error) {
    console.warn(`email connection lookup failed, using registry fallback: ${error.message}`);
    return fallbackViewFor(entry);
  }
  return data ? rowToView(data as ConnectionRow) : fallbackViewFor(entry);
}
