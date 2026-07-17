import { describe, expect, it } from "vitest";

import type { WatchedQuery } from "@/domain";

import { gnewsArticleToFeedItem, gnewsSource } from "./gnews";

const query: WatchedQuery = { query: "Acme Corp", kind: "competitor", label: "Acme watch" };

describe("gnewsArticleToFeedItem", () => {
  it("maps a GNews article to a FeedItem carrying the query's kind + label", () => {
    const item = gnewsArticleToFeedItem(
      { title: "Acme launches new line", description: "the details", url: "https://news.example.com/acme", publishedAt: "2026-07-16T10:00:00Z", source: { name: "Example News", url: "https://news.example.com" } },
      query,
    );
    expect(item).toMatchObject({
      id: "https://news.example.com/acme",
      title: "Acme launches new line",
      link: "https://news.example.com/acme",
      summary: "the details",
      publishedAt: "2026-07-16T10:00:00.000Z",
      feed: { kind: "competitor", label: "Acme watch" },
    });
  });

  it("names the source from the publication when the query has no label", () => {
    const item = gnewsArticleToFeedItem(
      { title: "T", url: "https://x.com/a", source: { name: "The Tribune" } },
      { query: "roofing", kind: "industry" },
    );
    expect(item?.feed?.label).toBe("The Tribune");
  });

  it("returns null for an article with no title", () => {
    expect(gnewsArticleToFeedItem({ url: "https://x.com/a" }, query)).toBeNull();
  });

  it("leaves an unparseable date as null", () => {
    const item = gnewsArticleToFeedItem({ title: "T", url: "https://x.com/a", publishedAt: "nonsense" }, query);
    expect(item?.publishedAt).toBeNull();
  });
});

describe("gnewsSource", () => {
  it("searches each query and dedupes articles by url across queries", async () => {
    const fetchImpl = async (q: WatchedQuery) =>
      q.query === "Acme Corp"
        ? [{ title: "Shared story", url: "https://n/shared", publishedAt: "2026-07-16T00:00:00Z", source: { name: "N" } }]
        : [{ title: "Shared story", url: "https://n/shared", source: { name: "N" } }, { title: "Other", url: "https://n/other", source: { name: "N" } }];
    const source = gnewsSource(
      [{ query: "Acme Corp", kind: "competitor" }, { query: "roofing", kind: "industry" }],
      "key",
      { fetchImpl },
    );
    const items = await source.listRecentItems("2026-07-17T00:00:00Z");
    expect(items.map((i) => i.id).sort()).toEqual(["https://n/other", "https://n/shared"]);
  });

  it("is best-effort — a query whose fetch throws is skipped", async () => {
    const fetchImpl = async (q: WatchedQuery) => {
      if (q.query === "boom") throw new Error("rate limited");
      return [{ title: "ok", url: "https://n/ok", source: { name: "N" } }];
    };
    const source = gnewsSource([{ query: "boom", kind: "brand" }, { query: "fine", kind: "brand" }], "key", { fetchImpl });
    const items = await source.listRecentItems("2026-07-17T00:00:00Z");
    expect(items.map((i) => i.id)).toEqual(["https://n/ok"]);
  });
});
