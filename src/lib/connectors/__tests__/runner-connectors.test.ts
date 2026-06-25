import { describe, expect, it, vi, beforeEach } from "vitest";

const readModel = vi.hoisted(() => ({
  listWorkspaceConnectors: vi.fn(),
  resolveConnectorCredentialRef: vi.fn(async () => "ref-1"),
}));
vi.mock("../read-model", () => readModel);

const creds = vi.hoisted(() => ({ readConnectorCredential: vi.fn() }));
vi.mock("../credentials", () => creds);

const refresh = vi.hoisted(() => ({ ensureFreshAccessToken: vi.fn() }));
vi.mock("../oauth-refresh", () => refresh);

import { resolveRemoteConnectorsForRunner } from "../runner-connectors";

beforeEach(() => {
  readModel.listWorkspaceConnectors.mockResolvedValue([{ key: "higgsfield", enabled: true, credentialPresent: true }]);
});

describe("resolveRemoteConnectorsForRunner", () => {
  it("passes a bare bearer credential through unchanged (no refresh)", async () => {
    creds.readConnectorCredential.mockResolvedValueOnce("oat_plain");
    const out = await resolveRemoteConnectorsForRunner({} as never, "ws-1");
    expect(out).toHaveLength(1);
    expect(out[0].token).toBe("oat_plain");
    expect(refresh.ensureFreshAccessToken).not.toHaveBeenCalled();
  });

  it("refreshes an oauth_refresh bundle and returns the fresh token", async () => {
    creds.readConnectorCredential.mockResolvedValueOnce(
      JSON.stringify({ type: "oauth_refresh", accessToken: "old", refreshToken: "rt", expiresAt: 0, clientId: "c", tokenEndpoint: "https://t" }),
    );
    refresh.ensureFreshAccessToken.mockResolvedValueOnce({ ok: true, accessToken: "fresh" });
    const out = await resolveRemoteConnectorsForRunner({} as never, "ws-1");
    expect(out).toHaveLength(1);
    expect(out[0].token).toBe("fresh");
  });

  it("omits the connector when refresh needs reconnect", async () => {
    creds.readConnectorCredential.mockResolvedValueOnce(
      JSON.stringify({ type: "oauth_refresh", accessToken: "old", refreshToken: "rt", expiresAt: 0, clientId: "c", tokenEndpoint: "https://t" }),
    );
    refresh.ensureFreshAccessToken.mockResolvedValueOnce({ ok: false, reason: "needs_reconnect", error: "x" });
    const out = await resolveRemoteConnectorsForRunner({} as never, "ws-1");
    expect(out).toHaveLength(0);
  });
});
