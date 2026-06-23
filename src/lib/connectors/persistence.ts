import { type SupabaseClient } from "@supabase/supabase-js";

// Workspace-scoped writes to workspace_connectors. RLS is not a backstop (the app
// uses the service-role client), so every write filters by workspace_id in code.
// Untyped table access (workspace_connectors is not in generated database.types).

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

/** Upsert the credential ref for a connector in this workspace. */
export async function setConnectorCredentialRef(
  client: SupabaseClient,
  input: { workspaceId: string; orgId: string | null; connectorKey: string; credentialRef: string },
): Promise<void> {
  const { error } = await client.from("workspace_connectors").upsert(
    {
      workspace_id: input.workspaceId,
      org_id: input.orgId,
      connector_key: input.connectorKey,
      credential_ref: input.credentialRef,
    },
    { onConflict: "workspace_id,connector_key" },
  );
  assertOk("workspace_connectors credential upsert", error);
}

/** Flip the per-workspace enable switch. */
export async function setConnectorEnabled(
  client: SupabaseClient,
  input: { workspaceId: string; connectorKey: string; enabled: boolean },
): Promise<void> {
  const { error } = await client
    .from("workspace_connectors")
    .update({ enabled: input.enabled })
    .eq("workspace_id", input.workspaceId)
    .eq("connector_key", input.connectorKey);
  assertOk("workspace_connectors enable update", error);
}

/** Record a connection-test outcome. */
export async function recordConnectorTest(
  client: SupabaseClient,
  input: { workspaceId: string; connectorKey: string; result: { ok: boolean; error?: string } },
): Promise<void> {
  const { error } = await client
    .from("workspace_connectors")
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_ok: input.result.ok,
      last_test_error: input.result.ok ? null : (input.result.error ?? "Connection test failed."),
    })
    .eq("workspace_id", input.workspaceId)
    .eq("connector_key", input.connectorKey);
  assertOk("workspace_connectors test update", error);
}
