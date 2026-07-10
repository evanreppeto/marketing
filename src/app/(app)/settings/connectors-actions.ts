"use server";

import { revalidatePath } from "next/cache";

import { connectorIsAvailable, findConnector, parseWeatherServiceArea } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getConnectorConfig, setConnectorConfig } from "@/lib/connectors/config";
import { readConnectorCredential, writeConnectorCredential } from "@/lib/connectors/credentials";
import { checkConnectorCredential } from "@/lib/connectors/health";
import { checkNwsConnection } from "@/lib/integrations/weather/nws-source";
import {
  disconnectConnector as disconnectConnectorRow,
  recordConnectorTest,
  setConnectorCredentialRef,
  setConnectorEnabled as setConnectorEnabledRow,
  upsertConnectorEnabled,
} from "@/lib/connectors/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { type SupabaseClient } from "@supabase/supabase-js";

import type { SettingsWriteResult } from "./actions";

/**
 * Operator-side connect flow for the real workspace connectors (Gemini research,
 * Higgsfield). The credential (API key / token) is written to the Vault via
 * create_secret; the workspace_connectors row stores only the returned ref +
 * enable switch — the plaintext never touches the row and is never echoed to the
 * browser. The runner later reads it through GET /api/v1/arc/connectors. Nothing
 * here goes outbound; a connected connector still only acts under approval.
 */
export async function connectConnector(input: {
  connectorKey: string;
  credential: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();

  const connector = findConnector(input.connectorKey);
  if (!connector) return { ok: false, error: "Unknown connector." };
  if (!connectorIsAvailable(connector)) return { ok: false, error: `${connector.label} isn't available yet.` };
  const credential = (input.credential ?? "").trim();
  if (!credential) return { ok: false, error: "Paste a credential to connect." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) return { ok: false, error: "No active workspace to connect into." };

  try {
    const client = getSupabaseAdminClient();
    const credentialRef = await writeConnectorCredential(client, {
      workspaceId: ctx.workspaceId,
      connectorKey: connector.key,
      plaintext: credential,
    });
    await setConnectorCredentialRef(client, {
      workspaceId: ctx.workspaceId,
      orgId: ctx.orgId ?? null,
      connectorKey: connector.key,
      credentialRef,
    });
    await setConnectorEnabledRow(client, { workspaceId: ctx.workspaceId, connectorKey: connector.key, enabled: true });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not connect." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: `${connector.label} connected.` };
}

export async function disconnectConnector(input: { connectorKey: string }): Promise<SettingsWriteResult> {
  await requireOperator();

  const connector = findConnector(input.connectorKey);
  if (!connector) return { ok: false, error: "Unknown connector." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) return { ok: false, error: "No active workspace." };

  try {
    await disconnectConnectorRow(getSupabaseAdminClient(), { workspaceId: ctx.workspaceId, connectorKey: connector.key });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not disconnect." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: `${connector.label} disconnected.` };
}

/**
 * Test a connected connector. Credentialed connectors read their stored Vault
 * secret and make a real minimal provider call (Higgsfield balance / Gemini
 * models). No-credential signal sources with a connectivity probe (weather-signals
 * → live NWS/NOAA) instead hit the source with the workspace's configured service
 * area and report the current active-alert count. Either way the outcome is
 * recorded on the row. ok:true = healthy; ok:false = failed/unavailable.
 */
export async function testConnector(input: { connectorKey: string }): Promise<SettingsWriteResult> {
  await requireOperator();

  const connector = findConnector(input.connectorKey);
  if (!connector) return { ok: false, error: "Unknown connector." };
  if (!connectorIsAvailable(connector)) return { ok: false, error: `${connector.label} isn't available yet.` };
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Connect this workspace to test the connection." };

  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) return { ok: false, error: "No active workspace." };
  const workspaceId = ctx.workspaceId;

  // No-credential connectivity probe: the NWS weather source. Reads the
  // per-workspace service area and returns the live active-alert count.
  if (connector.key === "weather-signals") {
    try {
      const client = getSupabaseAdminClient();
      const config = await getConnectorConfig(client, workspaceId, connector.key);
      const area = parseWeatherServiceArea(config);
      const result = await checkNwsConnection(area);
      await recordConnectorTest(client, {
        workspaceId,
        connectorKey: connector.key,
        result: { ok: result.ok, error: result.error },
      });
      revalidatePath("/settings");
      if (!result.ok) return { ok: false, error: `Test failed: ${result.error ?? "NWS unreachable"}` };
      const areaLabel = area.states.length ? area.states.join(", ") : `${area.points.length} point(s)`;
      const forecastNote = result.forecast ? ` · ${result.forecast}` : "";
      return {
        ok: true,
        persisted: true,
        message: `NWS reachable — ${result.count ?? 0} active alert(s) for ${areaLabel}${forecastNote}.`,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not run the test." };
    }
  }

  try {
    const client = getSupabaseAdminClient();
    const { data } = await (client as unknown as SupabaseClient)
      .from("workspace_connectors")
      .select("credential_ref")
      .eq("workspace_id", workspaceId)
      .eq("connector_key", connector.key)
      .maybeSingle<{ credential_ref: string | null }>();
    const ref = data?.credential_ref ?? null;
    if (!ref) return { ok: false, error: "No credential to test — connect the connector first." };

    const plaintext = await readConnectorCredential(client, ref);
    if (!plaintext) return { ok: false, error: "Stored credential could not be read." };

    const result = await checkConnectorCredential(connector.key, plaintext);
    await recordConnectorTest(client, { workspaceId, connectorKey: connector.key, result });
    revalidatePath("/settings");

    return result.ok
      ? { ok: true, persisted: true, message: `${connector.label} connection is healthy.` }
      : { ok: false, error: `Test failed: ${result.error ?? "unknown error"}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not run the test." };
  }
}

export async function toggleConnectorEnabled(input: {
  connectorKey: string;
  enabled: boolean;
}): Promise<SettingsWriteResult> {
  await requireOperator();

  const connector = findConnector(input.connectorKey);
  if (!connector) return { ok: false, error: "Unknown connector." };
  if (!connectorIsAvailable(connector)) return { ok: false, error: `${connector.label} isn't available yet.` };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) return { ok: false, error: "No active workspace." };

  try {
    // Upsert, not update: no-credential connectors (e.g. a public signal source)
    // have no connect step to seed the row, so enabling must create it.
    await upsertConnectorEnabled(getSupabaseAdminClient(), {
      workspaceId: ctx.workspaceId,
      orgId: ctx.orgId ?? null,
      connectorKey: connector.key,
      enabled: input.enabled,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the connector." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: input.enabled ? `${connector.label} enabled.` : `${connector.label} paused.` };
}

/**
 * Save a connector's per-workspace config (e.g. a signal source's watched
 * locations, a channel's endpoint). Config lives in workspace_connectors.config;
 * no credential is involved, so this works for no-credential connectors too.
 */
export async function saveConnectorConfig(input: {
  connectorKey: string;
  config: Record<string, unknown>;
}): Promise<SettingsWriteResult> {
  await requireOperator();

  const connector = findConnector(input.connectorKey);
  if (!connector) return { ok: false, error: "Unknown connector." };
  if (!connectorIsAvailable(connector)) return { ok: false, error: `${connector.label} isn't available yet.` };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) return { ok: false, error: "No active workspace." };

  try {
    await setConnectorConfig(getSupabaseAdminClient(), {
      workspaceId: ctx.workspaceId,
      orgId: ctx.orgId ?? null,
      connectorKey: connector.key,
      config: input.config,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the connector config." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: `${connector.label} settings saved.` };
}
