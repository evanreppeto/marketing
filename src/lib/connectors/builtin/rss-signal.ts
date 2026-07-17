import {
  detectFeedSignalOpportunities,
  parseFeedConfig,
  parseFeedKeywords,
  type OpportunityCandidate,
} from "@/domain";
import { rssFeedSource, type FeedItemSource } from "@/lib/integrations/rss/source";

import { registerSignalSource, type SignalDetectContext, type SignalSourceConnector } from "../registry";

// ---------------------------------------------------------------------------
// Real `rss-signals` signal_source connector. Read-only: it reads the workspace's
// watched RSS/Atom feeds (a Google Alerts feed, a competitor's blog, industry news)
// and maps fresh items to `news_signal` opportunity candidates via the pure domain
// detector. It makes NO write and nothing outbound — the orchestrator is the only
// writer, and only to `opportunities`. No credential: RSS is public (costTier free).
//
// subjectId is the feed item's guid/id, so upsertOpportunities' open-status dedup
// keeps re-scans (and overlapping feeds) from flooding the inbox.
// ---------------------------------------------------------------------------

export type RssDetectInput = Pick<SignalDetectContext, "config"> & {
  now?: string;
  /** Injected in tests with a fixture-backed source so no live network is hit. */
  source?: FeedItemSource;
};

/**
 * Detect news_signal opportunities from the workspace's watched feeds. Best-effort:
 * the source swallows fetch failures (returns no items), so a feed outage yields
 * zero candidates rather than breaking the scan.
 */
export async function detectRssOpportunities(input: RssDetectInput): Promise<OpportunityCandidate[]> {
  const now = input.now ?? new Date().toISOString();
  const feeds = parseFeedConfig(input.config);
  if (feeds.length === 0) return []; // nothing watched — propose nothing, never invent
  const source = input.source ?? rssFeedSource(feeds);
  const items = await source.listRecentItems(now);
  return detectFeedSignalOpportunities(items, { now, keywords: parseFeedKeywords(input.config) });
}

export const rssSignalConnector: SignalSourceConnector = {
  key: "rss-signals",
  detect: (ctx) => detectRssOpportunities(ctx),
};

registerSignalSource(rssSignalConnector);
