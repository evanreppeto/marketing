"use server";

import { revalidatePath } from "next/cache";

import { connectorIsAvailable, findConnector, isWeatherServiceAreaConfigured, parseWeatherServiceArea } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getConnectorConfig, setConnectorConfig } from "@/lib/connectors/config";
import { readConnectorCredential, writeConnectorCredential } from "@/lib/connectors/credentials";
import { checkConnectorCredential } from "@/lib/connectors/health";
import { runCrmImport } from "@/lib/connectors/import";
import { checkHubspotConnection } from "@/lib/integrations/crm/hubspot";
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
  if (!connectorIsAvailable(connector)) {
    return { ok: false, error: `${connector.label} isn't built yet — it can't be connected or switched on.` };
  }
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
  // Deliberately NOT availability-gated. Every other mutation here refuses a
  // `planned` connector, but disconnect is the undo direction: if a stale row from
  // before it was marked planned still says enabled, the operator must be able to
  // clear it. A guard here would lock that row in place with no way out.

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
  if (!connectorIsAvailable(connector)) {
    return { ok: false, error: `${connector.label} isn't built yet — it can't be connected or switched on.` };
  }
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
      // Say what's missing rather than probing somewhere arbitrary and reporting a
      // live alert count for a place this workspace never asked about.
      if (!isWeatherServiceAreaConfigured(area)) {
        return { ok: false, error: "Set a service area first (e.g. IL, WI) — NWS needs to know where to watch." };
      }
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

    // CRM import: a real HubSpot probe that also reports how many contacts an
    // import would see, so Test connection returns record counts (BSR-368).
    if (connector.key === "hubspot-import") {
      const hs = await checkHubspotConnection(plaintext);
      await recordConnectorTest(client, { workspaceId, connectorKey: connector.key, result: { ok: hs.ok, error: hs.error } });
      revalidatePath("/settings");
      if (!hs.ok) return { ok: false, error: `Test failed: ${hs.error ?? "HubSpot unreachable"}` };
      const countNote = typeof hs.count === "number" ? `${hs.count} contact(s) available to import` : "contacts available to import";
      return { ok: true, persisted: true, message: `HubSpot reachable — ${countNote}.` };
    }

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
  if (!connectorIsAvailable(connector)) {
    return { ok: false, error: `${connector.label} isn't built yet — it can't be connected or switched on.` };
  }

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
  if (!connectorIsAvailable(connector)) {
    return { ok: false, error: `${connector.label} isn't built yet — it can't be connected or switched on.` };
  }

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) return { ok: false, error: "No active workspace." };

  try {
    const client = getSupabaseAdminClient();
    // MERGE, don't replace. setConnectorConfig writes the whole `config` jsonb, and a
    // connector can expose more than one field (weather takes states AND points), each
    // with its own Save. Replacing would make saving one field silently wipe the other.
    // Read-then-merge here rather than in setConnectorConfig, so that stays a plain
    // setter and this partial-update intent is explicit.
    const existing = await getConnectorConfig(client, ctx.workspaceId, connector.key);
    await setConnectorConfig(client, {
      workspaceId: ctx.workspaceId,
      orgId: ctx.orgId ?? null,
      connectorKey: connector.key,
      config: { ...existing, ...input.config },
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the connector config." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: `${connector.label} settings saved.` };
}

/**
 * Explicit operator-triggered CRM import (BSR-368). Import is a read-IN action that
 * writes CRM rows through the gated ingest path, so it runs ONLY on this deliberate
 * operator click — never automatically. Idempotent on the HubSpot record id (a
 * re-run updates, never duplicates), and org-scoped. Reports a per-run summary.
 */
export async function runConnectorImport(input: { connectorKey: string }): Promise<SettingsWriteResult> {
  await requireOperator();

  const connector = findConnector(input.connectorKey);
  if (!connector || connector.kind !== "import_source") return { ok: false, error: "Not an import connector." };
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "Connect this workspace to run an import." };

  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId || !ctx.orgId) return { ok: false, error: "No active workspace." };

  try {
    const outcome = await runCrmImport({ workspaceId: ctx.workspaceId, orgId: ctx.orgId });
    if (!outcome.ok) return { ok: false, error: importErrorMessage(outcome.error) };
    revalidatePath("/settings");
    const r = outcome.result;
    const enrichNote = outcome.enrichmentEnabled ? ` · ${r.enriched} enriched` : "";
    return {
      ok: true,
      persisted: true,
      message: `Import complete — ${r.imported} new, ${r.updated} updated, ${r.skipped} skipped${enrichNote}.`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not run the import." };
  }
}

function importErrorMessage(code: string): string {
  switch (code) {
    case "hubspot_import_not_connected":
      return "Connect + enable HubSpot CRM Import first.";
    case "missing_credential":
      return "No HubSpot credential stored — connect HubSpot first.";
    case "missing_default_persona":
      return "Set a Default persona in the connector config before importing.";
    case "not_configured":
      return "Connect this workspace to run an import.";
    default:
      return `Import failed: ${code}`;
  }
}
