import { describe, expect, it } from "vitest";
import {
  NEUTRAL_DEFAULTS,
  NEUTRAL_PERSONAS,
  parseBusinessProfile,
  validateBusinessProfile,
  type BusinessProfile,
  type PersonaDefinition,
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

describe("parseBusinessProfile", () => {
  it("maps a snake_case DB row to a BusinessProfile, applying defaults for nulls", () => {
    const profile = parseBusinessProfile({
      display_name: "Acme Co",
      services: ["consulting"],
      accent: null,
      density: null,
      guardrails: { disallowedClaims: ["x"], complianceNotes: "y" },
      status: "active",
    });
    expect(profile.displayName).toBe("Acme Co");
    expect(profile.services).toEqual(["consulting"]);
    expect(profile.accent).toBe(NEUTRAL_DEFAULTS.accent);
    expect(profile.density).toBe("comfortable");
    expect(profile.guardrails.complianceNotes).toBe("y");
    expect(profile.status).toBe("active");
  });

  it("falls back to neutral defaults when given an empty object", () => {
    const profile = parseBusinessProfile({});
    expect(profile.status).toBe("draft");
    expect(profile.services).toEqual([]);
    expect(profile.guardrails.disallowedClaims).toEqual(
      NEUTRAL_DEFAULTS.guardrails.disallowedClaims,
    );
  });
});

describe("validateBusinessProfile", () => {
  it("rejects an empty display name", () => {
    const result = validateBusinessProfile({ ...NEUTRAL_DEFAULTS, displayName: "  " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("display_name_required");
  });

  it("rejects a non-hex accent", () => {
    const result = validateBusinessProfile({ ...NEUTRAL_DEFAULTS, displayName: "Acme", accent: "blue" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("accent_invalid");
  });

  it("accepts a valid profile", () => {
    const result = validateBusinessProfile({ ...NEUTRAL_DEFAULTS, displayName: "Acme", accent: "#1A2B3C" });
    expect(result.ok).toBe(true);
  });
});

import { INDUSTRY_TEMPLATES, getIndustryTemplate } from "@/domain/brand-kit";
import { assembleArcContext, type ArcBusinessContext } from "@/domain/brand-kit";

describe("INDUSTRY_TEMPLATES", () => {
  it("includes broad buckets and a neutral start, all equal citizens", () => {
    const ids = INDUSTRY_TEMPLATES.map((t) => t.id);
    expect(ids).toContain("neutral");
    expect(ids).toContain("home_property_services");
    expect(ids).toContain("professional_services");
    // restoration is NOT a top-level bucket; it is only a flavor under home/property
    expect(ids).not.toContain("restoration");
    expect(INDUSTRY_TEMPLATES.length).toBeGreaterThanOrEqual(6);
  });

  it("every non-neutral template pre-fills personas and services", () => {
    for (const tpl of INDUSTRY_TEMPLATES) {
      if (tpl.id === "neutral") continue;
      expect(tpl.personas.length).toBeGreaterThan(0);
      expect(tpl.profile.services && tpl.profile.services.length).toBeGreaterThan(0);
    }
  });

  it("getIndustryTemplate returns the neutral template for an unknown id", () => {
    expect(getIndustryTemplate("does_not_exist").id).toBe("neutral");
    expect(getIndustryTemplate("professional_services").id).toBe("professional_services");
  });
});

describe("assembleArcContext", () => {
  it("derives the business name and carries voice, services, and guardrails", () => {
    const profile: BusinessProfile = { ...NEUTRAL_DEFAULTS, displayName: "Acme Co", services: ["consulting"], tone: "professional" };
    const ctx: ArcBusinessContext = assembleArcContext(profile, NEUTRAL_PERSONAS);
    expect(ctx.businessName).toBe("Acme Co");
    expect(ctx.services).toEqual(["consulting"]);
    expect(ctx.tone).toBe("professional");
    expect(ctx.guardrails.disallowedClaims.length).toBeGreaterThan(0);
    expect(ctx.personas.map((p) => p.key)).toContain("decision_maker");
  });

  it("uses a safe placeholder name when displayName is blank", () => {
    const ctx = assembleArcContext(NEUTRAL_DEFAULTS, []);
    expect(ctx.businessName).toBe("the business");
    expect(ctx.personas).toEqual([]);
  });

  it("only includes active personas, sorted by sortOrder", () => {
    const personas: PersonaDefinition[] = [
      { key: "b", label: "B", audienceType: "customer", sortOrder: 2, isActive: true, metadata: {} },
      { key: "a", label: "A", audienceType: "customer", sortOrder: 1, isActive: true, metadata: {} },
      { key: "x", label: "X", audienceType: "customer", sortOrder: 0, isActive: false, metadata: {} },
    ];
    const ctx = assembleArcContext({ ...NEUTRAL_DEFAULTS, displayName: "Acme" }, personas);
    expect(ctx.personas.map((p) => p.key)).toEqual(["a", "b"]);
  });
});
