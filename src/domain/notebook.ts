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
