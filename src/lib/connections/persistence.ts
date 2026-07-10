import { type SupabaseClient } from "@supabase/supabase-js";

import { CONNECTION_REGISTRY, type ConnectionProvider } from "@/domain";

// Persistence for the connections registry. Writes operator-controlled state and
// telemetry only — never secrets (those stay in env vars). Untyped SupabaseClient
// param, matching the vault/dispatch layers (the `connections` table is not in the
// generated database.types yet).

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

/** Flip the operator kill-switch for a provider. */
export async function setConnectionEnabled(
  client: SupabaseClient,
  provider: ConnectionProvider,
  enabled: boolean,
): Promise<void> {
  const { error } = await client.from("connections").update({ enabled }).eq("provider", provider);
  assertOk("connections enable update", error);
}

/**
 * Enable/disable a provider, creating the row on first use. `setConnectionEnabled`
 * only UPDATEs, so it no-ops when no row exists yet — and nothing seeds these rows.
 * This upsert (keyed on the provider's UNIQUE constraint) is what lets an operator
 * turn a provider on for the first time; the DB defaults fill id/org_id/timestamps.
 * kind/label/env_var come from the registry so the stored row matches the UI.
 * `config.fromEmail` is only written when supplied, so a plain enable/disable never
 * clobbers a previously-saved from-address.
 */
export async function upsertConnection(
  client: SupabaseClient,
  provider: ConnectionProvider,
  input: { enabled: boolean; fromEmail?: string | null },
): Promise<void> {
  const entry = CONNECTION_REGISTRY.find((e) => e.provider === provider);
  if (!entry) throw new Error(`upsertConnection: unknown provider ${provider}`);

  const row: Record<string, unknown> = {
    provider,
    kind: entry.kind,
    label: entry.label,
    env_var: entry.envVar,
    enabled: input.enabled,
    updated_at: new Date().toISOString(),
  };

  const from = input.fromEmail?.trim();
  if (from) row.config = { fromEmail: from };

  const { error } = await client.from("connections").upsert(row, { onConflict: "provider" });
  assertOk("connections upsert", error);
}

/** Record the outcome of a connection test. */
export async function recordConnectionTest(
  client: SupabaseClient,
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
    .eq("provider", provider);
  assertOk("connections test update", error);
}

/** Stamp the last time a provider was used for a real send. */
export async function recordConnectionUse(client: SupabaseClient, provider: ConnectionProvider): Promise<void> {
  const { error } = await client
    .from("connections")
    .update({ last_used_at: new Date().toISOString() })
    .eq("provider", provider);
  assertOk("connections use update", error);
}
