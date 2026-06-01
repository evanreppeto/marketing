import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "../notebook";

describe("parseFrontmatter", () => {
  it("splits YAML frontmatter from the body and parses scalars and lists", () => {
    const raw = [
      "---",
      "title: Apex Plumbing Intel",
      "author: Mark",
      "status: Needs review",
      "tags: [partner, plumbing]",
      "---",
      "",
      "# Apex Plumbing Intel",
      "Body text here.",
    ].join("\n");

    const result = parseFrontmatter(raw);

    expect(result.frontmatter).toEqual({
      title: "Apex Plumbing Intel",
      author: "Mark",
      status: "Needs review",
      tags: ["partner", "plumbing"],
    });
    expect(result.body.trim().startsWith("# Apex Plumbing Intel")).toBe(true);
  });

  it("returns an empty frontmatter object when no frontmatter block is present", () => {
    const result = parseFrontmatter("# Just a heading\nNo frontmatter.");
    expect(result.frontmatter).toEqual({});
    expect(result.body.trim().startsWith("# Just a heading")).toBe(true);
  });
});
