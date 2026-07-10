// ---------------------------------------------------------------------------
// Settings → Connections view. Real per-workspace connector state when Supabase
// is configured (via listWorkspaceConnectors); otherwise a registry-only
// fallback so the offline preview shows the real 2-connector catalog as
// "not configured" (never fabricated as connected). Secrets never appear here —
// ConnectorView carries only presence + status.
// ---------------------------------------------------------------------------

import { CONNECTOR_REGISTRY, computeConnectorStatus, connectorIsAvailable, connectorRequiresCredential } from "@/domain";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { listWorkspaceConnectors, type ConnectorView } from "./read-model";

export type SettingsConnectorsView = {
  configured: boolean;
  connectors: ConnectorView[];
};

/** Registry-only views (no workspace rows) — every connector "not configured". */
function registryFallback(): ConnectorView[] {
  return CONNECTOR_REGISTRY.map((entry) => {
    const requiresCredential = connectorRequiresCredential(entry);
    return {
      key: entry.key,
      kind: entry.kind,
      label: entry.label,
      description: entry.description,
      authKind: entry.authKind,
      access: entry.access,
      costTier: entry.costTier,
      verticals: entry.verticals,
      available: connectorIsAvailable(entry),
      enabled: false,
      credentialPresent: false,
      credentialOptional: !requiresCredential,
      config: {},
      status: computeConnectorStatus({ credentialPresent: false, enabled: false, lastTestOk: null, requiresCredential }),
      lastTestedAt: null,
      lastTestOk: null,
      lastTestError: null,
    };
  });
}

export async function getSettingsConnectorsView(): Promise<SettingsConnectorsView> {
  if (!isSupabaseAdminConfigured()) return { configured: false, connectors: registryFallback() };

  try {
    const ctx = await getCurrentWorkspaceContext();
    if (!ctx.workspaceId) return { configured: false, connectors: registryFallback() };
    const connectors = await listWorkspaceConnectors(getSupabaseAdminClient(), ctx.workspaceId);
    return { configured: true, connectors };
  } catch {
    return { configured: false, connectors: registryFallback() };
  }
}
