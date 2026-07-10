import { type SupabaseClient } from "@supabase/supabase-js";

// Per-workspace connector config lives in the existing workspace_connectors.config
// jsonb column (baseline table, default '{}'). No new migration is needed — this
// is the framework's typed accessor for it. Writes filter by workspace_id in code
// (the app uses the service-role client, so RLS is not the boundary here).

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

/** Read a connector's per-workspace config object ({} when absent). */
export async function getConnectorConfig(
  client: SupabaseClient,
  workspaceId: string,
  connectorKey: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await client
    .from("workspace_connectors")
    .select("config")
    .eq("workspace_id", workspaceId)
    .eq("connector_key", connectorKey)
    .maybeSingle<{ config: Record<string, unknown> | null }>();
  if (error) return {};
  return data?.config ?? {};
}

/**
 * Upsert a connector's config. Upsert (not update) so a config-only connector
 * — e.g. a no-credential signal source — can be set up before it is enabled.
 */
export async function setConnectorConfig(
  client: SupabaseClient,
  input: { workspaceId: string; orgId: string | null; connectorKey: string; config: Record<string, unknown> },
): Promise<void> {
  const { error } = await client.from("workspace_connectors").upsert(
    {
      workspace_id: input.workspaceId,
      org_id: input.orgId,
      connector_key: input.connectorKey,
      config: input.config,
    },
    { onConflict: "workspace_id,connector_key" },
  );
  assertOk("workspace_connectors config upsert", error);
}
