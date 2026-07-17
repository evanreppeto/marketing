import type { OpportunityCandidate } from "./opportunity-detection";

/**
 * Pure logic for the `rss-signals` connector: turn items from the feeds a workspace
 * watches (a Google Alerts RSS, a competitor's blog, an industry news feed) into
 * `news_signal` opportunities — a fresh item worth a timely response.
 *
 * No I/O. The lib layer fetches + parses the XML into FeedItem[]; this decides which
 * items become opportunities and what they say. Tenant-neutral throughout — every
 * workspace shares this, so no company name and no assumed industry.
 */

// --- Config: the feeds a workspace watches -----------------------------------

/** How the operator framed a feed, which shapes the opportunity's angle. */
export type FeedWatchKind = "brand" | "competitor" | "industry";
const FEED_WATCH_KINDS = new Set<FeedWatchKind>(["brand", "competitor", "industry"]);
const DEFAULT_WATCH_KIND: FeedWatchKind = "industry";

export type WatchedFeed = { url: string; kind: FeedWatchKind; label?: string };

/** One parsed feed item, from the lib-layer parser. */
export type FeedItem = {
  /** Stable id for dedup — guid / atom id, or the link when neither exists. */
  id: string;
  title: string;
  link: string | null;
  summary: string | null;
  /** ISO publish time, or null when the feed omitted one. */
  publishedAt: string | null;
  /** Which watched feed it came from — set by the source, carried into evidence. */
  feed?: WatchedFeed;
};

/** Only items newer than this are worth surfacing — older "news" isn't a signal. */
export const FEED_RECENCY_DAYS = 14;
/** Bounds inbox volume per scan regardless of how chatty the feeds are. */
export const FEED_ITEM_CAP = 10;

export type FeedsInput = {
  feeds: WatchedFeed[];
  /** Lines that couldn't be read as a feed URL — SHOWN, never dropped, so a typo'd
   *  URL doesn't silently mean "watching nothing". */
  invalid: string[];
};

// `<kind>: <url> [label]` — kind and label are optional. The kind tag lets one
// field carry brand vs competitor vs industry without a second control.
const FEED_LINE_RE = /^(?:(brand|competitor|industry)\s*:\s*)?(\S+)(?:\s+(.*))?$/i;

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  // A bare host ("example.com/feed") is a common paste — assume https.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null; // reject "https://localhost"-style non-feeds
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Parse the operator's feeds textarea: one feed per line, optional `kind:` prefix
 * and optional trailing label. Blank lines ignored; duplicate URLs collapsed;
 * unreadable lines returned in `invalid` for the UI to surface.
 */
export function parseFeedsInput(text: string): FeedsInput {
  const feeds: WatchedFeed[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of (text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = FEED_LINE_RE.exec(line);
    const url = m ? normalizeUrl(m[2]) : null;
    if (!m || !url) {
      invalid.push(line);
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const kind = (m[1]?.toLowerCase() as FeedWatchKind) || DEFAULT_WATCH_KIND;
    const label = m[3]?.trim();
    feeds.push({ url, kind: FEED_WATCH_KINDS.has(kind) ? kind : DEFAULT_WATCH_KIND, ...(label ? { label } : {}) });
  }
  return { feeds, invalid };
}

/** Render feeds back into the editor's one-per-line form. Round-trips parseFeedsInput. */
export function formatFeedsInput(feeds: WatchedFeed[]): string {
  return feeds
    .map((f) => `${f.kind === DEFAULT_WATCH_KIND ? "" : `${f.kind}: `}${f.url}${f.label ? ` ${f.label}` : ""}`)
    .join("\n");
}

/** The watched feeds from a workspace_connectors.config blob. */
export function parseFeedConfig(config: Record<string, unknown> | null | undefined): WatchedFeed[] {
  return parseFeedsInput(typeof (config ?? {}).feeds === "string" ? ((config as Record<string, unknown>).feeds as string) : "").feeds;
}

/** Optional keyword filter — only items mentioning one of these surface. */
export function parseFeedKeywords(config: Record<string, unknown> | null | undefined): string[] {
  const raw = (config ?? {}).keywords;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return [...new Set(list.filter((k): k is string => typeof k === "string").map((k) => k.trim().toLowerCase()).filter(Boolean))];
}

export function isFeedConfigured(feeds: WatchedFeed[]): boolean {
  return feeds.length > 0;
}

// --- Detection ---------------------------------------------------------------

/** Host of a URL for a human-readable source label; falls back to the raw string. */
function hostOf(url: string | null): string {
  if (!url) return "a watched feed";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const WATCH_KIND_ANGLE: Record<FeedWatchKind, { verb: string; action: string; urgency: OpportunityCandidate["urgency"]; confidence: number }> = {
  // A brand mention is the most time-sensitive and the most confidently actionable.
  brand: { verb: "mentions you", action: "Respond while it's fresh — thank, amplify, or address it in a timely post.", urgency: "medium", confidence: 60 },
  competitor: { verb: "moved", action: "Review the angle and decide whether to counter it in a campaign.", urgency: "low", confidence: 50 },
  industry: { verb: "is relevant", action: "Consider a timely post that ties your offering to this.", urgency: "low", confidence: 45 },
};

/** Boost applied when the item text matches a configured keyword — the operator
 *  said this word matters, so a hit is a stronger signal than a bare fresh item. */
const KEYWORD_MATCH_BOOST = 20;

export type FeedDetectionConfig = {
  now: string;
  /** Lowercased keywords; an item must contain one to surface when non-empty. */
  keywords?: string[];
  recencyDays?: number;
  cap?: number;
};

/**
 * Fresh items in the watched feeds → news_signal opportunities. Skips items older
 * than the recency window and (when keywords are set) items that match none of them.
 * Newest first, capped. subjectId is the item id, so upsertOpportunities' open-status
 * dedup keeps re-scans from doubling up.
 */
export function detectFeedSignalOpportunities(items: FeedItem[], config: FeedDetectionConfig): OpportunityCandidate[] {
  const nowMs = Date.parse(config.now);
  const windowMs = (config.recencyDays ?? FEED_RECENCY_DAYS) * 24 * 60 * 60 * 1000;
  const keywords = config.keywords ?? [];
  const cap = config.cap ?? FEED_ITEM_CAP;

  const scored: Array<{ candidate: OpportunityCandidate; publishedMs: number }> = [];
  const seen = new Set<string>();
  const seenLinks = new Set<string>();

  for (const item of items) {
    const id = item.id?.trim();
    if (!id || seen.has(id)) continue;
    const title = item.title?.trim();
    if (!title) continue;

    // Secondary dedup by link: a feed can list one article under two guids (BBC does
    // this across sections). Same link = same article = one opportunity, even though
    // the ids differ. Observed on the live BBC feed, not hypothetical.
    const link = item.link?.trim();
    if (link && seenLinks.has(link)) continue;

    // Recency: an item with no date can't be aged out, so keep it (a feed that omits
    // dates shouldn't vanish) but sort it last.
    const publishedMs = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
    if (!Number.isNaN(publishedMs) && !Number.isNaN(nowMs) && nowMs - publishedMs > windowMs) continue;

    const haystack = `${title} ${item.summary ?? ""}`.toLowerCase();
    const matched = keywords.filter((k) => haystack.includes(k));
    if (keywords.length > 0 && matched.length === 0) continue;

    seen.add(id);
    if (link) seenLinks.add(link);
    const kind = item.feed?.kind ?? DEFAULT_WATCH_KIND;
    const angle = WATCH_KIND_ANGLE[kind];
    const source = item.feed?.label?.trim() || hostOf(item.feed?.url ?? item.link);

    scored.push({
      publishedMs: Number.isNaN(publishedMs) ? -Infinity : publishedMs,
      candidate: {
        kind: "news_signal",
        subjectType: "feed_item",
        subjectId: id,
        title: `${source}: ${title}`,
        summary:
          `${source} ${angle.verb}: "${title}". ${angle.action}` +
          (matched.length ? ` Matched your watch term${matched.length > 1 ? "s" : ""}: ${matched.join(", ")}.` : ""),
        confidence: Math.min(100, angle.confidence + (matched.length ? KEYWORD_MATCH_BOOST : 0)),
        urgency: angle.urgency,
        evidence: {
          feedKind: kind,
          source,
          ...(item.feed?.url ? { feedUrl: item.feed.url } : {}),
          ...(item.link ? { link: item.link } : {}),
          ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
          ...(matched.length ? { matchedKeywords: matched } : {}),
          evidence_urls: item.link ? [item.link] : [],
        },
        recommendedAction: angle.action,
        recommendedCampaignType: "timely_response",
      },
    });
  }

  return scored
    .sort((a, b) => b.publishedMs - a.publishedMs)
    .slice(0, cap)
    .map((s) => s.candidate);
}
