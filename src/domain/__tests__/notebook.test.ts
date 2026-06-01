import { describe, expect, it } from "vitest";

import { parseFrontmatter, extractLinks, resolveWikiTarget, type LinkResolutionContext } from "../notebook";

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

function context(): LinkResolutionContext {
  return {
    notes: new Map([["apex-plumbing-co-intel", "/notebook/apex-plumbing-co-intel"]]),
    records: new Map([["apex-plumbing-co", "/crm/companies/apex-plumbing-co"]]),
    personas: new Map([["persona_insurance_agent", "/persona-intelligence"]]),
  };
}

describe("resolveWikiTarget", () => {
  it("resolves a note slug", () => {
    expect(resolveWikiTarget("apex-plumbing-co-intel", "Apex", context())).toEqual({
      kind: "note",
      target: "apex-plumbing-co-intel",
      label: "Apex",
      href: "/notebook/apex-plumbing-co-intel",
    });
  });

  it("resolves a CRM record id", () => {
    expect(resolveWikiTarget("apex-plumbing-co", "apex-plumbing-co", context()).kind).toBe("record");
  });

  it("resolves a persona key", () => {
    expect(resolveWikiTarget("persona_insurance_agent", "persona_insurance_agent", context()).kind).toBe("persona");
  });

  it("marks unknown targets as unresolved with a sentinel href", () => {
    const link = resolveWikiTarget("nonexistent", "nonexistent", context());
    expect(link.kind).toBe("unresolved");
    expect(link.href).toBe("unresolved:nonexistent");
  });
});

describe("extractLinks", () => {
  it("extracts plain and aliased wiki-links and resolves each", () => {
    const body = "See [[apex-plumbing-co-intel|the intel]] and [[apex-plumbing-co]] plus [[nonexistent]].";
    const links = extractLinks(body, context());
    expect(links.map((l) => [l.kind, l.label])).toEqual([
      ["note", "the intel"],
      ["record", "apex-plumbing-co"],
      ["unresolved", "nonexistent"],
    ]);
  });
});
