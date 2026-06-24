import { describe, it, expect } from "vitest";

import { buildRemoteMcp, remoteConnectorsAllowedForMode } from "./connectors";

describe("buildRemoteMcp", () => {
  it("maps connectors to http mcpServers and namespaced allow-patterns", () => {
    const { mcpServers, allowedTools } = buildRemoteMcp([
      { toolNamespace: "higgsfield", mcpUrl: "https://mcp.higgsfield.ai/mcp", authHeader: "Authorization", token: "tok" },
    ]);
    expect(mcpServers).toEqual({
      higgsfield: { type: "http", url: "https://mcp.higgsfield.ai/mcp", headers: { Authorization: "Bearer tok" } },
    });
    expect(allowedTools).toEqual(["mcp__higgsfield"]);
  });

  it("returns empty maps for no connectors", () => {
    expect(buildRemoteMcp([])).toEqual({ mcpServers: {}, allowedTools: [] });
  });
});

describe("remoteConnectorsAllowedForMode", () => {
  it("allows draft and act (media production), blocks ask and scan", () => {
    expect(remoteConnectorsAllowedForMode("draft")).toBe(true);
    expect(remoteConnectorsAllowedForMode("act")).toBe(true);
    expect(remoteConnectorsAllowedForMode("ask")).toBe(false);
    expect(remoteConnectorsAllowedForMode("scan")).toBe(false);
  });
});
