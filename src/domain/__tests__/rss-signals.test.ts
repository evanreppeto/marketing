import { describe, expect, it } from "vitest";

import {
  detectFeedSignalOpportunities,
  formatFeedsInput,
  isFeedConfigured,
  parseFeedConfig,
  parseFeedKeywords,
  parseFeedsInput,
  type FeedItem,
  type WatchedFeed,
} from "@/domain";

const NOW = "2026-07-17T12:00:00Z";
const recent = "2026-07-16T12:00:00Z";
const old = "2026-06-01T12:00:00Z";

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  id: "i1",
  title: "A headline",
  link: "https://news.example.com/a",
  summary: "the body",
  publishedAt: recent,
  ...over,
});

describe("parseFeedsInput", () => {
  it("reads one feed per line with optional kind: prefix and label", () => {
    const { feeds, invalid } = parseFeedsInput(
      "brand: https://alerts.example.com/feed My Brand\ncompetitor: https://rival.com/blog/feed\nhttps://news.example.com/rss Industry",
    );
    expect(invalid).toEqual([]);
    expect(feeds).toEqual([
      { url: "https://alerts.example.com/feed", kind: "brand", label: "My Brand" },
      { url: "https://rival.com/blog/feed", kind: "competitor" },
      { url: "https://news.example.com/rss", kind: "industry", label: "Industry" },
    ]);
  });

  it("assumes https for a bare host and defaults the kind to industry", () => {
    const { feeds } = parseFeedsInput("blog.example.com/feed");
    expect(feeds[0]).toEqual({ url: "https://blog.example.com/feed", kind: "industry" });
  });

  it("reports unreadable lines rather than dropping them", () => {
    const { feeds, invalid } = parseFeedsInput("https://ok.example.com/feed\nnot a url\nhttps://localhost/feed");
    expect(feeds.map((f) => f.url)).toEqual(["https://ok.example.com/feed"]);
    // "not a url" -> https://not%20a%20url... has no dot after scheme-add? it does not parse to a host with a dot
    expect(invalid).toContain("not a url");
    expect(invalid).toContain("https://localhost/feed"); // no dot in host — not a real feed host
  });

  it("de-duplicates the same URL and ignores blank lines", () => {
    const { feeds } = parseFeedsInput("\nhttps://x.example.com/feed a\n\nhttps://x.example.com/feed b\n");
    expect(feeds).toHaveLength(1);
  });

  it("round-trips through formatFeedsInput", () => {
    const text = "https://news.example.com/rss Industry\ncompetitor: https://rival.com/feed";
    expect(formatFeedsInput(parseFeedsInput(text).feeds)).toBe(text);
  });

  it("parseFeedConfig reads config.feeds; isFeedConfigured reflects it", () => {
    expect(isFeedConfigured(parseFeedConfig({}))).toBe(false);
    expect(isFeedConfigured(parseFeedConfig({ feeds: "https://a.example.com/feed" }))).toBe(true);
  });

  it("parseFeedKeywords normalizes a csv or array", () => {
    expect(parseFeedKeywords({ keywords: "Roof, Storm ,roof" })).toEqual(["roof", "storm"]);
    expect(parseFeedKeywords({ keywords: ["Water Damage"] })).toEqual(["water damage"]);
    expect(parseFeedKeywords({})).toEqual([]);
  });
});

describe("detectFeedSignalOpportunities", () => {
  const feed = (kind: WatchedFeed["kind"], label?: string): WatchedFeed => ({ url: "https://src.example.com/feed", kind, ...(label ? { label } : {}) });

  it("emits a news_signal per fresh item, subjectId = item id for dedup", () => {
    const out = detectFeedSignalOpportunities([item({ feed: feed("industry", "Trade News") })], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "news_signal", subjectType: "feed_item", subjectId: "i1", recommendedCampaignType: "timely_response" });
    expect(out[0].title).toBe("Trade News: A headline");
    expect(out[0].evidence.evidence_urls).toEqual(["https://news.example.com/a"]);
  });

  it("drops items older than the recency window", () => {
    expect(detectFeedSignalOpportunities([item({ publishedAt: old })], { now: NOW })).toEqual([]);
  });

  it("keeps an item with no date (a feed that omits dates shouldn't vanish)", () => {
    expect(detectFeedSignalOpportunities([item({ publishedAt: null })], { now: NOW })).toHaveLength(1);
  });

  it("with keywords set, keeps only matching items and boosts their confidence", () => {
    const items = [
      item({ id: "hit", title: "New ROOF codes", feed: feed("industry") }),
      item({ id: "miss", title: "Unrelated finance news", feed: feed("industry") }),
    ];
    const out = detectFeedSignalOpportunities(items, { now: NOW, keywords: ["roof"] });
    expect(out.map((o) => o.subjectId)).toEqual(["hit"]);
    expect(out[0].summary).toMatch(/watch term/i);
    // industry base 45 + keyword boost 20
    expect(out[0].confidence).toBe(65);
  });

  it("a brand mention outranks an industry item on urgency + confidence", () => {
    const brand = detectFeedSignalOpportunities([item({ feed: feed("brand") })], { now: NOW })[0];
    const industry = detectFeedSignalOpportunities([item({ feed: feed("industry") })], { now: NOW })[0];
    expect(brand.urgency).toBe("medium");
    expect(industry.urgency).toBe("low");
    expect(brand.confidence).toBeGreaterThan(industry.confidence);
  });

  it("de-dupes by id and caps the number surfaced", () => {
    const many = Array.from({ length: 25 }, (_, i) => item({ id: `n${i}`, link: `https://x/${i}`, publishedAt: `2026-07-1${i % 7}T00:00:00Z` }));
    expect(detectFeedSignalOpportunities(many, { now: NOW }).length).toBe(10); // FEED_ITEM_CAP
    const dupes = [item({ id: "same", link: "https://x/one" }), item({ id: "same", link: "https://x/one" })];
    expect(detectFeedSignalOpportunities(dupes, { now: NOW })).toHaveLength(1);
  });

  // A feed can list one article under two guids (BBC does this across sections);
  // different ids, same link — one opportunity, not two. Found on the live feed.
  it("collapses two items that share a link even when their ids differ", () => {
    const items = [
      item({ id: "guid-a", link: "https://example.com/same-article" }),
      item({ id: "guid-b", link: "https://example.com/same-article" }),
    ];
    expect(detectFeedSignalOpportunities(items, { now: NOW })).toHaveLength(1);
  });

  it("does not collapse link-less items together", () => {
    const items = [item({ id: "a", link: null }), item({ id: "b", link: null })];
    expect(detectFeedSignalOpportunities(items, { now: NOW })).toHaveLength(2);
  });

  it("writes tenant-neutral copy — no company name, no assumed customer type", () => {
    const [o] = detectFeedSignalOpportunities([item({ feed: feed("industry") })], { now: NOW });
    const copy = `${o.title} ${o.summary} ${o.recommendedAction}`;
    expect(copy).not.toMatch(/BSR|Big Shoulders|homeowner/i);
  });

  it("orders newest first", () => {
    const items = [
      item({ id: "older", link: "https://x/older", publishedAt: "2026-07-14T00:00:00Z" }),
      item({ id: "newest", link: "https://x/newest", publishedAt: "2026-07-17T00:00:00Z" }),
      item({ id: "mid", link: "https://x/mid", publishedAt: "2026-07-15T00:00:00Z" }),
    ];
    expect(detectFeedSignalOpportunities(items, { now: NOW }).map((o) => o.subjectId)).toEqual(["newest", "mid", "older"]);
  });
});
