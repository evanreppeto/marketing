import { type SupabaseClient } from "@supabase/supabase-js";

import { CONNECTION_REGISTRY, type ConnectionProvider } from "@/domain";

// Persistence for the connections registry. Writes operator-controlled state and
// telemetry only. The secret itself is never stored on the row: a per-workspace
// key lives in the Vault and the row holds just its `credential_ref` (uuid), the
// same shape workspace_connectors uses for Gemini/Higgsfield. Untyped
// SupabaseClient param, matching the vault/dispatch layers (the `connections`
// table is not in the generated database.types yet).
//
// Every mutation runs on the RLS-bypassing admin client and is keyed by
// (org_id, provider) — the table's uniqueness scope — so one operator flipping a
// toggle, seeding a row, or stamping a test never reaches into another tenant's
// connection row.

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

/**
 * Enable/disable a provider, creating the row on first use. `setConnectionEnabled`
 * only UPDATEs, so it no-ops when no row exists yet — and nothing seeds these rows.
 * This upsert (keyed on the per-org UNIQUE (org_id, provider)) is what lets an
 * operator turn a provider on for the first time; the DB defaults fill
 * id/timestamps. kind/label/env_var come from the registry so the stored row
 * matches the UI. `config.fromEmail` is only written when supplied, so a plain
 * enable/disable never clobbers a previously-saved from-address.
 */
export async function upsertConnection(
  client: SupabaseClient,
  orgId: string,
  provider: ConnectionProvider,
  input: { enabled: boolean; fromEmail?: string | null },
): Promise<void> {
  const entry = CONNECTION_REGISTRY.find((e) => e.provider === provider);
  if (!entry) throw new Error(`upsertConnection: unknown provider ${provider}`);

  const row: Record<string, unknown> = {
    org_id: orgId,
    provider,
    kind: entry.kind,
    label: entry.label,
    env_var: entry.envVar,
    enabled: input.enabled,
    updated_at: new Date().toISOString(),
  };

  const from = input.fromEmail?.trim();
  if (from) row.config = { fromEmail: from };

  const { error } = await client.from("connections").upsert(row, { onConflict: "org_id,provider" });
  assertOk("connections upsert", error);
}

/**
 * Store the Vault ref for a provider's per-workspace secret (currently Resend's
 * API key), creating the row on first use. Deliberately omits `enabled` from the
 * payload so saving/rotating a key never flips the sending kill-switch — on INSERT
 * the DB default (false) applies, on CONFLICT the existing switch is left
 * untouched. kind/label/env_var come from the registry so a first-time row still
 * matches the UI. The plaintext lives only in the Vault; this row holds the ref.
 */
export async function setConnectionCredentialRef(
  client: SupabaseClient,
  orgId: string,
  provider: ConnectionProvider,
  credentialRef: string,
): Promise<void> {
  const entry = CONNECTION_REGISTRY.find((e) => e.provider === provider);
  if (!entry) throw new Error(`setConnectionCredentialRef: unknown provider ${provider}`);

  const { error } = await client.from("connections").upsert(
    {
      org_id: orgId,
      provider,
      kind: entry.kind,
      label: entry.label,
      env_var: entry.envVar,
      credential_ref: credentialRef,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,provider" },
  );
  assertOk("connections credential upsert", error);
}

/** Drop a provider's stored per-workspace secret ref (falls back to the env key). */
export async function clearConnectionCredentialRef(
  client: SupabaseClient,
  orgId: string,
  provider: ConnectionProvider,
): Promise<void> {
  const { error } = await client
    .from("connections")
    .update({ credential_ref: null })
    .eq("org_id", orgId)
    .eq("provider", provider);
  assertOk("connections credential clear", error);
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
