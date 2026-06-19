import { describe, expect, it } from "vitest";
import { NEUTRAL_DEFAULTS } from "@/domain";
import { buildBusinessProfileFromForm, splitLines } from "../form";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("splitLines", () => {
  it("splits on newlines, trims, drops blanks", () => {
    expect(splitLines("Repairs\n  Maintenance \n\nInspections")).toEqual([
      "Repairs",
      "Maintenance",
      "Inspections",
    ]);
  });
  it("returns [] for empty input", () => {
    expect(splitLines("")).toEqual([]);
    expect(splitLines("   ")).toEqual([]);
  });
});

describe("buildBusinessProfileFromForm", () => {
  it("maps fields over the current profile and coerces lists", () => {
    const profile = buildBusinessProfileFromForm(
      fd({
        displayName: "Acme Co",
        tagline: "We fix things",
        industry: "professional_services",
        websiteUrl: "https://acme.test",
        tone: "professional",
        services: "Consulting\nAdvisory",
        bannedPhrases: "we guarantee\nrisk-free",
        complianceNotes: "Stay truthful.",
        status: "active",
      }),
      NEUTRAL_DEFAULTS,
    );
    expect(profile.displayName).toBe("Acme Co");
    expect(profile.tagline).toBe("We fix things");
    expect(profile.services).toEqual(["Consulting", "Advisory"]);
    expect(profile.bannedPhrases).toEqual(["we guarantee", "risk-free"]);
    expect(profile.guardrails.complianceNotes).toBe("Stay truthful.");
    expect(profile.status).toBe("active");
    expect(profile.accent).toBe(NEUTRAL_DEFAULTS.accent);
  });

  it("treats blank optional text fields as null, not empty string", () => {
    const profile = buildBusinessProfileFromForm(fd({ displayName: "Acme", tagline: "" }), NEUTRAL_DEFAULTS);
    expect(profile.tagline).toBeNull();
  });

  it("allows an active profile to be saved back as a draft", () => {
    const profile = buildBusinessProfileFromForm(
      fd({ displayName: "Acme", status: "draft" }),
      { ...NEUTRAL_DEFAULTS, status: "active" },
    );

    expect(profile.status).toBe("draft");
  });

  it("uses uploaded logo and favicon URLs when present", () => {
    const profile = buildBusinessProfileFromForm(
      fd({
        displayName: "Acme",
        logoUrl: "https://old.example/logo.png",
        faviconUrl: "https://old.example/favicon.ico",
        logoUpload: "https://cdn.example/logo.png",
        faviconUpload: "https://cdn.example/favicon.png",
      }),
      NEUTRAL_DEFAULTS,
    );

    expect(profile.logoUrl).toBe("https://cdn.example/logo.png");
    expect(profile.faviconUrl).toBe("https://cdn.example/favicon.png");
  });
});
