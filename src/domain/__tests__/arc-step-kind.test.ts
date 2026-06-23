import { describe, expect, it } from "vitest";

import { stepGlyphKind } from "@/domain";

describe("stepGlyphKind", () => {
  it("returns an explicit kind verbatim when present", () => {
    expect(stepGlyphKind({ label: "anything at all", kind: "media" })).toBe("media");
  });

  it("classifies search-like labels", () => {
    expect(stepGlyphKind({ label: "Pulled 3 inactive accounts" })).toBe("search");
    expect(stepGlyphKind({ label: "Searched CRM for lapsed leads" })).toBe("search");
    expect(stepGlyphKind({ label: "Reviewing the pipeline" })).toBe("search");
  });

  it("classifies match-like labels", () => {
    expect(stepGlyphKind({ label: "Matched persona — Homeowner (0.86)" })).toBe("match");
    expect(stepGlyphKind({ label: "Scored the opportunity" })).toBe("match");
  });

  it("classifies draft-like labels", () => {
    expect(stepGlyphKind({ label: "Drafting outreach angle" })).toBe("draft");
    expect(stepGlyphKind({ label: "Wrote the email copy" })).toBe("draft");
  });

  it("classifies media-like labels", () => {
    expect(stepGlyphKind({ label: "Rendering a 4:5 image" })).toBe("media");
    expect(stepGlyphKind({ label: "Upscaling the hero video" })).toBe("media");
  });

  it("classifies tool-like labels", () => {
    expect(stepGlyphKind({ label: "Calling crm.query tool" })).toBe("tool");
  });

  it("falls back to think for unclassifiable labels", () => {
    expect(stepGlyphKind({ label: "Considering the options" })).toBe("think");
    expect(stepGlyphKind({ label: "" })).toBe("think");
  });
});
