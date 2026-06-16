import { describe, expect, it } from "vitest";
import {
  NEUTRAL_DEFAULTS,
  NEUTRAL_PERSONAS,
  type BusinessProfile,
} from "@/domain/brand-kit";

describe("NEUTRAL_DEFAULTS", () => {
  it("is industry-agnostic: no services, no restoration assumptions, draft status", () => {
    expect(NEUTRAL_DEFAULTS.services).toEqual([]);
    expect(NEUTRAL_DEFAULTS.status).toBe("draft");
    expect(NEUTRAL_DEFAULTS.density).toBe("comfortable");
    expect(NEUTRAL_DEFAULTS.motion).toBe("standard");
    const serialized = JSON.stringify(NEUTRAL_DEFAULTS).toLowerCase();
    expect(serialized).not.toContain("restoration");
    expect(serialized).not.toContain("water");
  });

  it("ships universally-safe guardrails only", () => {
    expect(NEUTRAL_DEFAULTS.guardrails.disallowedClaims.length).toBeGreaterThan(0);
    const claims = NEUTRAL_DEFAULTS.guardrails.disallowedClaims.join(" ").toLowerCase();
    expect(claims).not.toContain("insurance");
  });

  it("provides generic starter personas", () => {
    const keys = NEUTRAL_PERSONAS.map((p) => p.key);
    expect(keys).toContain("decision_maker");
    expect(NEUTRAL_PERSONAS.every((p) => p.label.length > 0)).toBe(true);
  });
});
