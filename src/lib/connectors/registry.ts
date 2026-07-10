import { type SupabaseClient } from "@supabase/supabase-js";

import type { OpportunityCandidate } from "@/domain";

// ---------------------------------------------------------------------------
// Runtime connector registry (BSR-363). The pure metadata for every connector
// lives in `src/domain/connectors.ts` (CONNECTOR_REGISTRY). This module holds
// the *behaviour* keyed back to those `key`s: a signal_source's detect() and a
// channel's dispatch(). Connectors self-register via registerSignalSource /
// registerChannel (see src/lib/connectors/builtin/*). Keeping behaviour here —
// not in domain/ — respects the layering rule: I/O never lives in domain/.
//
// Guardrails baked into the types:
//   • signal_source is READ-ONLY. detect() returns candidates; the caller (the
//     detection orchestrator) is the only thing that writes, and only to
//     `opportunities` via upsertOpportunities.
//   • channel NEVER auto-sends. dispatch() is invoked exclusively by the
//     approved-send path (see src/lib/connectors/dispatch.ts), which refuses to
//     run without an approvalId.
// ---------------------------------------------------------------------------

/** Context handed to a signal source's detect(). Read-only by contract. */
export type SignalDetectContext = {
  /** Service-role client for reads. detect() must not write anything. */
  client: SupabaseClient;
  orgId: string;
  workspaceId: string;
  /** ISO "now" so detection stays deterministic/testable. */
  now: string;
  /** Per-workspace connector config from workspace_connectors.config. */
  config: Record<string, unknown>;
};

/** A read-only opportunity signal source. */
export type SignalSourceConnector = {
  /** Must match a CONNECTOR_REGISTRY entry with kind: "signal_source". */
  key: string;
  /** Propose opportunities. Pure/read-only — never writes, never sends. */
  detect(ctx: SignalDetectContext): Promise<OpportunityCandidate[]> | OpportunityCandidate[];
};

/** The approved message payload a channel is asked to dispatch. */
export type ChannelDispatchPayload = {
  /** e.g. "email" | "sms" | "webhook" — informational; the channel owns delivery. */
  medium?: string;
  subject?: string;
  body: string;
  /** Resolved destination(s) for this send (already approved). */
  to?: string[];
  /** Free-form extras (endpoint overrides, template ids, …). */
  meta?: Record<string, unknown>;
};

/** Everything a channel needs to perform ONE approved send. */
export type ChannelDispatchInput = {
  client: SupabaseClient;
  orgId: string;
  workspaceId: string;
  /**
   * The approval record that authorised this send. Its presence is the proof
   * the human gate was cleared; dispatch.ts refuses to proceed without it.
   */
  approvalId: string;
  payload: ChannelDispatchPayload;
  /** Per-workspace connector config (endpoint URL, etc). */
  config: Record<string, unknown>;
  /** Decrypted credential if the connector needs one, else null. */
  credential: string | null;
};

export type ChannelDispatchResult = { ok: true; providerRef?: string } | { ok: false; error: string };

/** An outbound channel. dispatch() is called ONLY by the approved-send path. */
export type ChannelConnector = {
  /** Must match a CONNECTOR_REGISTRY entry with kind: "channel". */
  key: string;
  dispatch(input: ChannelDispatchInput): Promise<ChannelDispatchResult>;
};

const signalSources = new Map<string, SignalSourceConnector>();
const channels = new Map<string, ChannelConnector>();

export function registerSignalSource(connector: SignalSourceConnector): void {
  signalSources.set(connector.key, connector);
}

export function registerChannel(connector: ChannelConnector): void {
  channels.set(connector.key, connector);
}

export function getSignalSource(key: string): SignalSourceConnector | null {
  return signalSources.get(key) ?? null;
}

export function getChannel(key: string): ChannelConnector | null {
  return channels.get(key) ?? null;
}

export function listSignalSources(): SignalSourceConnector[] {
  return [...signalSources.values()];
}

export function listChannels(): ChannelConnector[] {
  return [...channels.values()];
}

/** Test/reset helper — clears every registration. */
export function __clearRegistryForTests(): void {
  signalSources.clear();
  channels.clear();
}
