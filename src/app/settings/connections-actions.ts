"use server";

import { revalidatePath } from "next/cache";

import {
  buildResendEmailPayload,
  CONNECTION_REGISTRY,
  missingRequiredEnvVars,
  type ConnectionKind,
  type ConnectionProvider,
} from "@/domain";

import { getCurrentOrgId } from "@/lib/auth/org";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { recordConnectionTest, recordConnectionUse, setConnectionEnabled } from "@/lib/connections/persistence";
import { sendResendEmail, testResendConnection } from "@/lib/connections/resend-client";
import { executeResendDispatch } from "@/lib/dispatch/execute-resend";
import { resolveGoogleDriveAccessToken } from "@/lib/google-drive/connection";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type ConnectionActionState = { ok: boolean; message: string } | null;

const NOT_CONFIGURED: ConnectionActionState = {
  ok: false,
  message: "Supabase isn't configured, so connection state can't be saved.",
};

function registeredProvider(value: string): ConnectionProvider | null {
  return CONNECTION_REGISTRY.some((entry) => entry.provider === value) ? (value as ConnectionProvider) : null;
}

function providerMeta(provider: ConnectionProvider): { kind: ConnectionKind; label: string } {
  const entry = CONNECTION_REGISTRY.find((candidate) => candidate.provider === provider);
  return { kind: entry?.kind ?? "social", label: entry?.label ?? provider };
}

/** Enable or disable the operator kill-switch for a provider. */
export async function setConnectionEnabledAction(
  _previous: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const provider = registeredProvider(String(formData.get("provider") ?? ""));
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!provider) {
    return { ok: false, message: "Unknown connection provider." };
  }

  const { kind, label } = providerMeta(provider);
  try {
    await setConnectionEnabled(getSupabaseAdminClient(), provider, enabled);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't update the connection." };
  }

  revalidatePath("/settings");
  const disabledMessage = kind === "email" ? `${label} disabled — sends are now blocked.` : `${label} disabled.`;
  return { ok: true, message: enabled ? `${label} enabled.` : disabledMessage };
}

/** Probe the live Resend key and record the result. */
export async function testConnectionAction(
  _previous: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const provider = registeredProvider(String(formData.get("provider") ?? ""));
  if (!provider) {
    return { ok: false, message: "Unknown connection provider." };
  }

  const { kind, label } = providerMeta(provider);

  if (provider === "google_drive") {
    const missing = missingRequiredEnvVars(provider, process.env);
    const client = getSupabaseAdminClient();
    if (missing.length > 0) {
      const result = { ok: false as const, error: `Missing env vars: ${missing.join(", ")}` };
      await recordConnectionTest(client, provider, result).catch(() => undefined);
      revalidatePath("/settings");
      return { ok: false, message: result.error };
    }

    try {
      await resolveGoogleDriveAccessToken({ orgId: await getCurrentOrgId(), connectedBy: getOperatorActor(), client });
      await recordConnectionTest(client, provider, { ok: true });
      revalidatePath("/settings");
      return { ok: true, message: "Google Drive connection is healthy." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Drive test failed.";
      await recordConnectionTest(client, provider, { ok: false, error: message }).catch(() => undefined);
      revalidatePath("/settings");
      return { ok: false, message };
    }
  }

  // Social/storage providers have no live transport here. "Test" verifies that
  // every required env var is present (no external API call).
  if (kind === "social" || kind === "storage") {
    const missing = missingRequiredEnvVars(provider, process.env);
    const result =
      missing.length === 0
        ? { ok: true as const }
        : { ok: false as const, error: `Missing env vars: ${missing.join(", ")}` };
    try {
      await recordConnectionTest(getSupabaseAdminClient(), provider, result);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Couldn't record the test." };
    }
    revalidatePath("/settings");
    return result.ok
      ? { ok: true, message: `${label} credentials are present.` }
      : { ok: false, message: result.error };
  }

  // Email (Resend): live key probe.
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "RESEND_API_KEY isn't set in the environment." };
  }

  const result = await testResendConnection(apiKey);
  try {
    await recordConnectionTest(getSupabaseAdminClient(), provider, result);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't record the test." };
  }

  revalidatePath("/settings");
  return result.ok
    ? { ok: true, message: "Resend connection is healthy." }
    : { ok: false, message: result.error ?? "Resend test failed." };
}

/** Send a one-off test email to verify the live key end-to-end (operator self-test). */
export async function sendTestEmailAction(
  _previous: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
  await requireOperator();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "RESEND_API_KEY isn't set in the environment." };
  }

  const to = String(formData.get("to") ?? "").trim() || process.env.OPERATOR_EMAIL || "";
  const from = process.env.RESEND_FROM;
  if (!to) {
    return { ok: false, message: "Enter a recipient, or set OPERATOR_EMAIL." };
  }
  if (!from) {
    return { ok: false, message: "Set RESEND_FROM to a verified from-address." };
  }

  let payload;
  try {
    payload = buildResendEmailPayload({
      from,
      to,
      subject: "Resend connection test — Arc",
      html: "<p>This is a test send from the Connections panel. If you received it, Resend is wired correctly.</p>",
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid email." };
  }

  try {
    const { id } = await sendResendEmail(apiKey, payload);
    if (isSupabaseAdminConfigured()) {
      await recordConnectionUse(getSupabaseAdminClient(), "resend");
    }
    revalidatePath("/settings");
    return { ok: true, message: `Test email sent to ${to} (id ${id}).` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Resend send failed." };
  }
}

/**
 * Run the real Resend send for an already-queued, approval-linked dispatch. The
 * executor enforces the approval gate + idempotency; this action is just the
 * operator-triggered entry point. (Creating the dispatch row from a campaign
 * deliverable — with audience/recipient resolution — is the deferred
 * campaign_dispatches → outbound_dispatches reconciliation.)
 */
export async function sendDispatchAction(
  _previous: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const dispatchId = String(formData.get("dispatchId") ?? "").trim();
  if (!dispatchId) {
    return { ok: false, message: "Choose a dispatch to send." };
  }

  const { getOperatorActor } = await import("@/lib/auth/operator");
  const result = await executeResendDispatch({ dispatchId, operator: getOperatorActor() }, getSupabaseAdminClient());

  revalidatePath("/settings");
  return { ok: result.ok, message: result.message };
}
