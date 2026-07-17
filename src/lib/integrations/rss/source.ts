import type { FeedItem, WatchedFeed } from "@/domain";

import { parseFeedXml } from "./parse";

/**
 * The live fetch source behind the rss-signals connector: pull each watched feed,
 * parse it, and return the union of items. Best-effort per feed — one feed that
 * 404s or times out is skipped, never sinks the scan — mirroring the NWS weather
 * source. Read-only and public: RSS needs no credential.
 */

export type FeedItemSource = {
  listRecentItems(now: string): Promise<FeedItem[]>;
};

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000; // a runaway feed shouldn't buy us an OOM

function userAgent(): string {
  // A descriptive UA is etiquette for public feeds and some hosts require one.
  return "ArcMarketing-FeedReader/1.0 (+https://arc-studio.ai)";
}

export type RssFetchOptions = {
  /** Injected in tests so no live network is hit. Maps a URL to its raw XML. */
  fetchImpl?: (url: string) => Promise<string | null>;
};

async function defaultFetch(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent(), Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
  } catch {
    return null; // network error / timeout — this feed contributes nothing
  } finally {
    clearTimeout(timer);
  }
}

/** Build a source that reads live items for the given watched feeds. */
export function rssFeedSource(feeds: WatchedFeed[], opts: RssFetchOptions = {}): FeedItemSource {
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  return {
    async listRecentItems(): Promise<FeedItem[]> {
      const byId = new Map<string, FeedItem>();
      // Sequential + best-effort: a respectful, low-rate caller, and one bad feed
      // can't abort the others.
      for (const feed of feeds) {
        try {
          const xml = await fetchImpl(feed.url);
          if (!xml) continue;
          for (const item of parseFeedXml(xml, feed)) {
            if (!byId.has(item.id)) byId.set(item.id, item);
          }
        } catch {
          // best-effort per feed
        }
      }
      return [...byId.values()];
    },
  };
}
