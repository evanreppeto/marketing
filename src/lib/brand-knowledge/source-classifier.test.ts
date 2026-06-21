import { describe, expect, it } from "vitest";

import { brandSourceSortScore, classifyBrandSource } from "./source-classifier";

describe("classifyBrandSource", () => {
  it("recognizes brand guidelines from the title", () => {
    const result = classifyBrandSource({
      fileName: "2026_Brand_Guidelines.pdf",
      kind: "document",
      source: "google_drive",
    });

    expect(result.label).toBe("Brand guide");
    expect(result.confidence).toBe("high");
  });

  it("recognizes broad offering documents without requiring a service business", () => {
    const result = classifyBrandSource({
      fileName: "Product catalog and pricing.docx",
      kind: "document",
      source: "uploaded",
    });

    expect(result.label).toBe("Offerings source");
  });

  it("treats Drive documents as source documents when the title is generic", () => {
    const result = classifyBrandSource({
      fileName: "June notes.pdf",
      kind: "document",
      source: "google_drive",
    });

    expect(result.label).toBe("Source document");
    expect(result.confidence).toBe("medium");
  });

  it("treats generic URL imports as source documents", () => {
    const result = classifyBrandSource({
      fileName: "page.txt",
      kind: "document",
      source: "url",
    });

    expect(result.label).toBe("Source document");
    expect(result.confidence).toBe("medium");
  });

  it("recognizes tagged media as brand reference material", () => {
    const result = classifyBrandSource({
      fileName: "hero-photo.jpg",
      kind: "image",
      source: "uploaded",
      tags: ["brand source"],
    });

    expect(result.label).toBe("Visual identity");
    expect(result.confidence).toBe("high");
  });

  it("prefers high confidence and Arc-readable files in sorting", () => {
    const high = classifyBrandSource({ fileName: "Brand book.pdf", kind: "document", source: "uploaded" });
    const medium = classifyBrandSource({ fileName: "Notes.pdf", kind: "document", source: "uploaded" });

    expect(brandSourceSortScore(high, true)).toBeLessThan(brandSourceSortScore(medium, true));
    expect(brandSourceSortScore(high, true)).toBeLessThan(brandSourceSortScore(high, false));
  });
});
