import { describe, expect, it } from "vitest";

import { decideCollection, gpcFromHeaders, normalizeConsentMode } from "../journey-consent";

describe("decideCollection", () => {
  it("records a plain campaign arrival under implied consent", () => {
    expect(decideCollection({ mode: "implied" })).toEqual({ allowed: true });
  });

  it("records nothing when the workspace has collection off", () => {
    expect(decideCollection({ mode: "off" })).toEqual({ allowed: false, reason: "disabled" });
    // Off beats even an affirmative consent signal.
    expect(decideCollection({ mode: "off", consentGiven: true })).toEqual({ allowed: false, reason: "disabled" });
  });

  it("refuses an opted-out visitor regardless of mode or consent", () => {
    expect(decideCollection({ mode: "implied", optedOut: true })).toEqual({ allowed: false, reason: "opted_out" });
    expect(decideCollection({ mode: "explicit", optedOut: true, consentGiven: true })).toEqual({ allowed: false, reason: "opted_out" });
  });

  it("honors Global Privacy Control — even over a banner accept", () => {
    expect(decideCollection({ mode: "implied", gpc: true })).toEqual({ allowed: false, reason: "gpc" });
    expect(decideCollection({ mode: "explicit", gpc: true, consentGiven: true })).toEqual({ allowed: false, reason: "gpc" });
  });

  it("requires an affirmative signal in explicit mode", () => {
    expect(decideCollection({ mode: "explicit" })).toEqual({ allowed: false, reason: "consent_required" });
    expect(decideCollection({ mode: "explicit", consentGiven: false })).toEqual({ allowed: false, reason: "consent_required" });
    expect(decideCollection({ mode: "explicit", consentGiven: true })).toEqual({ allowed: true });
  });
});

describe("normalizeConsentMode", () => {
  it("passes through valid modes", () => {
    expect(normalizeConsentMode("explicit")).toBe("explicit");
    expect(normalizeConsentMode("off")).toBe("off");
  });

  it("defaults anything unknown to implied", () => {
    expect(normalizeConsentMode("nonsense")).toBe("implied");
    expect(normalizeConsentMode(undefined)).toBe("implied");
    expect(normalizeConsentMode(null)).toBe("implied");
  });
});

describe("gpcFromHeaders", () => {
  it("reads Sec-GPC and DNT", () => {
    expect(gpcFromHeaders((n) => (n === "sec-gpc" ? "1" : null))).toBe(true);
    expect(gpcFromHeaders((n) => (n === "dnt" ? "1" : null))).toBe(true);
    expect(gpcFromHeaders(() => null)).toBe(false);
    expect(gpcFromHeaders((n) => (n === "sec-gpc" ? "0" : null))).toBe(false);
  });
});
