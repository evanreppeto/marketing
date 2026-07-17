import { detectFeedSignalOpportunities, parseNewsQueryConfig, type OpportunityCandidate } from "@/domain";
import { gnewsSource, type NewsItemSource } from "@/lib/integrations/news/gnews";

import { readConnectorCredential } from "../credentials";
import { resolveConnectorCredentialRef } from "../read-model";
import { registerSignalSource, type SignalDetectContext, type SignalSourceConnector } from "../registry";

// ---------------------------------------------------------------------------
// Real `news-search` signal_source connector. Searches the news (GNews) for the
// workspace's watched terms — a brand name, a competitor, an industry topic — and
// maps fresh matching articles to `news_signal` opportunities via the SAME pure
// detector rss-signals uses. Read-only: it only ever writes `opportunities`.
//
// It is the first CREDENTIALED signal source, so it resolves its own key from the
// Vault inside detect() (the detect context carries the client + workspaceId but not
// the secret — signal sources read their own credential). Reviews / competitor-ads
// will reuse this shape when their live sources land.
// ---------------------------------------------------------------------------

export const NEWS_SEARCH_CONNECTOR_KEY = "news-search";

export type NewsSearchDetectInput = Pick<SignalDetectContext, "config"> & {
  now?: string;
  /** Injected in tests with a fixture source + fixed key so no network/Vault is hit. */
  source?: NewsItemSource;
  apiKey?: string;
};

/**
 * Detect news_signal opportunities from the workspace's watched search terms.
 * Best-effort throughout: no key or no queries → []; the source swallows fetch
 * failures, so an API outage yields zero candidates rather than breaking the scan.
 */
export async function detectNewsSearchOpportunities(
  input: NewsSearchDetectInput & { client?: SignalDetectContext["client"]; workspaceId?: string },
): Promise<OpportunityCandidate[]> {
  const now = input.now ?? new Date().toISOString();
  const queries = parseNewsQueryConfig(input.config);
  if (queries.length === 0) return []; // nothing watched — propose nothing

  // Resolve the workspace's own GNews key (byo_key). Tests pass it directly.
  let apiKey = input.apiKey ?? null;
  if (!apiKey && input.client && input.workspaceId) {
    const ref = await resolveConnectorCredentialRef(input.client, input.workspaceId, NEWS_SEARCH_CONNECTOR_KEY);
    apiKey = await readConnectorCredential(input.client, ref);
  }
  if (!apiKey) return []; // not credentialed — nothing to search with

  const source = input.source ?? gnewsSource(queries, apiKey, { fromDays: 14 });
  const items = await source.listRecentItems(now);
  return detectFeedSignalOpportunities(items, { now });
}

export const newsSearchConnector: SignalSourceConnector = {
  key: NEWS_SEARCH_CONNECTOR_KEY,
  detect: (ctx) => detectNewsSearchOpportunities({ config: ctx.config, now: ctx.now, client: ctx.client, workspaceId: ctx.workspaceId }),
};

registerSignalSource(newsSearchConnector);
