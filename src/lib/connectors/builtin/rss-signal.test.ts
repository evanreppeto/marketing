import { describe, expect, it } from "vitest";

import type { FeedItem } from "@/domain";

import { getSignalSource } from "../registry";
import { detectRssOpportunities } from "./rss-signal";
// Importing the barrel triggers registerSignalSource for the built-ins.
import "./index";

const NOW = "2026-07-17T12:00:00Z";

/** A fixture source so no live network is hit. */
const fixtureSource = (items: FeedItem[]) => ({ listRecentItems: async () => items });

describe("rss-signals connector", () => {
  it("self-registers as a signal source", () => {
    expect(getSignalSource("rss-signals")?.key).toBe("rss-signals");
  });

  it("proposes nothing when no feeds are configured — never invents", async () => {
    const out = await detectRssOpportunities({ now: NOW, config: {} });
    expect(out).toEqual([]);
  });

  it("maps fresh feed items to news_signal opportunities", async () => {
    const out = await detectRssOpportunities({
      now: NOW,
      config: { feeds: "competitor: https://rival.com/feed Rival Blog" },
      source: fixtureSource([
        {
          id: "x1",
          title: "Rival launches spring promo",
          link: "https://rival.com/spring",
          summary: "details",
          publishedAt: "2026-07-16T00:00:00Z",
          feed: { url: "https://rival.com/feed", kind: "competitor", label: "Rival Blog" },
        },
      ]),
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "news_signal", subjectId: "x1" });
    expect(out[0].title).toBe("Rival Blog: Rival launches spring promo");
  });

  it("applies the workspace keyword filter", async () => {
    const items: FeedItem[] = [
      { id: "hit", title: "New roofing standard", link: null, summary: null, publishedAt: NOW, feed: { url: "https://f", kind: "industry" } },
      { id: "miss", title: "Unrelated", link: null, summary: null, publishedAt: NOW, feed: { url: "https://f", kind: "industry" } },
    ];
    const out = await detectRssOpportunities({
      now: NOW,
      config: { feeds: "https://f.example.com/feed", keywords: "roof" },
      source: fixtureSource(items),
    });
    expect(out.map((o) => o.subjectId)).toEqual(["hit"]);
  });
});
