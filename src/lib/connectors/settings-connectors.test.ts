import { describe, expect, it } from "vitest";

import { CONNECTOR_REGISTRY } from "@/domain";

import { getSettingsConnectorsView } from "./settings-connectors";

describe("getSettingsConnectorsView", () => {
  it("falls back to the real registry as not-configured with no workspace/Supabase", async () => {
    // No Supabase env (or no request-scoped workspace) → honest registry fallback:
    // the real connectors, every one not connected — never fabricated as live.
    const view = await getSettingsConnectorsView();

    expect(view.configured).toBe(false);
    expect(view.connectors.map((c) => c.key).sort()).toEqual(CONNECTOR_REGISTRY.map((e) => e.key).sort());
    for (const connector of view.connectors) {
      expect(connector.credentialPresent).toBe(false);
      expect(connector.enabled).toBe(false);
      expect(connector.status).toBe("not_configured");
    }
  });
});
