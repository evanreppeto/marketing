import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { runSignalSourceDetection } from "@/lib/connectors/detection";

import {
  runColdLeadDetection,
  runCompetitorSignalDetection,
  runNextIterationDetection,
  runWeatherEventDetection,
} from "./detector";

/**
 * Run every deterministic opportunity detector for the current workspace, best-effort.
 * Shared by the operator "Scan" button (scanForOpportunitiesAction) and the scheduled
 * cron so both surface the same source-backed opportunities — cold CRM leads, ingested
 * weather alerts, captured competitor flights, and campaigns whose results warrant a
 * next iteration — plus every enabled signal_source connector.
 *
 * Read-only: detection never contacts anyone or drafts anything. Each source is
 * best-effort so one failing detector can't sink the others, and the whole pass is
 * idempotent (upsert per-subject dedup), which is what makes it safe to run daily.
 *
 * Org/workspace scope comes from the ambient request context: an operator session
 * for the button, or the default workspace for the unauthenticated cron. (The
 * scheduled scan therefore covers the default workspace only — multi-tenant fan-out
 * would iterate workspaces here, matching the single-tenant generative scan today.)
 */
export async function runDeterministicOpportunityScan(): Promise<void> {
  const swallow = () => {
    // best-effort — a failing source just leaves the inbox unchanged
  };
  // Connector detection needs the workspace id; the CRM/weather/competitor/next-
  // iteration detectors self-scope through getCurrentOrgId().
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  await Promise.all([
    runColdLeadDetection().catch(swallow),
    runWeatherEventDetection().catch(swallow),
    runCompetitorSignalDetection().catch(swallow),
    runNextIterationDetection().catch(swallow),
    ctx?.workspaceId
      ? runSignalSourceDetection({ workspaceId: ctx.workspaceId, orgId: ctx.orgId }).catch(swallow)
      : Promise.resolve(),
  ]);
}
