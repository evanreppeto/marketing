import { type SupabaseClient } from "@supabase/supabase-js";

import {
  effectiveCostTier,
  findConnector,
  supportsPlatformCredits,
  type ConnectorCostTier,
  type ConnectorCredentialSource,
} from "@/domain";

import { platformCredentialFor, readConnectorCredential } from "./credentials";
import { resolveConnectorCredentialRef } from "./read-model";

/**
 * The ONE way a connector call resolves its credential — the dual credential
 * model in code (mirrors the Resend send path's `stored key, else env key`):
 *
 *   1. The workspace's own Vault credential (BYO) — their provider account,
 *      their billing, bypasses metering.
 *   2. The platform's key (`entry.platformEnvVar`) — bundled credits; the call
 *      runs METERED against the workspace's plan (spend caps in metering.ts).
 *   3. Neither — an honest refusal reason, never a silent fallback.
 *
 * Callers get the resolved cost tier alongside the key so metering governance
 * can never disagree with the credential source that was actually used.
 */
export type ResolvedConnectorCredential = {
  source: ConnectorCredentialSource;
  credential: string | null;
  costTier: ConnectorCostTier;
  /** Present only when source is "none" — why nothing resolved. */
  reason?: string;
};

export async function resolveConnectorCredential(
  input: { connectorKey: string; workspaceId: string },
  client: SupabaseClient,
): Promise<ResolvedConnectorCredential> {
  const entry = findConnector(input.connectorKey);
  if (!entry) {
    return { source: "none", credential: null, costTier: "free", reason: `Unknown connector: ${input.connectorKey}` };
  }

  if (entry.credentialSchema.kind === "none") {
    return { source: "none", credential: null, costTier: effectiveCostTier(entry, "none") };
  }

  const ref = await resolveConnectorCredentialRef(client, input.workspaceId, entry.key);
  const stored = ref ? await readConnectorCredential(client, ref) : null;
  if (stored) {
    return { source: "byo", credential: stored, costTier: effectiveCostTier(entry, "byo") };
  }

  const platform = platformCredentialFor(entry);
  if (platform) {
    return { source: "platform", credential: platform, costTier: effectiveCostTier(entry, "platform") };
  }

  return {
    source: "none",
    credential: null,
    costTier: effectiveCostTier(entry, "none"),
    reason: supportsPlatformCredits(entry)
      ? `No workspace credential is stored and the deployment does not set ${entry.platformEnvVar}.`
      : "No workspace credential is stored for this connector.",
  };
}
