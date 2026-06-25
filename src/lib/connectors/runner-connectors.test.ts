import { describe, it, expect, vi } from "vitest";

import { resolveRemoteConnectorsForRunner } from "./runner-connectors";

vi.mock("./read-model", () => ({
  listWorkspaceConnectors: vi.fn(async () => [
    { key: "higgsfield", enabled: true, credentialPresent: true, status: "connected" },
    { key: "gemini-research", enabled: true, credentialPresent: true, status: "connected" },
  ]),
  resolveConnectorCredentialRef: vi.fn(async () => "ref-1"),
}));
vi.mock("./credentials", () => ({
  readConnectorCredential: vi.fn(async () => "secret-token"),
}));

describe("resolveRemoteConnectorsForRunner", () => {
  it("returns only enabled connectors that have a remote mcpUrl, with their decrypted token", async () => {
    const client = {} as never;
    const result = await resolveRemoteConnectorsForRunner(client, "ws-1");
    // gemini-research has mcpUrl: null in the registry, so it is excluded.
    expect(result).toEqual([
      {
        toolNamespace: "higgsfield",
        mcpUrl: "https://mcp.higgsfield.ai/mcp",
        authHeader: "Authorization",
        token: "secret-token",
      },
    ]);
  });
});
