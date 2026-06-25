import { describe, expect, it } from "vitest";
import { buildHiggsfieldBundleFromMcpEntry } from "../capture-bundle";

describe("buildHiggsfieldBundleFromMcpEntry", () => {
  it("builds a serialized oauth_refresh bundle from a Claude .credentials.json mcpOAuth entry", () => {
    const serialized = buildHiggsfieldBundleFromMcpEntry({
      accessToken: "oat_a",
      refreshToken: "rt_a",
      expiresAt: 123,
      clientId: "client_a",
    });
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual({
      type: "oauth_refresh",
      accessToken: "oat_a",
      refreshToken: "rt_a",
      expiresAt: 123,
      clientId: "client_a",
      tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
    });
  });

  it("throws when a required field is missing", () => {
    expect(() => buildHiggsfieldBundleFromMcpEntry({ accessToken: "", refreshToken: "rt", expiresAt: 1, clientId: "c" })).toThrow();
  });
});
