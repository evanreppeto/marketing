import { describe, expect, it } from "vitest";

import { connectorMatchesIndustry, recommendConnectors } from "../connector-catalog";
import { type ConnectorRegistryEntry } from "../connectors";

function entry(key: string, verticals: string[]): ConnectorRegistryEntry {
  return {
    key,
    kind: "signal_source",
    label: key,
    description: "",
    costTier: "free",
    verticals,
    capability: { summary: "" },
    credentialSchema: { kind: "none" },
    authKind: "none",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: key,
  };
}

describe("connectorMatchesIndustry", () => {
  it("matches a vertical tag contained in the free-text industry (underscores → spaces)", () => {
    expect(connectorMatchesIndustry(["restoration", "home_services"], "Restoration & home services")).toBe(true);
    expect(connectorMatchesIndustry(["home_services"], "Restoration & home services")).toBe(true);
    expect(connectorMatchesIndustry(["insurance"], "Insurance")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(connectorMatchesIndustry(["ROOFING"], "roofing contractors")).toBe(true);
  });

  it("does not match unrelated industries", () => {
    expect(connectorMatchesIndustry(["ecommerce", "retail"], "Restoration & home services")).toBe(false);
  });

  it("treats universal ([]) connectors as not tailored, and empty industry as no match", () => {
    expect(connectorMatchesIndustry([], "Restoration")).toBe(false);
    expect(connectorMatchesIndustry(["restoration"], "")).toBe(false);
    expect(connectorMatchesIndustry(["restoration"], "   ")).toBe(false);
  });
});

describe("recommendConnectors", () => {
  const entries = [
    entry("weather", ["restoration", "home_services", "insurance"]),
    entry("shopify", ["ecommerce", "retail"]),
    entry("gemini", []), // universal
  ];

  it("returns only the tailored (non-universal, matching) connectors", () => {
    expect(recommendConnectors(entries, "Restoration & home services").map((e) => e.key)).toEqual(["weather"]);
    expect(recommendConnectors(entries, "Ecommerce brand").map((e) => e.key)).toEqual(["shopify"]);
  });

  it("returns nothing for an unknown or empty industry", () => {
    expect(recommendConnectors(entries, "Law firm")).toEqual([]);
    expect(recommendConnectors(entries, "")).toEqual([]);
  });
});
