import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getBusinessProfile, listPersonaDefinitions } from "@/lib/brand-kit/persistence";
import { getBusinessContext } from "@/lib/brand-kit/read-model";
import { listWorkspaceConnectors } from "@/lib/connectors/read-model";
import { countActiveApprovals } from "@/lib/approvals/read-model";
import { listAvailableArcMedia } from "@/lib/media-library/arc-handoff";

/** Bounded media snapshot — a count proxy, not a full library scan. */
const MEDIA_SNAPSHOT_LIMIT = 100;

export type WorkspaceSummary = {
  brandKit: "active" | "draft" | "none";
  connectors: { connected: number; total: number };
  mediaAvailable: number;
  pendingApprovals: number;
  personas: number;
};

export type WorkspaceSettingsDetail = WorkspaceSummary & {
  connectorList: Array<{ key: string; label: string; status: string; connected: boolean; lastTestOk: boolean | null }>;
  personaList: Array<{ key: string; label: string; isActive: boolean }>;
  compliance: { disallowedClaims: string[]; complianceNotes: string };
  identity: { tagline: string | null; websiteUrl: string | null; serviceAreas: string[] };
};

/** Resolve a piece of the summary, swallowing its error to a fallback so one
 *  unavailable source never sinks the whole snapshot. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function getWorkspaceSummary(
  orgId: string,
  workspaceId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<WorkspaceSummary> {
  const [profile, connectors, approvals, personas, media] = await Promise.all([
    safe(() => getBusinessProfile(orgId), null),
    safe(() => listWorkspaceConnectors(client, workspaceId), []),
    safe(() => countActiveApprovals(orgId, client), 0),
    safe(() => listPersonaDefinitions(orgId), []),
    safe(() => listAvailableArcMedia(orgId, { limit: MEDIA_SNAPSHOT_LIMIT }, client), []),
  ]);

  return {
    brandKit: profile ? profile.status : "none",
    connectors: {
      connected: connectors.filter((c) => c.credentialPresent).length,
      total: connectors.length,
    },
    mediaAvailable: media.length,
    pendingApprovals: approvals,
    personas: personas.length,
  };
}

export async function getWorkspaceSettingsDetail(
  orgId: string,
  workspaceId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<WorkspaceSettingsDetail> {
  const summary = await getWorkspaceSummary(orgId, workspaceId, client);
  const [connectors, personas, context] = await Promise.all([
    safe(() => listWorkspaceConnectors(client, workspaceId), []),
    safe(() => listPersonaDefinitions(orgId), []),
    safe(() => getBusinessContext(orgId), null),
  ]);

  return {
    ...summary,
    connectorList: connectors.map((c) => ({
      key: c.key,
      label: c.label,
      status: c.status,
      connected: c.credentialPresent,
      lastTestOk: c.lastTestOk,
    })),
    personaList: personas.map((p) => ({ key: p.key, label: p.label, isActive: p.isActive })),
    compliance: context
      ? { disallowedClaims: context.guardrails.disallowedClaims, complianceNotes: context.guardrails.complianceNotes }
      : { disallowedClaims: [], complianceNotes: "" },
    identity: context
      ? { tagline: context.tagline, websiteUrl: context.websiteUrl, serviceAreas: context.serviceAreas }
      : { tagline: null, websiteUrl: null, serviceAreas: [] },
  };
}
