import { afterEach, describe, expect, it, vi } from "vitest";

import { isWebSearchConfigured, normalizeTavilyResults } from "../provider";

describe("normalizeTavilyResults", () => {
  it("maps tavily results to {title, url, snippet}", () => {
    const out = normalizeTavilyResults({
      results: [
        { title: "Joe Plumbing", url: "https://joe.example", content: "Chicago plumber", score: 0.9 },
        { title: "Acme HVAC", url: "https://acme.example", content: "heating", score: 0.5 },
      ],
    });
    expect(out).toEqual([
      { title: "Joe Plumbing", url: "https://joe.example", snippet: "Chicago plumber" },
      { title: "Acme HVAC", url: "https://acme.example", snippet: "heating" },
    ]);
  });

  it("tolerates missing/extra fields and a missing results array", () => {
    expect(normalizeTavilyResults({})).toEqual([]);
    expect(normalizeTavilyResults({ results: [{ url: "https://x.example" }] })).toEqual([
      { title: "", url: "https://x.example", snippet: "" },
    ]);
  });
});

describe("isWebSearchConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("is false without a key, true with one", () => {
    vi.stubEnv("WEB_SEARCH_API_KEY", "");
    expect(isWebSearchConfigured()).toBe(false);
    vi.stubEnv("WEB_SEARCH_API_KEY", "tvly-abc");
    expect(isWebSearchConfigured()).toBe(true);
  });
});
