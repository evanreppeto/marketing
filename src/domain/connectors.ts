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
 * - `import_source` — read-IN; pulls external records (CRM contacts, firmographic
 *                     enrichment) and writes ONLY internal CRM rows through the
 *                     gated lead-ingestion path. Runs as an EXPLICIT operator
 *                     action (runCrmImport), never on the automatic detection loop,
 *                     and never writes to the outside world. See docs/CONNECTORS.md.
 */
export type ConnectorKind = "mcp_tool" | "signal_source" | "channel" | "import_source";

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
  /** import_source: the CRM object types this connector writes (companies/contacts/leads). */
  importsInto?: string[];
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
  /**
   * Per-workspace config keys the connector cannot meaningfully run without — any
   * ONE present counts as satisfied (a key set often has aliases). Absent/empty
   * means the connector needs no config.
   *
   * This exists so a connector that needs *where to look* rather than *a key* can
   * still report `not_configured` instead of claiming "Connected" and quietly doing
   * nothing — or, worse, falling back to some built-in default that is right for
   * exactly one tenant.
   */
  requiredConfigKeys?: string[];
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
    label: "Gemini Web Research",
    description: "Grounded web search with citations, using this workspace's own Gemini API key.",
    costTier: "byo_key",
    verticals: [],
    capability: { summary: "Grounded web research with citations.", toolNamespaces: ["gemini"] },
    credentialSchema: {
      kind: "api_key",
      label: "Gemini API key",
      hint: "From Google AI Studio. Stored encrypted in your Vault — never shown again, never sent to the browser.",
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
    // No key to supply, but it still cannot run until it's told WHERE to watch.
    // Without this the connector reads "Connected" on an empty config and silently
    // watches whatever the code happens to default to — see parseWeatherServiceArea.
    // The aliases mirror exactly what that parser accepts.
    requiredConfigKeys: ["states", "areas", "points", "locations"],
    authKind: "none",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "weather-signals",
  },
  {
    key: "reviews-signals",
    kind: "signal_source",
    label: "Reviews & Reputation",
    description:
      "Read-only signal source: watches this workspace's Google Business Profile / Yelp reviews and proposes " +
      "service-recovery opportunities (negative reviews) and referral/testimonial opportunities (positive reviews). " +
      "Never replies — proposals only; any response stays an approval-gated draft.",
    costTier: "byo_key",
    verticals: [
      "restoration",
      "home_services",
      "field_services",
      "retail",
      "restaurants",
      "healthcare",
      "professional_services",
      "automotive",
      "fitness",
    ],
    capability: {
      summary: "Emits review_signal opportunities from recent reviews.",
      opportunityKinds: ["review_signal"],
    },
    credentialSchema: {
      kind: "oauth",
      label: "Google Business Profile",
      hint: "Connect your Google Business Profile (and optionally Yelp) to pull recent reviews. Stored encrypted in your Vault; used read-only.",
      optional: true,
    },
    authKind: "oauth",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "reviews-signals",
  },
  {
    key: "competitor-ads",
    kind: "signal_source",
    label: "Competitor Ad Intel",
    description:
      "Read-only signal source: watches competitor advertising in the public ad libraries (Meta Ad Library / " +
      "Google Ads Transparency) for your market and proposes defensive / contested-territory opportunities, with " +
      "the competitor's keywords and creative intel attached. Never contacts anyone — proposals only.",
    costTier: "byo_key",
    verticals: [
      "home_services",
      "restoration",
      "retail",
      "ecommerce",
      "healthcare",
      "legal",
      "financial_services",
      "saas",
      "agencies",
    ],
    capability: {
      summary: "Emits competitor_signal opportunities from competitor ad-library activity.",
      opportunityKinds: ["competitor_signal"],
    },
    credentialSchema: {
      kind: "api_key",
      label: "Ad library API access token",
      hint: "Meta Ad Library API token and/or Google Ads Transparency access. Stored encrypted in your Vault; used read-only. Official APIs only — no scraping.",
      optional: true,
    },
    authKind: "api_key",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "competitor-ads",
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
  // --- First `metered` connector: a paid third-party data vendor. It is GOVERNED
  //     by the cost model (BSR-372) — every scan meters billable lookups against
  //     the workspace spend cap. Stub today; the real vendor swaps in via BSR-368
  //     enrichment. Pricing lives in src/domain/connector-metering.ts. ---
  {
    key: "permit-data",
    kind: "signal_source",
    label: "Permit & Property Data",
    description:
      "Metered signal source: pulls paid building-permit / property records for watched municipalities and " +
      "proposes renovation & restoration opportunities. Billable — each municipality scanned is one paid lookup, " +
      "metered against your spend cap. Read-only: it only proposes, never contacts anyone.",
    costTier: "metered",
    verticals: ["restoration", "home_services", "construction", "real_estate"],
    capability: {
      summary: "Emits permit-backed renovation/restoration opportunities for watched municipalities.",
      opportunityKinds: ["permit_filed"],
    },
    credentialSchema: {
      kind: "api_key",
      label: "Permit data API key",
      hint: "From your permit-data vendor. Stored encrypted in your Vault. Usage is billed per lookup — see Settings → Usage.",
    },
    authKind: "api_key",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "permit-data",
  },
  // --- import_source connectors (BSR-368). Read-IN: pull external records and
  //     write ONLY internal CRM rows via the gated lead-ingestion path. Run as an
  //     explicit operator action (runCrmImport), never on the auto-detection loop,
  //     never outbound. Behaviour lives in src/lib/integrations/{crm,enrichment}/. ---
  {
    key: "hubspot-import",
    kind: "import_source",
    label: "HubSpot CRM Import",
    description:
      "Read-only import: pulls your HubSpot contacts into CRM leads — persona-mapped and deduped on the HubSpot " +
      "record id (a re-import updates, never duplicates) — so Arc can work them. Uses your own HubSpot OAuth on " +
      "read-only contact scopes; it never writes back to HubSpot and never contacts anyone.",
    costTier: "byo_key",
    verticals: [],
    capability: {
      summary: "Imports HubSpot contacts as persona-mapped CRM leads, idempotent on the external id.",
      importsInto: ["companies", "contacts", "leads"],
    },
    credentialSchema: {
      kind: "oauth",
      label: "HubSpot account",
      hint: "Connect HubSpot (OAuth, read-only contacts scope) or paste a private-app token. Stored encrypted in your Vault; used read-only.",
    },
    authKind: "oauth",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "hubspot-import",
  },
  {
    key: "lead-enrichment",
    kind: "import_source",
    label: "Lead Enrichment",
    description:
      "Metered enrichment: augments imported companies with firmographics (employee count, revenue, industry) from " +
      "a data vendor on your own vendor credential, feeding account tiering + scoring. Billable — each lookup is " +
      "metered against your spend cap. Read-only: it only augments records, never contacts anyone.",
    costTier: "metered",
    verticals: [],
    capability: {
      summary: "Augments records with firmographic data used to tier + score accounts.",
      importsInto: ["companies"],
    },
    credentialSchema: {
      kind: "api_key",
      label: "Enrichment vendor API key",
      hint: "From your firmographic data vendor. Stored encrypted in your Vault. Usage is billed per lookup — see Settings → Usage.",
    },
    authKind: "api_key",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "lead-enrichment",
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

/** True when the connector's required per-workspace config is actually filled in. */
export function connectorConfigSatisfied(
  entry: Pick<ConnectorRegistryEntry, "requiredConfigKeys">,
  config: Record<string, unknown> | null | undefined,
): boolean {
  const keys = entry.requiredConfigKeys ?? [];
  if (keys.length === 0) return true;
  const cfg = config ?? {};
  return keys.some((key) => {
    const value = cfg[key];
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
}

/**
 * Operator-facing status, computed (never stored): a missing REQUIRED credential
 * always wins (not_configured); missing required config is the same kind of "you
 * haven't finished connecting this" and reports the same way; a disabled switch
 * beats test state; an untested but enabled connector is connected. Connectors that
 * need no credential (requiresCredential=false) skip the credential gate entirely,
 * and connectors with no required config skip the config gate.
 */
export function computeConnectorStatus(input: {
  credentialPresent: boolean;
  enabled: boolean;
  lastTestOk: boolean | null;
  /** Defaults true — the historical behaviour for credentialed connectors. */
  requiresCredential?: boolean;
  /** Defaults satisfied — only `false` gates, so connectors with no required config are unaffected. */
  configPresent?: boolean;
}): ConnectorStatus {
  const requiresCredential = input.requiresCredential ?? true;
  if (requiresCredential && !input.credentialPresent) return "not_configured";
  if (input.configPresent === false) return "not_configured";
  if (!input.enabled) return "disabled";
  if (input.lastTestOk === false) return "error";
  return "connected";
}
