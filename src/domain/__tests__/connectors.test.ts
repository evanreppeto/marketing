import { describe, expect, it } from "vitest";
import {
  CONNECTOR_KIND_ORDER,
  CONNECTOR_KIND_SECTION,
  CONNECTOR_REGISTRY,
  INDUSTRY_OPTIONS,
  bypassesMetering,
  computeConnectorStatus,
  connectorIsAvailable,
  connectorRecommendedForVerticals,
  connectorRequiresCredential,
  findConnector,
  listConnectorsByKind,
  verticalsForIndustry,
  type ConnectorRegistryEntry,
} from "@/domain";

describe("connector registry", () => {
  it("seeds the gemini-research connector as a read-only api_key connector", () => {
    const gemini = findConnector("gemini-research");
    expect(gemini).toBeTruthy();
    expect(gemini?.authKind).toBe("api_key");
    expect(gemini?.access).toBe("read_only");
    expect(gemini?.kind).toBe("mcp_tool");
    expect(gemini?.costTier).toBe("byo_key");
  });

  it("has unique connector keys", () => {
    const keys = CONNECTOR_REGISTRY.map((c: ConnectorRegistryEntry) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("findConnector returns null for an unknown key", () => {
    expect(findConnector("nope")).toBeNull();
  });

  it("seeds higgsfield as a remote-MCP, gated-write connector with the loader fields set", () => {
    const hf = findConnector("higgsfield");
    expect(hf).toBeTruthy();
    expect(hf?.mcpUrl).toBe("https://mcp.higgsfield.ai/mcp");
    expect(hf?.authHeader).toBe("Authorization");
    expect(hf?.toolNamespace).toBe("higgsfield");
    expect(hf?.access).toBe("gated_write");
    expect(hf?.kind).toBe("mcp_tool");
  });

  it("every entry declares the full metadata descriptor (kind, costTier, verticals, capability, credentialSchema)", () => {
    for (const entry of CONNECTOR_REGISTRY) {
      expect(["mcp_tool", "signal_source", "channel"]).toContain(entry.kind);
      expect(["free", "byo_key", "metered"]).toContain(entry.costTier);
      expect(Array.isArray(entry.verticals)).toBe(true);
      expect(entry.capability.summary.length).toBeGreaterThan(0);
      expect(entry.credentialSchema.kind).toBe(entry.authKind); // schema.kind mirrors authKind
    }
  });

  it("ships one stub connector per new kind (signal_source + channel)", () => {
    const signal = listConnectorsByKind("signal_source");
    const channel = listConnectorsByKind("channel");
    expect(signal.map((c) => c.key)).toContain("weather-signals");
    expect(channel.map((c) => c.key)).toContain("webhook-dispatch");

    const weather = findConnector("weather-signals");
    expect(weather?.access).toBe("read_only"); // signal sources are read-only
    expect(weather?.capability.opportunityKinds).toContain("weather_event");

    const webhook = findConnector("webhook-dispatch");
    expect(webhook?.capability.channelMedium).toBe("webhook");
  });
});

describe("connectorRequiresCredential", () => {
  it("is true for credentialed connectors", () => {
    expect(connectorRequiresCredential({ credentialSchema: { kind: "api_key" } })).toBe(true);
    expect(connectorRequiresCredential({ credentialSchema: { kind: "oauth" } })).toBe(true);
  });
  it("is false for none / optional credentials", () => {
    expect(connectorRequiresCredential({ credentialSchema: { kind: "none" } })).toBe(false);
    expect(connectorRequiresCredential({ credentialSchema: { kind: "api_key", optional: true } })).toBe(false);
  });
  it("holds for the shipped stub signal source (no credential)", () => {
    const weather = findConnector("weather-signals")!;
    expect(connectorRequiresCredential(weather)).toBe(false);
  });
});

describe("bypassesMetering (HYBRID cost model)", () => {
  it("free and byo_key bypass metering; metered does not", () => {
    expect(bypassesMetering("free")).toBe(true);
    expect(bypassesMetering("byo_key")).toBe(true);
    expect(bypassesMetering("metered")).toBe(false);
  });
});

describe("computeConnectorStatus", () => {
  it("is not_configured when no credential is present", () => {
    expect(computeConnectorStatus({ credentialPresent: false, enabled: true, lastTestOk: null })).toBe("not_configured");
  });
  it("is disabled when credential present but switch off", () => {
    expect(computeConnectorStatus({ credentialPresent: true, enabled: false, lastTestOk: null })).toBe("disabled");
  });
  it("is error when last test failed", () => {
    expect(computeConnectorStatus({ credentialPresent: true, enabled: true, lastTestOk: false })).toBe("error");
  });
  it("is connected when present, enabled, and not failing", () => {
    expect(computeConnectorStatus({ credentialPresent: true, enabled: true, lastTestOk: null })).toBe("connected");
  });
  it("skips the not_configured gate when no credential is required", () => {
    // A no-credential connector goes disabled→connected on the enable switch alone.
    expect(computeConnectorStatus({ credentialPresent: false, enabled: false, lastTestOk: null, requiresCredential: false })).toBe("disabled");
    expect(computeConnectorStatus({ credentialPresent: false, enabled: true, lastTestOk: null, requiresCredential: false })).toBe("connected");
  });
});

describe("connectorIsAvailable (Coming soon catalog entries)", () => {
  it("treats the built connectors as available and registered-but-unbuilt ones as not", () => {
    expect(connectorIsAvailable(findConnector("gemini-research")!)).toBe(true);
    expect(connectorIsAvailable(findConnector("weather-signals")!)).toBe(true);
    expect(connectorIsAvailable(findConnector("meta-ads")!)).toBe(false); // available: false
    expect(connectorIsAvailable({})).toBe(true); // default (omitted) = available
  });

  it("ships coming-soon entries spanning every kind so the catalog looks full", () => {
    const soon = CONNECTOR_REGISTRY.filter((c) => !connectorIsAvailable(c));
    expect(soon.length).toBeGreaterThan(0);
    expect(new Set(soon.map((c) => c.kind))).toEqual(new Set(["signal_source", "channel", "mcp_tool"]));
    // At least one metered entry exists so the "Metered" cost badge is exercised.
    expect(CONNECTOR_REGISTRY.some((c) => c.costTier === "metered")).toBe(true);
  });
});

describe("catalog kind sections", () => {
  it("orders and labels every connector kind", () => {
    expect(CONNECTOR_KIND_ORDER).toEqual(["signal_source", "channel", "mcp_tool"]);
    for (const kind of CONNECTOR_KIND_ORDER) {
      expect(CONNECTOR_KIND_SECTION[kind].title.length).toBeGreaterThan(0);
      expect(listConnectorsByKind(kind).length).toBeGreaterThan(0);
    }
  });
});

describe("verticalsForIndustry", () => {
  it("resolves a known industry label (case-insensitive) to its vertical tags", () => {
    expect(verticalsForIndustry("Real estate")).toEqual(["real_estate"]);
    expect(verticalsForIndustry("real ESTATE")).toEqual(["real_estate"]);
  });
  it("returns [] for empty / unknown / the general bucket", () => {
    expect(verticalsForIndustry("")).toEqual([]);
    expect(verticalsForIndustry(null)).toEqual([]);
    expect(verticalsForIndustry("Underwater basket weaving")).toEqual([]);
    expect(verticalsForIndustry("Other / general")).toEqual([]);
  });
});

describe("connectorRecommendedForVerticals (the rail matcher)", () => {
  it("recommends a connector that shares a vertical with the workspace", () => {
    const weather = findConnector("weather-signals")!;
    expect(connectorRecommendedForVerticals(weather, verticalsForIndustry("Restoration & home services"))).toBe(true);
  });
  it("does not recommend when verticals do not intersect", () => {
    const listing = findConnector("listing-signals")!; // real_estate only
    expect(connectorRecommendedForVerticals(listing, verticalsForIndustry("Ecommerce & retail"))).toBe(false);
  });
  it("never treats universal (verticals: []) connectors as rail picks", () => {
    const gemini = findConnector("gemini-research")!; // verticals: []
    expect(connectorRecommendedForVerticals(gemini, ["restoration", "home_services"])).toBe(false);
  });
  it("recommends nothing when the workspace has no verticals", () => {
    const weather = findConnector("weather-signals")!;
    expect(connectorRecommendedForVerticals(weather, [])).toBe(false);
  });

  it("every concrete industry option yields at least one recommended connector", () => {
    for (const option of INDUSTRY_OPTIONS) {
      if (option.verticals.length === 0) continue; // "Other / general" is intentionally empty
      const matches = CONNECTOR_REGISTRY.filter((c) => connectorRecommendedForVerticals(c, option.verticals));
      expect(matches.length, `no recommendation for ${option.label}`).toBeGreaterThan(0);
    }
  });
});
