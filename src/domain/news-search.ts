import type { FeedWatchKind } from "./rss-signals";

/**
 * Pure config logic for the `news-search` connector: the search queries a workspace
 * watches for news mentions. Distinct from rss-signals — that watches feed URLs you
 * supply; this searches all news for a term, so it finds mentions on sites that
 * publish no feed. The article → opportunity mapping is shared: a matched article
 * becomes a FeedItem and flows through the same detectFeedSignalOpportunities as RSS.
 *
 * No I/O. Tenant-neutral: the queries are the operator's, nothing is assumed.
 */

const WATCH_KINDS = new Set<FeedWatchKind>(["brand", "competitor", "industry"]);
const DEFAULT_WATCH_KIND: FeedWatchKind = "industry";

/** A term the workspace watches the news for, with the angle it framed it as. */
export type WatchedQuery = { query: string; kind: FeedWatchKind; label?: string };

// A leading `<kind>:` sets the angle; the rest of the line is the search term (which
// may contain spaces, unlike a feed URL). Split the prefix off explicitly rather than
// with an optional group, so a bare "competitor:" with no term reads as invalid
// instead of being mistaken for a query literally named "competitor:".
const KIND_PREFIX_RE = /^(brand|competitor|industry)\s*:\s*(.*)$/i;

export type NewsQueriesInput = {
  queries: WatchedQuery[];
  /** Lines that couldn't be read — surfaced, not dropped. */
  invalid: string[];
};

/**
 * Parse the queries textarea: one search term per line, optional `brand:` /
 * `competitor:` / `industry:` prefix. Blank lines ignored; duplicates collapsed. A
 * line whose term is empty after the prefix is invalid.
 */
export function parseNewsQueriesInput(text: string): NewsQueriesInput {
  const queries: WatchedQuery[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of (text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const prefixed = KIND_PREFIX_RE.exec(line);
    const term = (prefixed ? prefixed[2] : line).trim();
    if (!term) {
      // A line that is only a "competitor:" prefix, or otherwise empty after it.
      invalid.push(line);
      continue;
    }
    const dedupKey = term.toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const kind = (prefixed?.[1]?.toLowerCase() as FeedWatchKind) || DEFAULT_WATCH_KIND;
    queries.push({ query: term, kind: WATCH_KINDS.has(kind) ? kind : DEFAULT_WATCH_KIND });
  }
  return { queries, invalid };
}

/** Render queries back into the editor's one-per-line form. Round-trips the parse. */
export function formatNewsQueriesInput(queries: WatchedQuery[]): string {
  return queries.map((q) => `${q.kind === DEFAULT_WATCH_KIND ? "" : `${q.kind}: `}${q.query}`).join("\n");
}

/** The watched queries from a workspace_connectors.config blob. */
export function parseNewsQueryConfig(config: Record<string, unknown> | null | undefined): WatchedQuery[] {
  const raw = (config ?? {}).queries;
  return parseNewsQueriesInput(typeof raw === "string" ? raw : "").queries;
}

export function isNewsSearchConfigured(queries: WatchedQuery[]): boolean {
  return queries.length > 0;
}
