import { describe, expect, it } from "vitest";

import type { FeedItem } from "@/domain";

import { getSignalSource } from "../registry";
import { detectNewsSearchOpportunities } from "./news-search";
import "./index";

const NOW = "2026-07-17T12:00:00Z";
const fixtureSource = (items: FeedItem[]) => ({ listRecentItems: async () => items });

describe("news-search connector", () => {
  it("self-registers as a signal source", () => {
    expect(getSignalSource("news-search")?.key).toBe("news-search");
  });

  it("proposes nothing when no queries are configured", async () => {
    expect(await detectNewsSearchOpportunities({ now: NOW, config: {}, apiKey: "k" })).toEqual([]);
  });

  it("proposes nothing when there's no API key (not credentialed)", async () => {
    // No apiKey and no client to resolve one from → nothing to search with.
    expect(await detectNewsSearchOpportunities({ now: NOW, config: { queries: "Acme" } })).toEqual([]);
  });

  it("maps matched articles to news_signal opportunities when keyed + configured", async () => {
    const out = await detectNewsSearchOpportunities({
      now: NOW,
      config: { queries: "competitor: Acme Corp" },
      apiKey: "k",
      source: fixtureSource([
        { id: "https://n/1", title: "Acme opens Chicago branch", link: "https://n/1", summary: null, publishedAt: "2026-07-16T00:00:00Z", feed: { url: "n.com", kind: "competitor", label: "Acme watch" } },
      ]),
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "news_signal", subjectId: "https://n/1" });
    expect(out[0].title).toBe("Acme watch: Acme opens Chicago branch");
  });
});
