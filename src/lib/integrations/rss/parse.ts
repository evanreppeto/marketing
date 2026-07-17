import type { FeedItem, WatchedFeed } from "@/domain";

/**
 * A small, dependency-free RSS 2.0 / Atom 1.0 item extractor.
 *
 * Not a general XML parser — it pulls the handful of fields a feed item actually
 * needs (title, link, id/guid, date, summary) from `<item>` (RSS) and `<entry>`
 * (Atom) blocks. That scope is what makes a regex approach safe here: real feeds are
 * messy, but these five fields are well-standardised, and the alternative is adding
 * an XML-parser dependency for a job this size. Everything the codebase's own HTTP
 * clients do — plain fetch, no deps — this mirrors.
 *
 * Handles the real-world cases that actually bite: CDATA sections, the five XML
 * entities plus numeric character refs, Atom's `<link href>` attribute vs RSS's text
 * `<link>`, and `<guid>`/`<id>` for stable dedup.
 */

/** Split a document into its item/entry blocks, whichever the feed uses. */
function itemBlocks(xml: string): string[] {
  const rss = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  if (rss.length) return rss;
  return [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#34": '"' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    const key = body.toLowerCase();
    if (key in NAMED_ENTITIES) return NAMED_ENTITIES[key];
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return whole; // unknown named entity — leave it rather than mangle
  });
}

/** Inner text of the first matching tag, CDATA-aware, entity-decoded, trimmed. */
function tagText(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
  if (!m) return null;
  // Unwrap CDATA first — but its contents are often HTML (a description is a common
  // case), so strip tags + decode entities regardless of whether it was wrapped.
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/i.exec(m[1]);
  const inner = cdata ? cdata[1] : m[1];
  const text = decodeEntities(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return text || null;
}

/** An attribute value off the first matching self-describing tag (Atom `<link href>`). */
function tagAttr(block: string, tag: string, attr: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"[^>]*>`, "i").exec(block);
  return m ? decodeEntities(m[1]).trim() || null : null;
}

/** RSS `<link>text</link>`, else Atom `<link href="…">` (prefer rel="alternate"/no-rel). */
function extractLink(block: string): string | null {
  const rss = tagText(block, "link");
  if (rss && /^https?:\/\//i.test(rss)) return rss;
  // Atom: pick an alternate/plain link over enclosure/self.
  const links = [...block.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const pick =
    links.find((l) => /\brel\s*=\s*"alternate"/i.test(l)) ??
    links.find((l) => !/\brel\s*=/i.test(l)) ??
    links[0];
  if (!pick) return null;
  const href = /\bhref\s*=\s*"([^"]*)"/i.exec(pick);
  return href ? decodeEntities(href[1]).trim() || null : null;
}

function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw); // Date.parse handles both RFC-822 (RSS) and ISO-8601 (Atom)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Parse a feed document into items. `feed` (the watched-feed descriptor) is stamped
 * onto each item so the detector knows which source and framing it came from.
 * Returns [] for anything unparseable — a malformed feed yields no items, never throws.
 */
export function parseFeedXml(xml: string, feed?: WatchedFeed): FeedItem[] {
  if (typeof xml !== "string" || !xml.trim()) return [];
  const out: FeedItem[] = [];
  for (const block of itemBlocks(xml)) {
    const title = tagText(block, "title");
    if (!title) continue; // an item with no title isn't actionable
    const link = extractLink(block);
    // Stable id: RSS guid, Atom id, else the link. Without one we can't dedup, so skip.
    const id = tagText(block, "guid") ?? tagText(block, "id") ?? link;
    if (!id) continue;
    const publishedAt = toIso(
      tagText(block, "pubDate") ?? tagText(block, "published") ?? tagText(block, "updated") ?? tagText(block, "dc:date"),
    );
    const summary = tagText(block, "description") ?? tagText(block, "summary") ?? tagText(block, "content");
    out.push({ id, title, link, summary, publishedAt, ...(feed ? { feed } : {}) });
  }
  return out;
}
