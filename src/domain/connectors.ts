// Pure, deterministic connector catalog + status math. No I/O. Mirrors the
// shape of connections.ts but is workspace-scoped and credential-based (a key
// stored per workspace) rather than env-var-based.

export type ConnectorAuthKind = "api_key" | "oauth" | "none";
export type ConnectorAccess = "read_only" | "gated_write";
export type ConnectorStatus = "not_configured" | "disabled" | "error" | "connected";

export type ConnectorRegistryEntry = {
  /** Stable catalog key. Also the workspace_connectors.connector_key value. */
  key: string;
  label: string;
  description: string;
  authKind: ConnectorAuthKind;
  /** Slice A only ships read_only connectors. */
  access: ConnectorAccess;
  /**
   * Remote MCP endpoint for connectors loaded into the runner (Slice B). null
   * for "native" connectors whose capability already lives in-app (Gemini).
   */
  mcpUrl: string | null;
  /** Header that carries the credential for remote MCP connectors (Slice B). */
  authHeader?: string;
  /** mcpServers map key / tool namespace for remote connectors (Slice B). */
  toolNamespace: string;
};

export const CONNECTOR_REGISTRY: ConnectorRegistryEntry[] = [
  {
    key: "gemini-research",
    label: "Gemini Web Research",
    description: "Grounded web search with citations, using this workspace's own Gemini API key.",
    authKind: "api_key",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "gemini",
  },
  {
    key: "higgsfield",
    label: "Higgsfield",
    description:
      "Cinematic image & video generation, UGC/viral ad variants, and virality prediction on this " +
      "workspace's own Higgsfield credits. Loaded into the runner as a remote MCP; output lands as " +
      "approval-gated draft assets.",
    authKind: "oauth",
    access: "gated_write",
    mcpUrl: "https://mcp.higgsfield.ai/mcp",
    authHeader: "Authorization",
    toolNamespace: "higgsfield",
  },
];

export function findConnector(key: string): ConnectorRegistryEntry | null {
  return CONNECTOR_REGISTRY.find((entry) => entry.key === key) ?? null;
}

/**
 * Operator-facing status, computed (never stored): a missing credential always
 * wins (not_configured); a disabled switch beats test state; an untested but
 * enabled connector is connected.
 */
export function computeConnectorStatus(input: {
  credentialPresent: boolean;
  enabled: boolean;
  lastTestOk: boolean | null;
}): ConnectorStatus {
  if (!input.credentialPresent) return "not_configured";
  if (!input.enabled) return "disabled";
  if (input.lastTestOk === false) return "error";
  return "connected";
}
