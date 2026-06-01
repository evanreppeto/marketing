import { describe, expect, it } from "vitest";

import { parseFrontmatter, extractLinks, resolveWikiTarget, computeBacklinks, toRenderableMarkdown, computeGraphLayout, type LinkResolutionContext, type VaultNote, type GraphNode } from "../notebook";

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

const NOTES: VaultNote[] = [
  { slug: "a", title: "A", folder: "Playbooks", tags: [], author: "Evan", status: "Published", updated: "Today", body: "Links to [[b]]." },
  { slug: "b", title: "B", folder: "Playbooks", tags: [], author: "Mark", status: "Published", updated: "Today", body: "No links." },
  { slug: "c", title: "C", folder: "SOPs", tags: [], author: "Evan", status: "Published", updated: "Today", body: "Also links to [[b|Bee]]." },
];

describe("computeBacklinks", () => {
  it("returns every note linking to the slug, sorted by title", () => {
    expect(computeBacklinks(NOTES, "b").map((n) => n.slug)).toEqual(["a", "c"]);
  });

  it("returns an empty array when nothing links to the slug", () => {
    expect(computeBacklinks(NOTES, "a")).toEqual([]);
  });
});

describe("toRenderableMarkdown", () => {
  it("rewrites wiki-links to markdown links with resolved hrefs", () => {
    const ctx = { notes: new Map([["b", "/notebook/b"]]), records: new Map(), personas: new Map() };
    expect(toRenderableMarkdown("Go to [[b|Bee]] now.", ctx)).toBe("Go to [Bee](/notebook/b) now.");
  });

  it("rewrites unresolved wiki-links with the sentinel href", () => {
    const ctx = { notes: new Map(), records: new Map(), personas: new Map() };
    expect(toRenderableMarkdown("Missing [[ghost]].", ctx)).toBe("Missing [ghost](unresolved:ghost).");
  });
});

describe("computeGraphLayout", () => {
  it("places the focus node at the center and others on a deterministic ring", () => {
    const nodes: GraphNode[] = [
      { id: "focus", label: "Focus", kind: "note" },
      { id: "n1", label: "One", kind: "note" },
      { id: "n2", label: "Two", kind: "record" },
    ];
    const layout = computeGraphLayout(nodes, "focus", 100, 100);

    const focus = layout.find((n) => n.id === "focus")!;
    expect([focus.x, focus.y]).toEqual([50, 50]);
    const others = layout.filter((n) => n.id !== "focus");
    const radii = others.map((n) => Math.round(Math.hypot(n.x - 50, n.y - 50)));
    expect(new Set(radii).size).toBe(1);
  });

  it("is deterministic across calls", () => {
    const nodes: GraphNode[] = [
      { id: "a", label: "A", kind: "note" },
      { id: "b", label: "B", kind: "note" },
    ];
    expect(computeGraphLayout(nodes, "a", 200, 200)).toEqual(computeGraphLayout(nodes, "a", 200, 200));
  });
});
