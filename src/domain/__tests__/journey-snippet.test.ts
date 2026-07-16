import { describe, expect, it } from "vitest";

import { readSnippetTouch } from "../journey-snippet";

const CAMPAIGN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("readSnippetTouch", () => {
  it("tracks an arrival carrying a bsg_at token", () => {
    const t = readSnippetTouch("?bsg_at=abc123&utm_source=meta");
    expect(t).not.toBeNull();
    expect(t?.token).toBe("abc123");
    expect(t?.channel).toBe("meta");
    expect(t?.kind).toBe("site_visit");
  });

  it("tracks an arrival with a utm_campaign UUID", () => {
    const t = readSnippetTouch(`?utm_campaign=${CAMPAIGN}&utm_source=email`);
    expect(t?.campaignId).toBe(CAMPAIGN);
    expect(t?.channel).toBe("email");
  });

  it("does NOT track a bare visit with no campaign context", () => {
    expect(readSnippetTouch("")).toBeNull();
    expect(readSnippetTouch("?ref=google")).toBeNull();
  });

  it("ignores a non-UUID utm_campaign (no token) — not attributable", () => {
    expect(readSnippetTouch("?utm_campaign=spring-sale")).toBeNull();
  });

  it("handles a search string with or without the leading ?", () => {
    expect(readSnippetTouch("bsg_at=xyz")?.token).toBe("xyz");
    expect(readSnippetTouch("?bsg_at=xyz")?.token).toBe("xyz");
  });
});
