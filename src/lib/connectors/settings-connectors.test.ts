import { describe, expect, it } from "vitest";

import { CONNECTOR_REGISTRY, connectorRequiresCredential, findConnector } from "@/domain";

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
      // Credentialed connectors read "not_configured"; no-credential connectors
      // (public signal source / config-only channel) read "disabled" (just off).
      const requiresCredential = connectorRequiresCredential(findConnector(connector.key)!);
      expect(connector.status).toBe(requiresCredential ? "not_configured" : "disabled");
    }
  });
});
