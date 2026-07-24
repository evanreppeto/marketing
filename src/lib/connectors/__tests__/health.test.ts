import { describe, expect, it, vi, afterEach } from "vitest";

import { checkConnectorCredential, checkEnrichmentEndpoint, checkGnewsKey } from "../health";

afterEach(() => vi.restoreAllMocks());

describe("checkGnewsKey", () => {
  it("is ok on a 200 search", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200 })));
    expect(await checkGnewsKey("k")).toEqual({ ok: true });
  });

  it("stays ok on a 429 (valid key, throttled) so the card is not false-red", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 429 })));
    expect((await checkGnewsKey("k")).ok).toBe(true);
  });

  it("rejects a bad key on 401/403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401 })));
    expect((await checkGnewsKey("bad")).ok).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 403 })));
    expect((await checkGnewsKey("bad")).ok).toBe(false);
  });

  it("fails closed on a transport error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect((await checkGnewsKey("k")).ok).toBe(false);
  });

  it("sends the key as the apikey query param, not a header", async () => {
    const fetchMock = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await checkGnewsKey("secret-key");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("apikey=secret-key");
    expect(url).toContain("gnews.io/api/v4/search");
  });
});

describe("checkEnrichmentEndpoint", () => {
  it("is reachable when the endpoint responds without an auth rejection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200 })));
    expect((await checkEnrichmentEndpoint("https://vendor.example/lookup", "k")).ok).toBe(true);
    // A 404 still means the key authenticated — reachable, not a key problem.
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404 })));
    expect((await checkEnrichmentEndpoint("https://vendor.example/lookup", "k")).ok).toBe(true);
  });

  it("rejects the key on 401/403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 403 })));
    expect((await checkEnrichmentEndpoint("https://vendor.example/lookup", "bad")).ok).toBe(false);
  });

  it("fails on an invalid endpoint URL without calling fetch", async () => {
    const fetchMock = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await checkEnrichmentEndpoint("not a url", "k")).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("probes with the real lookup shape: domain param + Bearer auth", async () => {
    const fetchMock = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await checkEnrichmentEndpoint("https://vendor.example/lookup", "secret");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("domain=example.com");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer secret" });
  });
});

describe("checkConnectorCredential dispatch", () => {
  it("validates gemini-media as a Gemini key (was previously unhandled → false error)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200 })));
    expect((await checkConnectorCredential("gemini-media", "k")).ok).toBe(true);
  });

  it("validates news-search via GNews", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200 })));
    expect((await checkConnectorCredential("news-search", "k")).ok).toBe(true);
  });

  it("still reports no-health-check for a connector without one", async () => {
    expect((await checkConnectorCredential("some-unknown-connector", "k")).ok).toBe(false);
  });
});
