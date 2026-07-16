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
    expect(buildCollectorScript()).toContain("if (!token && !campaignId) return;");
  });

  it("produces a self-contained IIFE (no imports/exports)", () => {
    const s = buildCollectorScript();
    expect(s.trimStart().startsWith("(function")).toBe(true);
    expect(s).not.toContain("import ");
    expect(s).not.toContain("export ");
  });

  // --- consent (P4) ---

  it("honors Global Privacy Control and DNT before sending anything", () => {
    const s = buildCollectorScript();
    expect(s).toContain("globalPrivacyControl");
    expect(s).toContain("doNotTrack");
    // The refusal is computed up front and gates every send.
    expect(s).toContain('var refused = ls(OPT) === "1" || gpc();');
    expect(s).toContain("function blocked() { return refused || (deferUntilConsent && !consentSignal); }");
  });

  it("supports a consent-gated tag that defers until the banner grants", () => {
    const s = buildCollectorScript();
    expect(s).toContain('data-consent") === "required"');
    expect(s).toContain("consent: function (granted)");
  });

  it("never claims consent unless the page affirmatively signalled it", () => {
    const s = buildCollectorScript();
    // Default is window.arcConsent === true (not simply "not deferred"), so a
    // workspace in explicit mode stays protected if a page forgets the attribute.
    expect(s).toContain("var consentSignal = window.arcConsent === true;");
    expect(s).toContain("consent: consentSignal || undefined");
  });

  it("exposes optOut/optIn, and optOut erases server-side", () => {
    const s = buildCollectorScript();
    expect(s).toContain("optOut: function ()");
    expect(s).toContain("optIn: function ()");
    expect(s).toContain("/api/v1/journey/opt-out");
  });
});
