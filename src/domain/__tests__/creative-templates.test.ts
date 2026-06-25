import { describe, expect, it } from "vitest";

import {
  CREATIVE_DIMENSIONS,
  CREATIVE_TEMPLATE_IDS,
  normalizeCreativeFormat,
  resolveFontRole,
  selectCreativeTemplate,
  toBrandTokens,
} from "../creative-templates";
import type { BusinessProfile } from "../brand-kit";

describe("normalizeCreativeFormat", () => {
  it("accepts canonical ratios", () => {
    expect(normalizeCreativeFormat("1:1")).toBe("1:1");
    expect(normalizeCreativeFormat("4:5")).toBe("4:5");
    expect(normalizeCreativeFormat("9:16")).toBe("9:16");
    expect(normalizeCreativeFormat("16:9")).toBe("16:9");
  });
  it("maps friendly names and defaults to 1:1", () => {
    expect(normalizeCreativeFormat("portrait")).toBe("4:5");
    expect(normalizeCreativeFormat("STORY")).toBe("9:16");
    expect(normalizeCreativeFormat("landscape")).toBe("16:9");
    expect(normalizeCreativeFormat(undefined)).toBe("1:1");
    expect(normalizeCreativeFormat("nonsense")).toBe("1:1");
  });
});

describe("CREATIVE_DIMENSIONS", () => {
  it("has pixel sizes for every format", () => {
    expect(CREATIVE_DIMENSIONS["1:1"]).toEqual({ width: 1080, height: 1080 });
    expect(CREATIVE_DIMENSIONS["4:5"]).toEqual({ width: 1080, height: 1350 });
    expect(CREATIVE_DIMENSIONS["9:16"]).toEqual({ width: 1080, height: 1920 });
    expect(CREATIVE_DIMENSIONS["16:9"]).toEqual({ width: 1920, height: 1080 });
  });
});

describe("selectCreativeTemplate", () => {
  it("honors a valid hint", () => {
    expect(selectCreativeTemplate({ hint: "editorial" })).toBe("editorial");
    expect(selectCreativeTemplate({ hint: "MINIMAL" })).toBe("minimal");
  });
  it("falls back to a deterministic seed-based pick when hint is absent/invalid", () => {
    const a = selectCreativeTemplate({ hint: "bogus", seed: "campaign-42" });
    const b = selectCreativeTemplate({ seed: "campaign-42" });
    expect(a).toBe(b); // deterministic for the same seed
    expect(CREATIVE_TEMPLATE_IDS).toContain(a);
  });
  it("varies across different seeds", () => {
    const picks = new Set(
      ["a", "b", "c", "d", "e", "f"].map((s) => selectCreativeTemplate({ seed: s })),
    );
    expect(picks.size).toBeGreaterThan(1); // not all identical
  });
});

describe("resolveFontRole", () => {
  it("detects serif families", () => {
    expect(resolveFontRole("Georgia")).toBe("serif");
    expect(resolveFontRole("Playfair Display")).toBe("serif");
    expect(resolveFontRole("Source Serif 4")).toBe("serif");
  });
  it("defaults everything else to sans", () => {
    expect(resolveFontRole("Inter")).toBe("sans");
    expect(resolveFontRole(undefined)).toBe("sans");
    expect(resolveFontRole("")).toBe("sans");
  });
});

describe("toBrandTokens", () => {
  it("returns neutral tokens when no profile", () => {
    const t = toBrandTokens(null);
    expect(t.logoUrl).toBeNull();
    expect(t.accent).toMatch(/^#/);
    expect(t.headingFont).toBeTruthy();
  });
  it("maps palette + logo + short mark from a profile", () => {
    const profile = {
      displayName: "Big Shoulders Restoration",
      logoUrl: "https://cdn/logo.png",
      shortMark: "BSR",
      accent: "#d4342b",
      brandPalette: {
        primary: { label: "Primary", hex: "#16181d" },
        secondary: { label: "Secondary", hex: "#3b3f47" },
        accent: { label: "Accent", hex: "#d4342b" },
        dark: { label: "Dark", hex: "#0f1115" },
        light: { label: "Light", hex: "#f5f3ee" },
        headingFont: "Inter",
        bodyFont: "Inter",
      },
    } as unknown as BusinessProfile;
    const t = toBrandTokens(profile);
    expect(t.primary).toBe("#16181d");
    expect(t.accent).toBe("#d4342b");
    expect(t.logoUrl).toBe("https://cdn/logo.png");
    expect(t.shortMark).toBe("BSR");
    expect(t.displayName).toBe("Big Shoulders Restoration");
  });
});
