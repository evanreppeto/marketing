import { describe, expect, it } from "vitest";

import {
  computeConnectorStatus,
  effectiveCostTier,
  findConnector,
  supportsPlatformCredits,
} from "../connectors";

describe("platform-credits credential model", () => {
  it("gemini-research declares a platform key; personal-OAuth connectors do not", () => {
    expect(supportsPlatformCredits(findConnector("gemini-research")!)).toBe(true);
    expect(findConnector("gemini-research")!.platformEnvVar).toBe("GEMINI_API_KEY");
    expect(supportsPlatformCredits(findConnector("higgsfield")!)).toBe(false);
  });

  it("effectiveCostTier follows the credential source, not the static tier", () => {
    const byoEntry = { costTier: "byo_key" as const };
    // A workspace key always bypasses metering; the platform's key is always
    // metered (WE pay) — even for an entry whose static tier says byo_key.
    expect(effectiveCostTier(byoEntry, "byo")).toBe("byo_key");
    expect(effectiveCostTier(byoEntry, "platform")).toBe("metered");
    expect(effectiveCostTier(byoEntry, "none")).toBe("byo_key");
    expect(effectiveCostTier({ costTier: "free" }, "platform")).toBe("free");
    expect(effectiveCostTier({ costTier: "metered" }, "byo")).toBe("byo_key");
  });

  it("a platform key satisfies the credential gate in status math", () => {
    const base = { credentialPresent: false, enabled: true, lastTestOk: null, requiresCredential: true };
    expect(computeConnectorStatus(base)).toBe("not_configured");
    expect(computeConnectorStatus({ ...base, platformCredentialAvailable: true })).toBe("connected");
    expect(computeConnectorStatus({ ...base, platformCredentialAvailable: true, enabled: false })).toBe("disabled");
    // A stored workspace key still behaves exactly as before.
    expect(computeConnectorStatus({ ...base, credentialPresent: true })).toBe("connected");
    // planned availability still beats everything.
    expect(computeConnectorStatus({ ...base, platformCredentialAvailable: true, availability: "planned" })).toBe("unavailable");
  });
});
