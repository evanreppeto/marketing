import { describe, expect, it } from "vitest";

import { DEFAULT_PERSONAS } from "./default-personas";
import {
  INDUSTRY_OPTIONS,
  INDUSTRY_TEMPLATES,
  isKnownIndustry,
  personasForIndustry,
} from "./industry-templates";
import { seedDefaultPersonas } from "./persistence";

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

describe("industry templates catalog", () => {
  it("lists general first as the default/fallback", () => {
    expect(INDUSTRY_TEMPLATES[0].key).toBe("general");
    expect(INDUSTRY_OPTIONS[0]).toEqual({ value: "general", label: "General / other" });
    expect(personasForIndustry("general")).toBe(DEFAULT_PERSONAS);
  });

  it("returns the matching pack for a known industry", () => {
    const pack = personasForIndustry("professional_services");
    expect(pack.map((p) => p.slug)).toEqual(["new-inquiry", "active-client", "referral-source", "dormant-client"]);
    expect(pack.every((p) => p.cta && p.cta.length > 0)).toBe(true);
  });

  it("falls back to the neutral set for unknown / unset industries", () => {
    expect(personasForIndustry("does-not-exist")).toBe(DEFAULT_PERSONAS);
    expect(personasForIndustry(undefined)).toBe(DEFAULT_PERSONAS);
    expect(personasForIndustry(null)).toBe(DEFAULT_PERSONAS);
  });

  it("recognizes known vs unknown industry keys", () => {
    expect(isKnownIndustry("saas")).toBe(true);
    expect(isKnownIndustry("general")).toBe(true);
    expect(isKnownIndustry("nope")).toBe(false);
    expect(isKnownIndustry(undefined)).toBe(false);
  });

  it("every pack has unique kebab slugs and spans all three segments", () => {
    for (const template of INDUSTRY_TEMPLATES) {
      const slugs = template.personas.map((p) => p.slug);
      expect(slugs.length, `${template.key} has personas`).toBeGreaterThan(0);
      expect(new Set(slugs).size, `${template.key} slugs unique`).toBe(slugs.length);
      for (const slug of slugs) expect(slug, `${template.key} slug kebab`).toMatch(KEBAB);
      const segments = new Set(template.personas.map((p) => p.segment));
      for (const seg of ["acquisition", "engagement", "retention"] as const) {
        expect(segments.has(seg), `${template.key} covers ${seg}`).toBe(true);
      }
    }
  });
});

// Minimal fake client that satisfies seedDefaultPersonas' count + insert calls.
function fakeClient(existingCount: number, capture: { rows?: Record<string, unknown>[] }) {
  return {
    from: () => ({
      select: () => ({ eq: async () => ({ count: existingCount, error: null }) }),
      insert: async (rows: Record<string, unknown>[]) => {
        capture.rows = rows;
        return { error: null };
      },
    }),
  } as never;
}

describe("seedDefaultPersonas — industry aware", () => {
  it("seeds the industry pack (with cta) into an empty org", async () => {
    const capture: { rows?: Record<string, unknown>[] } = {};
    const n = await seedDefaultPersonas({ orgId: "org-1", client: fakeClient(0, capture), industry: "real_estate" });
    expect(n).toBe(4);
    expect(capture.rows?.map((r) => r.slug)).toEqual(["buyer-lead", "seller-lead", "investor", "past-client"]);
    expect(capture.rows?.every((r) => typeof r.cta === "string")).toBe(true);
    expect(capture.rows?.every((r) => r.org_id === "org-1" && r.is_active === true)).toBe(true);
  });

  it("falls back to the neutral set for an unknown industry", async () => {
    const capture: { rows?: Record<string, unknown>[] } = {};
    await seedDefaultPersonas({ orgId: "org-2", client: fakeClient(0, capture), industry: "banana" });
    expect(capture.rows?.map((r) => r.slug)).toEqual(DEFAULT_PERSONAS.map((p) => p.slug));
  });

  it("is idempotent — a no-op when the org already has personas", async () => {
    const capture: { rows?: Record<string, unknown>[] } = {};
    const n = await seedDefaultPersonas({ orgId: "org-3", client: fakeClient(4, capture), industry: "saas" });
    expect(n).toBe(0);
    expect(capture.rows).toBeUndefined();
  });
});
