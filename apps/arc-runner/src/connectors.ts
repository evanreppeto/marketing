import type { ArcClient } from "./arc-client";
import type { ArcMode } from "./tools";

/** One remote MCP connector, as served by GET /api/v1/arc/connectors. */
export type RemoteConnector = {
  toolNamespace: string;
  mcpUrl: string;
  authHeader: string;
  token: string;
};

type HttpMcpServer = { type: "http"; url: string; headers: Record<string, string> };

/**
 * Pure mapping: connector descriptors -> the SDK's mcpServers map plus the
 * allow-patterns that unlock their tools. `mcp__<namespace>` allows every tool the
 * server exposes. The credential rides the configured header as a Bearer token.
 */
export function buildRemoteMcp(connectors: RemoteConnector[]): {
  mcpServers: Record<string, HttpMcpServer>;
  allowedTools: string[];
} {
  const mcpServers: Record<string, HttpMcpServer> = {};
  const allowedTools: string[] = [];
  for (const c of connectors) {
    mcpServers[c.toolNamespace] = {
      type: "http",
      url: c.mcpUrl,
      headers: { [c.authHeader]: `Bearer ${c.token}` },
    };
    allowedTools.push(`mcp__${c.toolNamespace}`);
  }
  return { mcpServers, allowedTools };
}

/** Remote media-producing connectors are for work modes (draft/act), not read-only
 *  conversation (ask) or proposal-only scanning (scan). */
export function remoteConnectorsAllowedForMode(mode: ArcMode): boolean {
  return mode === "draft" || mode === "act";
}

/** Fetch this workspace's remote connectors via the app API. Best-effort: on any
 *  failure return none, so Arc degrades to its built-in tools (never breaks a turn). */
export async function fetchRemoteConnectors(client: ArcClient): Promise<RemoteConnector[]> {
  try {
    const res = await client.apiGet<{ connectors?: RemoteConnector[] }>("/api/v1/arc/connectors");
    return res.connectors ?? [];
  } catch {
    return [];
  }
}
