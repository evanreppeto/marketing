import { describe, expect, it } from "vitest";

import { parseFeedXml } from "./parse";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example Blog</title>
  <item>
    <title>First &amp; best post</title>
    <link>https://example.com/first</link>
    <guid isPermaLink="false">post-001</guid>
    <pubDate>Wed, 16 Jul 2026 09:30:00 GMT</pubDate>
    <description><![CDATA[<p>Body with <b>markup</b> &amp; an ampersand.</p>]]></description>
  </item>
  <item>
    <title>Second post</title>
    <link>https://example.com/second</link>
    <pubDate>Tue, 15 Jul 2026 12:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title type="html"> Next-gen &#x2014; launch</title>
    <link rel="alternate" href="https://example.com/atom-1"/>
    <link rel="self" href="https://example.com/atom-1.atom"/>
    <id>urn:uuid:abc-123</id>
    <updated>2026-07-16T18:30:00Z</updated>
    <summary>Short summary.</summary>
  </entry>
</feed>`;

describe("parseFeedXml", () => {
  it("parses RSS items with guid, link, RFC-822 date, and CDATA description", () => {
    const items = parseFeedXml(RSS);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe("post-001");
    expect(items[0].title).toBe("First & best post"); // entity decoded
    expect(items[0].link).toBe("https://example.com/first");
    expect(items[0].publishedAt).toBe("2026-07-16T09:30:00.000Z"); // RFC-822 -> ISO
    expect(items[0].summary).toContain("Body with markup"); // CDATA unwrapped, inline tags stripped, entity decoded
  });

  it("falls back to the link as id when an RSS item has no guid", () => {
    expect(parseFeedXml(RSS)[1].id).toBe("https://example.com/second");
  });

  it("parses Atom entries — id, alternate link (not self), numeric entity, ISO date", () => {
    const [e] = parseFeedXml(ATOM);
    expect(e.id).toBe("urn:uuid:abc-123");
    expect(e.title).toBe("Next-gen — launch"); // &#x2014; -> em dash
    expect(e.link).toBe("https://example.com/atom-1"); // alternate, not the self link
    expect(e.publishedAt).toBe("2026-07-16T18:30:00.000Z");
    expect(e.summary).toBe("Short summary.");
  });

  it("stamps the watched-feed descriptor onto each item", () => {
    const feed = { url: "https://example.com/feed", kind: "competitor" as const, label: "Rival" };
    expect(parseFeedXml(RSS, feed)[0].feed).toEqual(feed);
  });

  it("skips items with no title, and returns [] for junk instead of throwing", () => {
    expect(parseFeedXml("<rss><channel><item><link>https://x.com/a</link></item></channel></rss>")).toEqual([]);
    for (const junk of ["", "not xml at all", "<html><body>nope</body></html>", "   "]) {
      expect(parseFeedXml(junk)).toEqual([]);
    }
  });

  it("leaves an unparseable date as null rather than an Invalid Date", () => {
    const xml = `<rss><channel><item><title>T</title><guid>g</guid><pubDate>not a date</pubDate></item></channel></rss>`;
    expect(parseFeedXml(xml)[0].publishedAt).toBeNull();
  });
});
