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
   * Whether this connector is actually built and can be connected today.
   * Omitted / true → live (has a working impl). `false` → registered-but-unbuilt:
   * it appears in the catalog as an honest "Coming soon" (so the marketplace looks
   * full without faking capability) and can never be enabled. Defaults to true.
   */
  available?: boolean;
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
  // --- Registered-but-unbuilt catalog entries (available: false). They give the
  //     marketplace real breadth across verticals + kinds and power the
  //     "Recommended for your business" rail, but render as honest "Coming soon"
  //     — no impl in the runtime registry, so they can never be enabled. ---
  {
    key: "permit-signals",
    kind: "signal_source",
    label: "Building Permits",
    description:
      "Read-only signal source: watches new residential building & renovation permits in your service " +
      "area and proposes timely outreach opportunities. Proposals only — never contacts anyone.",
    costTier: "free",
    verticals: ["restoration", "roofing", "contracting", "home_services", "field_services", "real_estate"],
    capability: { summary: "Emits permit-filed opportunities for your service area.", opportunityKinds: ["permit_filed"] },
    credentialSchema: { kind: "none", hint: "No credential — configure the jurisdictions to watch." },
    authKind: "none",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "permit-signals",
    available: false,
  },
  {
    key: "listing-signals",
    kind: "signal_source",
    label: "New Property Listings",
    description:
      "Read-only signal source: surfaces newly listed, pending, and sold homes in your farm area so Arc " +
      "can propose timely seller and buyer campaigns. Proposals only.",
    costTier: "free",
    verticals: ["real_estate"],
    capability: { summary: "Emits new-listing opportunities for your farm area.", opportunityKinds: ["new_listing"] },
    credentialSchema: { kind: "none", hint: "No credential — configure the ZIP codes / farm area to watch." },
    authKind: "none",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "listing-signals",
    available: false,
  },
  // NB: a review/reputation signal source ships for real as `reviews-signals`
  // (BSR-365) above — no coming-soon stub needed here.
  {
    key: "store-signals",
    kind: "signal_source",
    label: "Store Activity",
    description:
      "Read-only signal source: reads your store's abandoned carts, new orders, and back-in-stock events " +
      "to propose recovery and win-back campaigns. Proposals only — no auto-send.",
    costTier: "byo_key",
    verticals: ["ecommerce", "retail"],
    capability: {
      summary: "Emits cart-recovery & win-back opportunities from store activity.",
      opportunityKinds: ["abandoned_cart", "repeat_purchase"],
    },
    credentialSchema: {
      kind: "api_key",
      label: "Store API key",
      hint: "From your store admin (e.g. Shopify). Stored encrypted in your Vault — never shown again.",
    },
    authKind: "api_key",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "store-signals",
    available: false,
  },
  {
    key: "sms-dispatch",
    kind: "channel",
    label: "SMS Outreach",
    description:
      "Outbound channel: sends approved SMS to opted-in contacts. Fires only from the human-approved send " +
      "path — never automatically.",
    costTier: "metered",
    verticals: ["home_services", "field_services", "real_estate", "healthcare", "wellness"],
    capability: { summary: "Delivers approved SMS to opted-in recipients.", channelMedium: "sms" },
    credentialSchema: { kind: "none", hint: "No key to paste — SMS is billed through your Arc usage (metered)." },
    authKind: "none",
    access: "gated_write",
    mcpUrl: null,
    toolNamespace: "sms-dispatch",
    available: false,
  },
  {
    key: "meta-ads",
    kind: "channel",
    label: "Meta Ads",
    description:
      "Outbound channel: boosts approved creative as paid Instagram/Facebook ads to lookalike audiences. " +
      "Every launch stays behind human approval — no auto-spend.",
    costTier: "metered",
    verticals: ["ecommerce", "retail", "real_estate", "home_services"],
    capability: { summary: "Launches approved creative as paid Meta ads.", channelMedium: "paid_social" },
    credentialSchema: {
      kind: "oauth",
      label: "Meta Business login",
      hint: "Connect your Meta Business account. Ad spend stays behind approval and your caps.",
    },
    authKind: "oauth",
    access: "gated_write",
    mcpUrl: null,
    toolNamespace: "meta-ads",
    available: false,
  },
  {
    key: "crm-enrichment",
    kind: "mcp_tool",
    label: "Contact Enrichment",
    description:
      "Tool: enriches your CRM contacts and companies with firmographic and contact detail so Arc can " +
      "personalize outreach. Read-only enrichment; any writes stay approval-gated.",
    costTier: "byo_key",
    verticals: ["real_estate", "professional_services", "b2b", "home_services"],
    capability: { summary: "Enriches CRM records with firmographic detail.", toolNamespaces: ["enrichment"] },
    credentialSchema: {
      kind: "api_key",
      label: "Enrichment API key",
      hint: "From your enrichment provider. Stored encrypted in your Vault — never shown again.",
    },
    authKind: "api_key",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "crm-enrichment",
    available: false,
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
 * Whether a connector is built and connectable today. Registered-but-unbuilt
 * entries (`available: false`) render as "Coming soon" and can never be enabled.
 */
export function connectorIsAvailable(entry: Pick<ConnectorRegistryEntry, "available">): boolean {
  return entry.available !== false;
}

// ---------------------------------------------------------------------------
// Marketplace catalog: business-type → recommendations. The connector catalog
// groups entries by kind and surfaces a "Recommended for your business" rail
// driven by the workspace's industry, matched against each connector's
// `verticals` tags. All pure — the UI reads these to render, nothing is stored.
// ---------------------------------------------------------------------------

/** Catalog section order + copy, keyed by connector kind. */
export const CONNECTOR_KIND_ORDER: ConnectorKind[] = ["signal_source", "channel", "mcp_tool"];
export const CONNECTOR_KIND_SECTION: Record<ConnectorKind, { title: string; blurb: string }> = {
  signal_source: {
    title: "Signal sources",
    blurb: "Read-only watchers that propose opportunities to your inbox. They never contact anyone.",
  },
  channel: {
    title: "Channels",
    blurb: "Outbound mediums. Every send stays behind human approval — nothing goes out on its own.",
  },
  mcp_tool: {
    title: "Tools",
    blurb: "Capabilities Arc can call while it works — research, creative, enrichment.",
  },
};

/**
 * The business types offered in the industry picker (onboarding + Settings →
 * General), each mapped to the `verticals` tags connectors declare. This keeps
 * the picker and the recommendation matcher in lockstep: the label the operator
 * saves is what `verticalsForIndustry` resolves against. Tenant-agnostic —
 * spans the verticals the product serves, not one industry.
 */
export const INDUSTRY_OPTIONS: { label: string; verticals: string[] }[] = [
  { label: "Restoration & home services", verticals: ["restoration", "home_services", "field_services"] },
  { label: "Roofing & exteriors", verticals: ["roofing", "home_services", "field_services"] },
  { label: "General contracting", verticals: ["contracting", "home_services", "field_services"] },
  { label: "Real estate", verticals: ["real_estate"] },
  { label: "Ecommerce & retail", verticals: ["ecommerce", "retail"] },
  { label: "Healthcare & wellness", verticals: ["healthcare", "wellness"] },
  { label: "Professional services", verticals: ["professional_services", "b2b"] },
  { label: "Hospitality & food", verticals: ["hospitality", "food_beverage", "restaurants"] },
  { label: "Other / general", verticals: [] },
];

/** Vertical tags for a saved industry label (case-insensitive). Unknown → []. */
export function verticalsForIndustry(industry: string | null | undefined): string[] {
  const needle = (industry ?? "").trim().toLowerCase();
  if (!needle) return [];
  const match = INDUSTRY_OPTIONS.find((option) => option.label.toLowerCase() === needle);
  return match ? match.verticals : [];
}

/**
 * Whether a connector is recommended for a workspace's verticals. A connector is
 * a vertical-specific pick when its `verticals` intersect the workspace's — that
 * intersection is what makes the "Recommended for your business" rail change as
 * the industry changes. Universal connectors (`verticals: []`) are foundational
 * for everyone, so they are NOT rail picks (they live in their kind section).
 */
export function connectorRecommendedForVerticals(
  entry: Pick<ConnectorRegistryEntry, "verticals">,
  workspaceVerticals: string[],
): boolean {
  if (workspaceVerticals.length === 0 || entry.verticals.length === 0) return false;
  return entry.verticals.some((vertical) => workspaceVerticals.includes(vertical));
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
