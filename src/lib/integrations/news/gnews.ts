import type { FeedItem, WatchedQuery } from "@/domain";

/**
 * The live source behind the news-search connector, backed by GNews (gnews.io) — a
 * documented REST news API keyed on a simple apikey param (no OAuth). The workspace
 * brings its own key (byo_key). Read-only and best-effort per query: one query that
 * errors or rate-limits is skipped, never sinks the scan — mirroring the NWS weather
 * source.
 *
 * A matched article is mapped to the shared FeedItem shape, so news-search reuses the
 * exact detectFeedSignalOpportunities → news_signal pipeline that rss-signals uses.
 */

export type NewsItemSource = {
  listRecentItems(now: string): Promise<FeedItem[]>;
};

const GNEWS_ENDPOINT = "https://gnews.io/api/v4/search";
const FETCH_TIMEOUT_MS = 8000;
const MAX_PER_QUERY = 10;

/** GNews /search response (the fields we read). */
type GNewsArticle = {
  title?: string;
  description?: string;
  content?: string;
  url?: string;
  publishedAt?: string;
  source?: { name?: string; url?: string };
};
type GNewsResponse = { articles?: GNewsArticle[]; errors?: string[] };

export type NewsFetchOptions = {
  /** Injected in tests so no live network is hit. Maps a query to its articles. */
  fetchImpl?: (query: WatchedQuery, apiKey: string) => Promise<GNewsArticle[]>;
  /** Restrict to the last N days at the API level (fewer, fresher results). */
  fromDays?: number;
};

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Map one GNews article + the query it matched to a FeedItem. Null if unusable. */
export function gnewsArticleToFeedItem(article: GNewsArticle, query: WatchedQuery): FeedItem | null {
  const title = article.title?.trim();
  const link = article.url?.trim() || null;
  // Stable id for dedup: the article URL (canonical), else title+source.
  const id = link ?? (title ? `news:${query.query}:${title}` : null);
  if (!title || !id) return null;
  // Parse the date defensively — new Date("nonsense").toISOString() THROWS, so check
  // the epoch first and only format a valid one.
  const ms = article.publishedAt ? Date.parse(article.publishedAt) : NaN;
  const publishedAt = Number.isNaN(ms) ? null : new Date(ms).toISOString();
  // The "source" the opportunity names: the operator's label for this watch if set,
  // else the publication, else the query itself.
  const label = query.label?.trim() || article.source?.name?.trim() || query.query;
  return {
    id,
    title,
    link,
    summary: article.description?.trim() || null,
    publishedAt,
    feed: { url: hostOf(article.source?.url) ?? query.query, kind: query.kind, label },
  };
}

async function defaultGNewsFetch(query: WatchedQuery, apiKey: string, fromDays?: number): Promise<GNewsArticle[]> {
  const params = new URLSearchParams({ q: query.query, apikey: apiKey, lang: "en", max: String(MAX_PER_QUERY), sortby: "publishedAt" });
  if (fromDays && fromDays > 0) {
    const from = new Date(Date.now() - fromDays * 24 * 60 * 60 * 1000).toISOString();
    params.set("from", from);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${GNEWS_ENDPOINT}?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as GNewsResponse;
    return Array.isArray(json.articles) ? json.articles : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Build a source that searches GNews for the given queries with the workspace key. */
export function gnewsSource(queries: WatchedQuery[], apiKey: string, opts: NewsFetchOptions = {}): NewsItemSource {
  const fetchImpl = opts.fetchImpl ?? ((q, k) => defaultGNewsFetch(q, k, opts.fromDays));
  return {
    async listRecentItems(): Promise<FeedItem[]> {
      const byId = new Map<string, FeedItem>();
      for (const query of queries) {
        try {
          for (const article of await fetchImpl(query, apiKey)) {
            const item = gnewsArticleToFeedItem(article, query);
            if (item && !byId.has(item.id)) byId.set(item.id, item);
          }
        } catch {
          // best-effort per query
        }
      }
      return [...byId.values()];
    },
  };
}
