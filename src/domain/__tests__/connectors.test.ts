import { describe, expect, it } from "vitest";
import {
  CONNECTOR_REGISTRY,
  bypassesMetering,
  computeConnectorStatus,
  connectorRequiresCredential,
  findConnector,
  listConnectorsByKind,
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
      expect(["mcp_tool", "signal_source", "channel", "import_source"]).toContain(entry.kind);
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

  it("registers the CRM import_source connectors (BSR-368) as read-in, never outbound", () => {
    const imports = listConnectorsByKind("import_source");
    expect(imports.map((c) => c.key)).toEqual(expect.arrayContaining(["hubspot-import", "lead-enrichment"]));

    const hubspot = findConnector("hubspot-import");
    expect(hubspot?.access).toBe("read_only"); // never writes back to the source
    expect(hubspot?.costTier).toBe("byo_key"); // uses the workspace's own HubSpot
    expect(hubspot?.capability.importsInto).toContain("leads");

    const enrichment = findConnector("lead-enrichment");
    expect(enrichment?.access).toBe("read_only");
    expect(enrichment?.costTier).toBe("metered"); // governed by the spend cap
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
