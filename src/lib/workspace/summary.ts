import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { getBusinessProfile, listPersonaDefinitions } from "@/lib/brand-kit/persistence";
import { getBusinessContext } from "@/lib/brand-kit/read-model";
import { listWorkspaceConnectors } from "@/lib/connectors/read-model";
import { countActiveApprovals } from "@/lib/approvals/read-model";
import { listAvailableArcMedia } from "@/lib/media-library/arc-handoff";

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

/** Bounded media snapshot — a count proxy, not a full library scan. */
const MEDIA_SNAPSHOT_LIMIT = 100;

/** Degraded snapshot returned when Supabase isn't configured — never throws. */
const NEUTRAL_WORKSPACE_SUMMARY: WorkspaceSummary = {
  brandKit: "none",
  connectors: { connected: 0, total: 0 },
  mediaAvailable: 0,
  pendingApprovals: 0,
  personas: 0,
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
  client?: SupabaseClient,
): Promise<WorkspaceSummary> {
  if (!isSupabaseAdminConfigured()) return { ...NEUTRAL_WORKSPACE_SUMMARY };
  const db = client ?? getSupabaseAdminClient();
  const [profile, connectors, approvals, personas, media] = await Promise.all([
    safe(() => getBusinessProfile(orgId), null),
    safe(() => listWorkspaceConnectors(db, workspaceId), []),
    safe(() => countActiveApprovals(orgId, db), 0),
    safe(() => listPersonaDefinitions(orgId), []),
    safe(() => listAvailableArcMedia(orgId, { limit: MEDIA_SNAPSHOT_LIMIT }, db), []),
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
  client?: SupabaseClient,
): Promise<WorkspaceSettingsDetail> {
  if (!isSupabaseAdminConfigured()) {
    return {
      ...NEUTRAL_WORKSPACE_SUMMARY,
      connectorList: [],
      personaList: [],
      compliance: { disallowedClaims: [], complianceNotes: "" },
      identity: { tagline: null, websiteUrl: null, serviceAreas: [] },
    };
  }
  const db = client ?? getSupabaseAdminClient();
  const summary = await getWorkspaceSummary(orgId, workspaceId, db);
  const [connectors, personas, context] = await Promise.all([
    safe(() => listWorkspaceConnectors(db, workspaceId), []),
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
