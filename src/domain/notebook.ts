export type NoteStatus = "Published" | "Draft" | "Needs review";

export type VaultNote = {
  slug: string;
  title: string;
  folder: string;
  tags: string[];
  author: string; // "Mark" or an operator name
  status: NoteStatus;
  updated: string;
  body: string; // raw markdown body (no frontmatter)
};

export type ParsedFrontmatter = {
  frontmatter: Record<string, string | string[]>;
  body: string;
};

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const frontmatter: Record<string, string | string[]> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    if (!key) continue;

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      frontmatter[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    } else {
      frontmatter[key] = rawValue;
    }
  }

  return { frontmatter, body: raw.slice(match[0].length) };
}

export type LinkKind = "note" | "record" | "persona" | "unresolved";

export type ResolvedLink = {
  kind: LinkKind;
  target: string;
  label: string;
  href: string;
};

export type LinkResolutionContext = {
  notes: Map<string, string>; // slug -> /notebook/<slug>
  records: Map<string, string>; // record id -> /crm/<object>/<id>
  personas: Map<string, string>; // persona key -> href
};

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

export function resolveWikiTarget(
  target: string,
  label: string,
  ctx: LinkResolutionContext,
): ResolvedLink {
  const note = ctx.notes.get(target);
  if (note) return { kind: "note", target, label, href: note };

  const record = ctx.records.get(target);
  if (record) return { kind: "record", target, label, href: record };

  const persona = ctx.personas.get(target);
  if (persona) return { kind: "persona", target, label, href: persona };

  return { kind: "unresolved", target, label, href: `unresolved:${target}` };
}

export function extractLinks(body: string, ctx: LinkResolutionContext): ResolvedLink[] {
  const links: ResolvedLink[] = [];
  for (const match of body.matchAll(WIKI_LINK_RE)) {
    const inner = match[1];
    const pipe = inner.indexOf("|");
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const label = (pipe === -1 ? inner : inner.slice(pipe + 1)).trim();
    links.push(resolveWikiTarget(target, label, ctx));
  }
  return links;
}

export function computeBacklinks(allNotes: VaultNote[], slug: string): VaultNote[] {
  return allNotes
    .filter((note) => note.slug !== slug)
    .filter((note) =>
      [...note.body.matchAll(WIKI_LINK_RE)].some((match) => {
        const inner = match[1];
        const pipe = inner.indexOf("|");
        const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
        return target === slug;
      }),
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function toRenderableMarkdown(body: string, ctx: LinkResolutionContext): string {
  return body.replace(WIKI_LINK_RE, (_full, inner: string) => {
    const pipe = inner.indexOf("|");
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const label = (pipe === -1 ? inner : inner.slice(pipe + 1)).trim();
    const link = resolveWikiTarget(target, label, ctx);
    return `[${link.label}](${link.href})`;
  });
}

export type GraphNode = {
  id: string;
  label: string;
  kind: LinkKind;
};

export type PlacedNode = GraphNode & { x: number; y: number };

export type GraphEdge = { from: string; to: string };

// Deterministic radial layout: focus node centered, the rest evenly spaced
// on a ring. No randomness, no physics — safe for server rendering.
export function computeGraphLayout(
  nodes: GraphNode[],
  focusId: string,
  width: number,
  height: number,
): PlacedNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.38;
  const ring = nodes.filter((n) => n.id !== focusId);

  return nodes.map((node) => {
    if (node.id === focusId) {
      return { ...node, x: cx, y: cy };
    }
    const index = ring.findIndex((n) => n.id === node.id);
    const angle = (index / Math.max(ring.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}
