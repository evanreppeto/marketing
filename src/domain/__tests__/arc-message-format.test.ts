import { describe, expect, it } from "vitest";

import { normalizeArcBody } from "@/domain";

describe("normalizeArcBody", () => {
  it("breaks a run-on sentence boundary into a paragraph break", () => {
    const out = normalizeArcBody("…run them in parallel.Excellent! I've compiled the lists.");
    expect(out).toContain("parallel.\n\nExcellent!");
  });

  it("leaves already-spaced sentences untouched", () => {
    const text = "First sentence. Second sentence.";
    expect(normalizeArcBody(text)).toBe(text);
  });

  it("is idempotent", () => {
    const once = normalizeArcBody("a.Big jump.Another one");
    expect(normalizeArcBody(once)).toBe(once);
  });

  it("does not split decimals", () => {
    const text = "Version 3.14 ships today";
    expect(normalizeArcBody(text)).toBe(text);
  });

  it("does not split uppercase abbreviations", () => {
    const text = "Filed with the U.S.Census office";
    expect(normalizeArcBody(text)).toBe(text);
  });

  it("does not touch fenced code blocks", () => {
    const text = "```\nconst a = obj.Foo();\n```";
    expect(normalizeArcBody(text)).toBe(text);
  });

  it("does not touch inline code", () => {
    const text = "Call `obj.Foo()` to start";
    expect(normalizeArcBody(text)).toBe(text);
  });

  it("collapses runs of blank lines to a single paragraph break", () => {
    expect(normalizeArcBody("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("returns an empty string unchanged", () => {
    expect(normalizeArcBody("")).toBe("");
  });
});
