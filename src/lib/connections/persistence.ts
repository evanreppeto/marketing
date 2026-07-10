import { type SupabaseClient } from "@supabase/supabase-js";

import { type ConnectionProvider } from "@/domain";

// Persistence for the connections registry. Writes operator-controlled state and
// telemetry only — never secrets (those stay in env vars). Untyped SupabaseClient
// param, matching the vault/dispatch layers (the `connections` table is not in the
// generated database.types yet).
//
// Every mutation runs on the RLS-bypassing admin client and is keyed by
// (org_id, provider) — the table's uniqueness scope — so one operator flipping a
// toggle or stamping a test never reaches into another tenant's connection row.

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

/** Flip the operator kill-switch for a provider, scoped to one org. */
export async function setConnectionEnabled(
  client: SupabaseClient,
  orgId: string,
  provider: ConnectionProvider,
  enabled: boolean,
): Promise<void> {
  const { error } = await client
    .from("connections")
    .update({ enabled })
    .eq("org_id", orgId)
    .eq("provider", provider);
  assertOk("connections enable update", error);
}

/** Record the outcome of a connection test, scoped to one org. */
export async function recordConnectionTest(
  client: SupabaseClient,
  orgId: string,
  provider: ConnectionProvider,
  result: { ok: boolean; error?: string },
): Promise<void> {
  const { error } = await client
    .from("connections")
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_ok: result.ok,
      last_test_error: result.ok ? null : (result.error ?? "Connection test failed."),
    })
    .eq("org_id", orgId)
    .eq("provider", provider);
  assertOk("connections test update", error);
}

/** Stamp the last time a provider was used for a real send, scoped to one org. */
export async function recordConnectionUse(
  client: SupabaseClient,
  orgId: string,
  provider: ConnectionProvider,
): Promise<void> {
  const { error } = await client
    .from("connections")
    .update({ last_used_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("provider", provider);
  assertOk("connections use update", error);
}
