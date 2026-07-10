// Pure, deterministic connector catalog + status math. No I/O. Mirrors the
// shape of connections.ts but is workspace-scoped and credential-based (a key
// stored per workspace) rather than env-var-based.
//
// This module is the tenant-agnostic connector *plugin framework* metadata layer
// (BSR-363). Every connector — whether it exposes a remote MCP tool, a
// signal source that proposes opportunities, or an outbound channel — declares
// one metadata descriptor here. The behavioural side (a signal source's
// detect(), a channel's dispatch()) lives in the runtime registry at
// `src/lib/connectors/registry.ts`, keyed back to the `key` declared here.

export type ConnectorAuthKind = "api_key" | "oauth" | "none";
export type ConnectorAccess = "read_only" | "gated_write";
export type ConnectorStatus = "not_configured" | "disabled" | "error" | "connected";

/**
 * What role a connector plays. Governs how it is loaded and used:
 * - `mcp_tool`      — a remote/native tool Arc can call in draft/act modes.
 * - `signal_source` — read-only; exposes detect() → OpportunityCandidate[] that
 *                     feed the Opportunity inbox via upsertOpportunities.
 * - `channel`       — an outbound medium; exposes dispatch() called ONLY by the
 *                     approved-send path. Never auto-sends.
 */
export type ConnectorKind = "mcp_tool" | "signal_source" | "channel";

/**
 * HYBRID cost model (BSR-372 governs metering later; this layer just carries the
 * field). `free` and `byo_key` bypass metering entirely — the workspace either
 * pays nothing or pays its own provider directly. `metered` is billed by us.
 */
export type ConnectorCostTier = "free" | "byo_key" | "metered";

/**
 * Declares what credential (if any) the operator must supply to connect. `kind`
 * mirrors `authKind`; `optional` means the connector still works without it (so
 * it can be enabled with no credential). `none` connectors need nothing stored.
 */
export type ConnectorCredentialSchema = {
  kind: ConnectorAuthKind;
  /** Field label shown in the connect form (e.g. "Gemini API key"). */
  label?: string;
  /** Helper text under the field. */
  hint?: string;
  /** True when the connector functions without the credential present. */
  optional?: boolean;
};

/**
 * What the connector can actually do, by kind. Purely descriptive — used by the
 * catalog, the runner hand-off, and the Opportunity/approval wiring.
 */
export type ConnectorCapability = {
  /** One-line human summary. */
  summary: string;
  /** signal_source: the opportunity `kind` values detect() may emit. */
  opportunityKinds?: string[];
  /** channel: the outbound medium (email, sms, social_post, webhook, …). */
  channelMedium?: string;
  /** mcp_tool: tool namespaces the server exposes (mirrors toolNamespace). */
  toolNamespaces?: string[];
};

export type ConnectorRegistryEntry = {
  /**
   * Stable catalog identifier — this IS the descriptor `id`. Also the
   * workspace_connectors.connector_key value and the key the runtime registry
   * (detect/dispatch impls) is keyed on. Kept as `key` because it is load-bearing
   * across the DB column, read-model, actions, and tests.
   */
  key: string;
  /** Plugin role — see ConnectorKind. */
  kind: ConnectorKind;
  label: string;
  description: string;
  /** HYBRID cost model tier — carried now, metered governed by BSR-372. */
  costTier: ConnectorCostTier;
  /** Industries this connector is most relevant to. `[]` = universal (all types). */
  verticals: string[];
  /** What the connector does, by kind. */
  capability: ConnectorCapability;
  /** What the operator must supply to connect. */
  credentialSchema: ConnectorCredentialSchema;
  /** Convenience mirror of credentialSchema.kind (widely read by UI/read-model). */
  authKind: ConnectorAuthKind;
  access: ConnectorAccess;
  /**
   * Remote MCP endpoint for connectors loaded into the runner (mcp_tool, Slice B).
   * null for "native" connectors whose capability already lives in-app (Gemini)
   * and for signal_source / channel connectors (no remote MCP server).
   */
  mcpUrl: string | null;
  /** Header that carries the credential for remote MCP connectors. */
  authHeader?: string;
  /** mcpServers map key / tool namespace for remote connectors. */
  toolNamespace: string;
};

export const CONNECTOR_REGISTRY: ConnectorRegistryEntry[] = [
  {
    key: "gemini-research",
    kind: "mcp_tool",
    label: "Gemini (Google AI)",
    description:
      "This workspace's own Gemini API key. Powers grounded web research with citations AND image/video " +
      "generation (Imagen/Veo) — media output always lands as an approval-gated draft asset on your own billing.",
    costTier: "byo_key",
    verticals: [],
    capability: {
      summary: "Grounded web research with citations, plus image/video generation on your own key.",
      toolNamespaces: ["gemini"],
    },
    credentialSchema: {
      kind: "api_key",
      label: "Gemini API key",
      hint: "From Google AI Studio. Powers research + media generation. Stored encrypted in your Vault — never shown again, never sent to the browser.",
    },
    authKind: "api_key",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "gemini",
  },
  {
    key: "higgsfield",
    kind: "mcp_tool",
    label: "Higgsfield",
    description:
      "Cinematic image & video generation, UGC/viral ad variants, and virality prediction on this " +
      "workspace's own Higgsfield credits. Loaded into the runner as a remote MCP; output lands as " +
      "approval-gated draft assets.",
    costTier: "byo_key",
    verticals: [],
    capability: { summary: "Cinematic image & video generation, draft assets only.", toolNamespaces: ["higgsfield"] },
    credentialSchema: {
      kind: "oauth",
      label: "Higgsfield API token",
      hint: "Connect with Higgsfield (OAuth), or paste a token bundle. Used only for approval-gated draft assets.",
    },
    authKind: "oauth",
    access: "gated_write",
    mcpUrl: "https://mcp.higgsfield.ai/mcp",
    authHeader: "Authorization",
    toolNamespace: "higgsfield",
  },
  // --- signal_source + channel connectors. Behaviour lives in
  //     src/lib/connectors/builtin/ and is keyed back to these `key`s. ---
  {
    key: "weather-signals",
    kind: "signal_source",
    label: "Weather Signals (NWS/NOAA)",
    description:
      "Read-only signal source: reads live active alerts from the National Weather Service / NOAA for " +
      "your service area (US states or lat-lng points) and proposes geo-targeted storm-response " +
      "opportunities to the inbox. No API key — NWS is public. Never contacts anyone — proposals only.",
    costTier: "free",
    verticals: ["restoration", "roofing", "hvac", "landscaping", "solar", "insurance", "property_management"],
    capability: {
      summary: "Emits weather-event opportunities from live NWS/NOAA alerts for the configured service area.",
      opportunityKinds: ["weather_event"],
    },
    credentialSchema: {
      kind: "none",
      hint: "No credential — NWS/NOAA is a public API. Configure the US states (or lat-lng points) to watch.",
    },
    authKind: "none",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "weather-signals",
  },
  {
    key: "webhook-dispatch",
    kind: "channel",
    label: "Outbound Webhook",
    description:
      "Outbound channel: posts an approved message payload to a configured endpoint. Fires only from the " +
      "human-approved send path — there is no automatic send.",
    costTier: "free",
    verticals: [],
    capability: { summary: "Dispatches approved payloads to an outbound webhook.", channelMedium: "webhook" },
    credentialSchema: { kind: "none", hint: "The endpoint URL lives in the connector config, not the Vault." },
    authKind: "none",
    access: "gated_write",
    mcpUrl: null,
    toolNamespace: "webhook-dispatch",
  },
];

export function findConnector(key: string): ConnectorRegistryEntry | null {
  return CONNECTOR_REGISTRY.find((entry) => entry.key === key) ?? null;
}

/** Catalog entries of a given kind (mcp_tool / signal_source / channel). */
export function listConnectorsByKind(kind: ConnectorKind): ConnectorRegistryEntry[] {
  return CONNECTOR_REGISTRY.filter((entry) => entry.kind === kind);
}

/**
 * Whether a stored credential is required before this connector can go
 * `connected`. `none` schemas and `optional` credentials need nothing — those
 * connectors can be enabled with no Vault secret (e.g. a public signal source).
 */
export function connectorRequiresCredential(entry: Pick<ConnectorRegistryEntry, "credentialSchema">): boolean {
  return entry.credentialSchema.kind !== "none" && !entry.credentialSchema.optional;
}

/** HYBRID cost model: free + byo_key bypass metering; metered is billed (BSR-372). */
export function bypassesMetering(costTier: ConnectorCostTier): boolean {
  return costTier === "free" || costTier === "byo_key";
}

/**
 * Operator-facing status, computed (never stored): a missing REQUIRED credential
 * always wins (not_configured); a disabled switch beats test state; an untested
 * but enabled connector is connected. Connectors that need no credential
 * (requiresCredential=false) skip the not_configured gate entirely.
 */
export function computeConnectorStatus(input: {
  credentialPresent: boolean;
  enabled: boolean;
  lastTestOk: boolean | null;
  /** Defaults true — the historical behaviour for credentialed connectors. */
  requiresCredential?: boolean;
}): ConnectorStatus {
  const requiresCredential = input.requiresCredential ?? true;
  if (requiresCredential && !input.credentialPresent) return "not_configured";
  if (!input.enabled) return "disabled";
  if (input.lastTestOk === false) return "error";
  return "connected";
}
