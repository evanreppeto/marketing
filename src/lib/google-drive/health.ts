import { getCurrentOrgId } from "@/lib/auth/org";
import { getOperatorActor } from "@/lib/auth/operator";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { getGoogleDriveConnection, type GoogleDriveConnectionRow } from "./connection";
import { resolveGoogleDriveConfig, resolveGoogleDrivePickerConfig, type GoogleDriveConfig, type GoogleDrivePickerConfig } from "./oauth";
import { listGoogleDriveSources, type GoogleDriveSourceView } from "./sources";

export type GoogleDriveHealthTone = "green" | "amber" | "red" | "blue" | "gray";
export type GoogleDriveHealthStatus = "healthy" | "ready" | "attention" | "blocked";
export type GoogleDriveHealthCheck = {
  key: "oauth" | "redirect" | "picker" | "operator" | "sources" | "sync";
  label: string;
  tone: GoogleDriveHealthTone;
  status: "ok" | "info" | "attention" | "blocked";
  detail: string;
};
export type GoogleDriveSourceHealth = {
  id: string;
  label: string;
  status: GoogleDriveSourceView["status"];
  tone: GoogleDriveHealthTone;
  lastSyncedAt: string | null;
  lastImportedCount: number;
  lastError: string | null;
};
export type GoogleDriveHealth = {
  status: GoogleDriveHealthStatus;
  tone: GoogleDriveHealthTone;
  label: string;
  summary: string;
  connectedEmail: string | null;
  connectedAt: string | null;
  lastImportAt: string | null;
  lastError: string | null;
  redirectUri: string;
  missingOAuthEnv: string[];
  missingPickerEnv: string[];
  sourceCount: number;
  errorSourceCount: number;
  sources: GoogleDriveSourceHealth[];
  checks: GoogleDriveHealthCheck[];
};

function sourceTone(status: GoogleDriveSourceView["status"]): GoogleDriveHealthTone {
  if (status === "active") return "green";
  if (status === "error") return "red";
  return "amber";
}

function sourceLabel(source: GoogleDriveSourceView): string {
  return source.driveFolderName || source.driveFolderId;
}

function mapSource(source: GoogleDriveSourceView): GoogleDriveSourceHealth {
  return {
    id: source.id,
    label: sourceLabel(source),
    status: source.status,
    tone: sourceTone(source.status),
    lastSyncedAt: source.lastSyncedAt,
    lastImportedCount: source.lastImportedCount,
    lastError: source.lastError,
  };
}

export function buildGoogleDriveHealth(input: {
  oauth: GoogleDriveConfig;
  picker: GoogleDrivePickerConfig;
  connection: GoogleDriveConnectionRow | null;
  sources?: GoogleDriveSourceView[];
  connectionError?: string | null;
  sourceError?: string | null;
}): GoogleDriveHealth {
  const sources = (input.sources ?? []).map(mapSource);
  const errorSourceCount = sources.filter((source) => source.status === "error").length;
  const sourceError = input.sourceError ?? null;
  const connectionError = input.connectionError ?? null;
  const lastError = input.connection?.last_error ?? connectionError ?? sourceError ?? null;
  const operatorConnected = Boolean(input.connection);

  const checks: GoogleDriveHealthCheck[] = [
    input.oauth.ok
      ? {
          key: "oauth",
          label: "OAuth app",
          tone: "green",
          status: "ok",
          detail: "Client ID and secret are present.",
        }
      : {
          key: "oauth",
          label: "OAuth app",
          tone: "red",
          status: "blocked",
          detail: `Missing ${input.oauth.missing.join(", ")}.`,
        },
    {
      key: "redirect",
      label: "Redirect URI",
      tone: "blue",
      status: "info",
      detail: input.oauth.redirectUri,
    },
    input.picker.ok
      ? {
          key: "picker",
          label: "Drive picker",
          tone: "green",
          status: "ok",
          detail: "Picker API key and app ID are present.",
        }
      : {
          key: "picker",
          label: "Drive picker",
          tone: "amber",
          status: "attention",
          detail: `Missing ${input.picker.missing.join(", ")}.`,
        },
    operatorConnected
      ? {
          key: "operator",
          label: "Operator account",
          tone: "green",
          status: "ok",
          detail: input.connection?.connected_email
            ? `Connected as ${input.connection.connected_email}.`
            : "This operator has a saved Drive refresh token.",
        }
      : {
          key: "operator",
          label: "Operator account",
          tone: "red",
          status: "blocked",
          detail: connectionError ?? "No Drive account is connected for this operator yet.",
        },
    sources.length > 0
      ? {
          key: "sources",
          label: "Saved folders",
          tone: "green",
          status: "ok",
          detail: `${sources.length} Drive folder source${sources.length === 1 ? "" : "s"} saved for repeat imports.`,
        }
      : {
          key: "sources",
          label: "Saved folders",
          tone: "amber",
          status: "attention",
          detail: sourceError ?? "No reusable Drive folders are saved yet.",
        },
    errorSourceCount > 0 || lastError
      ? {
          key: "sync",
          label: "Last sync",
          tone: "red",
          status: "attention",
          detail:
            lastError ??
            `${errorSourceCount} saved folder source${errorSourceCount === 1 ? " needs" : "s need"} attention.`,
        }
      : sources.some((source) => source.lastSyncedAt)
        ? {
            key: "sync",
            label: "Last sync",
            tone: "green",
            status: "ok",
            detail: "Saved Drive folders have synced without a recorded error.",
          }
        : {
            key: "sync",
            label: "Last sync",
            tone: "blue",
            status: "info",
            detail: "No folder sync has run yet.",
          },
  ];

  let status: GoogleDriveHealthStatus = "healthy";
  if (!input.oauth.ok || !operatorConnected) status = "blocked";
  else if (!input.picker.ok || errorSourceCount > 0 || lastError) status = "attention";
  else if (sources.length === 0) status = "ready";

  const label =
    status === "healthy"
      ? "Healthy"
      : status === "ready"
        ? "Connected"
        : status === "attention"
          ? "Needs attention"
          : "Blocked";
  const tone: GoogleDriveHealthTone =
    status === "healthy" ? "green" : status === "ready" ? "blue" : status === "attention" ? "amber" : "red";
  const summary =
    status === "healthy"
      ? "Drive is connected, Picker is configured, and saved sources are ready."
      : status === "ready"
        ? "Drive is connected. Save a folder source from Library to make repeat imports easier."
        : status === "attention"
          ? "Drive can connect, but one setup or sync item still needs cleanup."
          : "Drive cannot be used until the blocked setup items are fixed.";

  return {
    status,
    tone,
    label,
    summary,
    connectedEmail: input.connection?.connected_email ?? null,
    connectedAt: input.connection?.connected_at ?? null,
    lastImportAt: input.connection?.last_import_at ?? null,
    lastError,
    redirectUri: input.oauth.redirectUri,
    missingOAuthEnv: input.oauth.ok ? [] : input.oauth.missing,
    missingPickerEnv: input.picker.ok ? [] : input.picker.missing,
    sourceCount: sources.length,
    errorSourceCount,
    sources,
    checks,
  };
}

export async function loadGoogleDriveHealth(): Promise<GoogleDriveHealth> {
  const oauth = resolveGoogleDriveConfig();
  const picker = resolveGoogleDrivePickerConfig();

  if (!isSupabaseAdminConfigured()) {
    return buildGoogleDriveHealth({
      oauth,
      picker,
      connection: null,
      sources: [],
      connectionError: "Supabase is not configured, so operator Drive connections cannot be read.",
    });
  }

  const orgId = await getCurrentOrgId();
  const connectedBy = getOperatorActor();
  let connection: GoogleDriveConnectionRow | null = null;
  let connectionError: string | null = null;
  let sources: GoogleDriveSourceView[] = [];
  let sourceError: string | null = null;

  try {
    connection = await getGoogleDriveConnection(orgId, connectedBy);
  } catch (error) {
    connectionError = error instanceof Error ? error.message : "Drive connection lookup failed.";
  }

  try {
    sources = await listGoogleDriveSources({ orgId, connectedBy });
  } catch (error) {
    sourceError = error instanceof Error ? error.message : "Drive source lookup failed.";
  }

  return buildGoogleDriveHealth({ oauth, picker, connection, sources, connectionError, sourceError });
}
