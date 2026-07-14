"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import {
  clearConnectionCredentialRef,
  recordConnectionTest,
  setConnectionCredentialRef,
  upsertConnection,
} from "@/lib/connections/persistence";
import { getConnectionCredentialRef } from "@/lib/connections/read-model";
import { testResendConnection } from "@/lib/connections/resend-client";
import { readConnectorCredential, writeConnectorCredential } from "@/lib/connectors/credentials";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import type { SettingsWriteResult } from "./actions";

/** Resolve the Resend key the send path will actually use: this workspace's
 *  stored Vault secret if present, else the deployment env var. */
async function resolveResendApiKey(orgId: string): Promise<string | null> {
  if (isSupabaseAdminConfigured()) {
    const client = getSupabaseAdminClient();
    const ref = await getConnectionCredentialRef(client, orgId, "resend").catch(() => null);
    if (ref) {
      const stored = await readConnectorCredential(client, ref).catch(() => null);
      if (stored) return stored;
    }
  }
  return process.env.RESEND_API_KEY?.trim() || null;
}

/**
 * Operator controls for the outbound `connections` registry (Resend email). The
 * secret is stored per workspace as a Vault secret (the row holds only its
 * credential_ref, from-address, enable switch, and test telemetry); it falls back
 * to RESEND_API_KEY on the deploy when a workspace hasn't stored its own key.
 * `executeResendDispatch` reads that row as gate 5/6 of the send, so enabling here
 * is what unlocks a real send (the linked approval must still be approved — the
 * outbound gate is never bypassed).
 */
export async function setEmailConnectionEnabled(input: {
  enabled: boolean;
  fromEmail?: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx?.orgId) return { ok: false, error: "No active org to update." };

  try {
    await upsertConnection(getSupabaseAdminClient(), ctx.orgId, "resend", {
      enabled: input.enabled,
      fromEmail: input.fromEmail ?? null,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update Resend." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: input.enabled ? "Resend enabled." : "Resend disabled." };
}

/**
 * Store this workspace's own Resend API key. The plaintext is written to the Vault
 * via create_secret (mirroring the Gemini/Higgsfield connect flow); the
 * connections row keeps only the returned credential_ref. Saving a key never flips
 * the sending kill-switch — sending stays a deliberate, separate gate. The stored
 * key is never echoed back to the browser.
 */
export async function saveResendKey(input: { apiKey: string }): Promise<SettingsWriteResult> {
  await requireOperator();

  const apiKey = (input.apiKey ?? "").trim();
  if (!apiKey) return { ok: false, error: "Paste a Resend API key to connect." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx?.orgId) return { ok: false, error: "No active workspace to connect into." };

  try {
    const client = getSupabaseAdminClient();
    const credentialRef = await writeConnectorCredential(client, {
      // Name the secret by workspace when available (matches the connector flow);
      // the org-keyed connections row is what the send path resolves it through.
      workspaceId: ctx.workspaceId ?? ctx.orgId,
      connectorKey: "resend",
      plaintext: apiKey,
    });
    await setConnectionCredentialRef(client, ctx.orgId, "resend", credentialRef);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the Resend key." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: "Resend key saved." };
}

/** Remove this workspace's stored Resend key. Sending then falls back to the
 *  deployment RESEND_API_KEY (and is refused outright if that's unset too). */
export async function removeResendKey(): Promise<SettingsWriteResult> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx?.orgId) return { ok: false, error: "No active workspace to update." };

  try {
    await clearConnectionCredentialRef(getSupabaseAdminClient(), ctx.orgId, "resend");
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not remove the Resend key." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: "Resend key removed." };
}

/**
 * Real provider probe: hit Resend's /domains with the key the send path would use
 * (this workspace's stored key, else RESEND_API_KEY). Records the outcome on the
 * row (best-effort — a test before the first enable simply has no row to stamp).
 * Returns the result so the UI can show healthy / the exact error.
 */
export async function testEmailConnection(): Promise<SettingsWriteResult> {
  await requireOperator();

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const apiKey = await resolveResendApiKey(ctx?.orgId ?? "");
  if (!apiKey) return { ok: false, error: "Resend isn't configured — add a workspace key or set RESEND_API_KEY on the deploy." };

  const result = await testResendConnection(apiKey);

  if (isSupabaseAdminConfigured() && ctx?.orgId) {
    try {
      await recordConnectionTest(getSupabaseAdminClient(), ctx.orgId, "resend", result);
    } catch {
      // Telemetry is best-effort; never fail the test on a record error.
    }
  }

  revalidatePath("/settings");
  return result.ok
    ? { ok: true, persisted: true, message: "Resend connection is healthy." }
    : { ok: false, error: `Test failed: ${result.error ?? "unknown error"}` };
}
