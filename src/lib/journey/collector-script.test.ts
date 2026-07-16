import { describe, expect, it } from "vitest";

import { buildCollectorScript } from "./collector-script";

describe("buildCollectorScript", () => {
  it("embeds the served origin and posts to the collector", () => {
    const s = buildCollectorScript("https://arc.example");
    expect(s).toContain('var API = "https://arc.example"');
    expect(s).toContain("/api/v1/journey/collect");
  });

  it("injects the anonymousId form field and exposes window.arcJourney", () => {
    const s = buildCollectorScript();
    expect(s).toContain('name="anonymousId"');
    expect(s).toContain("window.arcJourney");
    expect(s).toContain("localStorage");
  });

  it("only fires on an attributable arrival (token or campaignId)", () => {
    expect(buildCollectorScript()).toContain("if (!token && !campaignId)");
  });

  it("produces a self-contained IIFE (no imports/exports)", () => {
    const s = buildCollectorScript();
    expect(s.trimStart().startsWith("(function")).toBe(true);
    expect(s).not.toContain("import ");
    expect(s).not.toContain("export ");
  });
});
