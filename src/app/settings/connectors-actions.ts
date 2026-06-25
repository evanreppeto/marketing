"use server";

import { revalidatePath } from "next/cache";

import { findConnector, parseConnectorCredential } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { readConnectorCredential, writeConnectorCredential } from "@/lib/connectors/credentials";
import { checkHiggsfieldToken } from "@/lib/connectors/higgsfield-health";
import { ensureFreshAccessToken } from "@/lib/connectors/oauth-refresh";
import {
  recordConnectorTest,
  setConnectorCredentialRef,
  setConnectorEnabled,
} from "@/lib/connectors/persistence";
import { resolveConnectorCredentialRef } from "@/lib/connectors/read-model";
import { searchWebWithGemini } from "@/lib/research/gemini-web-search";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type ConnectorActionState = { ok: boolean; message: string } | null;

const NOT_CONFIGURED: ConnectorActionState = {
  ok: false,
  message: "Supabase isn't configured, so connector state can't be saved.",
};

async function workspaceScope(): Promise<{ workspaceId: string; orgId: string | null }> {
  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) throw new Error("No active workspace.");
  return { workspaceId: ctx.workspaceId, orgId: ctx.orgId ?? null };
}

/** Paste an API key → store in Vault → save the ref on the workspace's connector row. */
export async function connectConnectorAction(
  _previous: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const connectorKey = String(formData.get("connectorKey") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const entry = findConnector(connectorKey);
  if (!entry) return { ok: false, message: "Unknown connector." };
  if (entry.authKind !== "api_key") return { ok: false, message: `${entry.label} doesn't use an API key.` };
  if (!apiKey) return { ok: false, message: "Paste an API key first." };

  try {
    const { workspaceId, orgId } = await workspaceScope();
    const client = getSupabaseAdminClient();
    const credentialRef = await writeConnectorCredential(client, { workspaceId, connectorKey, plaintext: apiKey });
    await setConnectorCredentialRef(client, { workspaceId, orgId, connectorKey, credentialRef });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save the key." };
  }

  revalidatePath("/settings");
  return { ok: true, message: `${entry.label} key saved. Enable it to start using it.` };
}

/** Flip the per-workspace enable switch. */
export async function setConnectorEnabledAction(
  _previous: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const connectorKey = String(formData.get("connectorKey") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const entry = findConnector(connectorKey);
  if (!entry) return { ok: false, message: "Unknown connector." };

  try {
    const { workspaceId } = await workspaceScope();
    await setConnectorEnabled(getSupabaseAdminClient(), { workspaceId, connectorKey, enabled });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't update the connector." };
  }

  revalidatePath("/settings");
  return { ok: true, message: enabled ? `${entry.label} enabled.` : `${entry.label} disabled.` };
}

/** Probe the stored key with a tiny live search; record the result. */
export async function testConnectorAction(
  _previous: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const connectorKey = String(formData.get("connectorKey") ?? "");
  const entry = findConnector(connectorKey);
  if (!entry) return { ok: false, message: "Unknown connector." };

  if (connectorKey === "higgsfield") {
    let workspaceId: string;
    try {
      ({ workspaceId } = await workspaceScope());
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "No workspace." };
    }
    const client = getSupabaseAdminClient();
    const ref = await resolveConnectorCredentialRef(client, workspaceId, connectorKey);
    const raw = ref ? await readConnectorCredential(client, ref) : null;
    if (!raw) {
      await recordConnectorTest(client, { workspaceId, connectorKey, result: { ok: false, error: "No credential stored." } }).catch(() => undefined);
      revalidatePath("/settings");
      return { ok: false, message: "Connect and enable Higgsfield first." };
    }
    const cred = parseConnectorCredential(raw);
    const access = cred.kind === "oauth_refresh" ? await ensureFreshAccessToken(client, ref, cred) : { ok: true as const, accessToken: cred.token };
    if (!access.ok) {
      await recordConnectorTest(client, { workspaceId, connectorKey, result: { ok: false, error: "Token refresh failed — reconnect Higgsfield." } }).catch(() => undefined);
      revalidatePath("/settings");
      return { ok: false, message: "Higgsfield token expired — reconnect required." };
    }
    const health = await checkHiggsfieldToken(access.accessToken);
    await recordConnectorTest(client, { workspaceId, connectorKey, result: health }).catch(() => undefined);
    revalidatePath("/settings");
    return health.ok ? { ok: true, message: `${entry.label} is healthy.` } : { ok: false, message: health.error ?? "Health check failed." };
  }

  if (connectorKey !== "gemini-research") return { ok: false, message: "No live test for this connector yet." };

  const client = getSupabaseAdminClient();
  let workspaceId: string;
  try {
    ({ workspaceId } = await workspaceScope());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No workspace." };
  }

  const ref = await resolveConnectorCredentialRef(client, workspaceId, connectorKey);
  const key = ref ? await readConnectorCredential(client, ref) : null;
  if (!key) {
    await recordConnectorTest(client, { workspaceId, connectorKey, result: { ok: false, error: "No key stored or connector disabled." } }).catch(() => undefined);
    revalidatePath("/settings");
    return { ok: false, message: "Connect and enable the connector first." };
  }

  try {
    await searchWebWithGemini({ query: "connection test", apiKey: key });
    await recordConnectorTest(client, { workspaceId, connectorKey, result: { ok: true } });
    revalidatePath("/settings");
    return { ok: true, message: `${entry.label} key is healthy.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test failed.";
    await recordConnectorTest(client, { workspaceId, connectorKey, result: { ok: false, error: message } }).catch(() => undefined);
    revalidatePath("/settings");
    return { ok: false, message };
  }
}
