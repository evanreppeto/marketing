const MCP_URL = "https://mcp.higgsfield.ai/mcp";

function parseMcpBody(text: string, contentType: string): unknown {
  if (contentType.includes("text/event-stream")) {
    const lines = text.split(/\n/).filter((l) => l.startsWith("data:"));
    const parsed = lines.map((l) => {
      try {
        return JSON.parse(l.slice(5).trim());
      } catch {
        return null;
      }
    });
    return parsed;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Validate a Higgsfield access token by calling the zero-credit `balance` tool. */
export async function checkHiggsfieldToken(accessToken: string): Promise<{ ok: boolean; error?: string }> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  try {
    const init = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "arc-health", version: "0" } } }),
    });
    if (init.status === 401 || init.status === 403) return { ok: false, error: `auth rejected (${init.status})` };
    const sid = init.headers.get("mcp-session-id");
    const callHeaders = sid ? { ...headers, "Mcp-Session-Id": sid } : headers;
    const call = await fetch(MCP_URL, {
      method: "POST",
      headers: callHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "balance", arguments: {} } }),
    });
    if (call.status !== 200) return { ok: false, error: `balance call failed (${call.status})` };
    const body = parseMcpBody(await call.text(), call.headers.get("content-type") ?? "");
    const ok = JSON.stringify(body).includes("subscription_plan_type") || JSON.stringify(body).includes("credits");
    return ok ? { ok: true } : { ok: false, error: "unexpected balance response" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "health check error" };
  }
}
