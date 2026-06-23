import { describe, expect, it } from "vitest";
import {
  CONNECTOR_REGISTRY,
  computeConnectorStatus,
  findConnector,
  type ConnectorRegistryEntry,
} from "@/domain";

describe("connector registry", () => {
  it("seeds the gemini-research connector as a read-only api_key connector", () => {
    const gemini = findConnector("gemini-research");
    expect(gemini).toBeTruthy();
    expect(gemini?.authKind).toBe("api_key");
    expect(gemini?.access).toBe("read_only");
  });

  it("has unique connector keys", () => {
    const keys = CONNECTOR_REGISTRY.map((c: ConnectorRegistryEntry) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("findConnector returns null for an unknown key", () => {
    expect(findConnector("nope")).toBeNull();
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
});
