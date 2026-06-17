import { describe, expect, it } from "vitest";

import { hardenImagePrompt } from "./prompt";

describe("hardenImagePrompt", () => {
  it("keeps the caller's intent", () => {
    expect(hardenImagePrompt("a flooded basement")).toContain("a flooded basement");
  });

  it("always forbids embedded text, logos, and brand names", () => {
    const out = hardenImagePrompt("any scene");
    expect(out).toMatch(/do not render any text/i);
    expect(out).toMatch(/logos/i);
    expect(out).toMatch(/brand names/i);
  });

  it("injects a caller-provided style but stays business-agnostic (no industry baked in)", () => {
    const out = hardenImagePrompt("a kitchen", { style: "candid documentary photograph, natural lighting" });
    expect(out).toContain("Style: candid documentary photograph, natural lighting.");
    expect(out).not.toMatch(/restoration|BSR/i);
  });

  it("omits the style line when none is given", () => {
    expect(hardenImagePrompt("a kitchen")).not.toContain("Style:");
  });
});
