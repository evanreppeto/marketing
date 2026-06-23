vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => ({ address: "93.184.216.34", family: 4 })) }));

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchBrandSignalFromUrl } from "./website-fetch";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchBrandSignalFromUrl", () => {
  it("rejects a loopback/private URL without fetching", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await fetchBrandSignalFromUrl("http://127.0.0.1/");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe("rejected");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses to follow a redirect to a private host", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
    );

    const result = await fetchBrandSignalFromUrl("https://acme.com");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe("rejected");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns failed when the site responds with an error status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    const result = await fetchBrandSignalFromUrl("https://acme.com");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe("failed");
  });

  it("fetches and extracts the brand signal", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html><head><title>Acme</title></head><body><h1>We fix leaks</h1></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const result = await fetchBrandSignalFromUrl("https://acme.com");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signal.title).toBe("Acme");
      expect(result.signal.text).toContain("We fix leaks");
    }
  });
});
