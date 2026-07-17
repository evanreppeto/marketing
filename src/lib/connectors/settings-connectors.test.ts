import { describe, expect, it } from "vitest";

import { CONNECTOR_REGISTRY, connectorIsAvailable, connectorRequiresCredential, findConnector } from "@/domain";

import { getSettingsConnectorsView } from "./settings-connectors";

describe("getSettingsConnectorsView", () => {
  it("falls back to the real registry as not-connected with no workspace/Supabase", async () => {
    // No Supabase env (or no request-scoped workspace) → honest registry fallback:
    // the real connectors, every one not connected — never fabricated as live.
    const view = await getSettingsConnectorsView();

    expect(view.configured).toBe(false);
    expect(view.connectors.map((c) => c.key).sort()).toEqual(CONNECTOR_REGISTRY.map((e) => e.key).sort());
    for (const connector of view.connectors) {
      expect(connector.credentialPresent).toBe(false);
      expect(connector.enabled).toBe(false);
      const entry = findConnector(connector.key)!;
      // Three-way: a planned connector reads "unavailable" regardless of anything
      // else (the fallback must carry availability through, not just credential
      // state); a credentialed one reads "not_configured"; a no-credential one
      // (public signal source / config-only channel) reads "disabled" (just off).
      const expected = !connectorIsAvailable(entry)
        ? "unavailable"
        : connectorRequiresCredential(entry)
          ? "not_configured"
          : "disabled";
      expect(connector.status).toBe(expected);
    }
  });
});
