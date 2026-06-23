import { type SupabaseClient } from "@supabase/supabase-js";

import {
  CONNECTOR_REGISTRY,
  computeConnectorStatus,
  type ConnectorAccess,
  type ConnectorAuthKind,
  type ConnectorStatus,
} from "@/domain";

export type ConnectorView = {
  key: string;
  label: string;
  description: string;
  authKind: ConnectorAuthKind;
  access: ConnectorAccess;
  enabled: boolean;
  credentialPresent: boolean;
  status: ConnectorStatus;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
};

type ConnectorRow = {
  connector_key: string;
  enabled: boolean;
  credential_ref: string | null;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
};

/** Catalog x this workspace's rows → views with computed status. No secrets/refs. */
export async function listWorkspaceConnectors(client: SupabaseClient, workspaceId: string): Promise<ConnectorView[]> {
  const { data, error } = await client
    .from("workspace_connectors")
    .select("connector_key,enabled,credential_ref,last_tested_at,last_test_ok,last_test_error")
    .eq("workspace_id", workspaceId);

  if (error) {
    console.warn(`workspace_connectors lookup failed, using registry fallback: ${error.message}`);
  }
  const rows = error ? [] : ((data ?? []) as ConnectorRow[]);
  const byKey = new Map(rows.map((row) => [row.connector_key, row]));

  return CONNECTOR_REGISTRY.map((entry) => {
    const row = byKey.get(entry.key);
    const credentialPresent = Boolean(row?.credential_ref);
    return {
      key: entry.key,
      label: entry.label,
      description: entry.description,
      authKind: entry.authKind,
      access: entry.access,
      enabled: row?.enabled ?? false,
      credentialPresent,
      status: computeConnectorStatus({
        credentialPresent,
        enabled: row?.enabled ?? false,
        lastTestOk: row?.last_test_ok ?? null,
      }),
      lastTestedAt: row?.last_tested_at ?? null,
      lastTestOk: row?.last_test_ok ?? null,
      lastTestError: row?.last_test_error ?? null,
    };
  });
}

/** The Vault ref for an ENABLED connector in this workspace, else null. */
export async function resolveConnectorCredentialRef(
  client: SupabaseClient,
  workspaceId: string,
  connectorKey: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("workspace_connectors")
    .select("credential_ref,enabled")
    .eq("workspace_id", workspaceId)
    .eq("connector_key", connectorKey)
    .maybeSingle<{ credential_ref: string | null; enabled: boolean }>();
  if (error || !data || !data.enabled) return null;
  return data.credential_ref ?? null;
}
