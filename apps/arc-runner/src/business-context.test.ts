import { describe, expect, it, vi } from "vitest";
import { BSR_CONTEXT, fromAppContext, resolveBusinessContext, type AppBusinessContext } from "./business-context";
import type { ArcClient } from "./arc-client";

const APP: AppBusinessContext = {
  businessName: "Acme Co",
  industry: "plumbing",
  services: ["repairs", "installs"],
  tone: "friendly",
  voiceGuidance: "Be concise.",
  preferredPhrases: ["fast response"],
  bannedPhrases: ["cheap", "guaranteed"],
  proofPoints: [{ kind: "stat", label: "20 years in business" }],
  personas: [{ key: "homeowner", label: "Homeowner" }],
  guardrails: { disallowedClaims: ["same-day always"], complianceNotes: "Stay licensed-scope." },
};

describe("fromAppContext", () => {
  it("folds brand fields into the runner's 5-field shape", () => {
    const c = fromAppContext(APP);
    expect(c.businessName).toBe("Acme Co");
    expect(c.industry).toContain("plumbing");
    expect(c.industry).toContain("repairs");
    expect(c.brandVoice).toContain("friendly");
    expect(c.brandVoice).toContain("fast response");
    expect(c.brandVoice).toContain("cheap"); // banned phrases surfaced as "never use"
    expect(c.compliance).toContain("Stay licensed-scope.");
    expect(c.compliance).toContain("same-day always");
    expect(c.creativePolicy).toContain("20 years in business");
  });
});

describe("resolveBusinessContext", () => {
  it("maps the fetched app context", async () => {
    const client = { apiGet: vi.fn(async () => ({ context: APP })) } as unknown as ArcClient;
    const c = await resolveBusinessContext(client);
    expect(c.businessName).toBe("Acme Co");
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/brand/context");
  });

  it("falls back to BSR_CONTEXT when the fetch fails", async () => {
    const client = { apiGet: vi.fn(async () => { throw new Error("boom"); }) } as unknown as ArcClient;
    const c = await resolveBusinessContext(client);
    expect(c).toEqual(BSR_CONTEXT);
  });
});
