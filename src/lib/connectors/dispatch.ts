import { type SupabaseClient } from "@supabase/supabase-js";

import { findConnector } from "@/domain";

import "./builtin"; // ensure the built-in channels are registered
import { getConnectorConfig } from "./config";
import { readConnectorCredential } from "./credentials";
import { resolveConnectorCredentialRef } from "./read-model";
import { getChannel, type ChannelDispatchPayload, type ChannelDispatchResult } from "./registry";

// ---------------------------------------------------------------------------
// The ONE entry point for channel sends (BSR-363). It is called exclusively by
// the approved-send path and REFUSES to run without an approvalId — the proof a
// human cleared the gate. Nothing in this repo calls it automatically. Keeping
// every send behind this function is how "channel connectors never auto-send"
// stays true as new channels are added.
// ---------------------------------------------------------------------------

export type ApprovedDispatchInput = {
  client: SupabaseClient;
  orgId: string;
  workspaceId: string;
  connectorKey: string;
  /** The approval that authorised this send. Required — no approval, no send. */
  approvalId: string;
  payload: ChannelDispatchPayload;
};

export async function dispatchThroughApprovedChannel(input: ApprovedDispatchInput): Promise<ChannelDispatchResult> {
  if (!input.approvalId || !input.approvalId.trim()) {
    return { ok: false, error: "Refusing to dispatch: channel sends are human-gated and require an approval." };
  }

  const entry = findConnector(input.connectorKey);
  if (!entry || entry.kind !== "channel") {
    return { ok: false, error: "Not a channel connector." };
  }

  const channel = getChannel(input.connectorKey);
  if (!channel) {
    return { ok: false, error: "No channel behaviour is registered for this connector." };
  }

  const config = await getConnectorConfig(input.client, input.workspaceId, input.connectorKey);
  const ref = await resolveConnectorCredentialRef(input.client, input.workspaceId, input.connectorKey);
  const credential = ref ? await readConnectorCredential(input.client, ref) : null;

  return channel.dispatch({
    client: input.client,
    orgId: input.orgId,
    workspaceId: input.workspaceId,
    approvalId: input.approvalId,
    payload: input.payload,
    config,
    credential,
  });
}
