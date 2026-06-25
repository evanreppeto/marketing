import { serializeOAuthBundle } from "@/domain";

const HIGGSFIELD_TOKEN_ENDPOINT = "https://mcp.higgsfield.ai/oauth2/token";

export type McpOAuthEntry = { accessToken: string; refreshToken: string; expiresAt: number; clientId: string };

/** Build the serialized oauth_refresh credential bundle from a Claude client's
 *  mcpOAuth entry for Higgsfield. Throws if any required field is empty. */
export function buildHiggsfieldBundleFromMcpEntry(entry: McpOAuthEntry): string {
  if (!entry.accessToken || !entry.refreshToken || !entry.clientId || !entry.expiresAt) {
    throw new Error("mcpOAuth entry missing required fields (accessToken/refreshToken/clientId/expiresAt)");
  }
  return serializeOAuthBundle({
    kind: "oauth_refresh",
    accessToken: entry.accessToken,
    refreshToken: entry.refreshToken,
    expiresAt: entry.expiresAt,
    clientId: entry.clientId,
    tokenEndpoint: HIGGSFIELD_TOKEN_ENDPOINT,
  });
}
