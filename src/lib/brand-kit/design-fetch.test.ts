vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => ({ address: "93.184.216.34", family: 4 })) }));

import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeBrandDesignFromUrl, fetchPublicImage } from "./design-fetch";

afterEach(() => {
  vi.restoreAllMocks();
});

const PAGE = `<head>
  <meta name="theme-color" content="#1B2A4A">
  <link rel="apple-touch-icon" href="/touch.png">
  <link rel="icon" href="/favicon.ico">
  <link href="https://fonts.googleapis.com/css2?family=Oswald&family=Inter" rel="stylesheet">
  <style>:root{--brand-primary:#C8A24B} h1{font-family:Oswald,sans-serif} body{font-family:Inter,Arial}</style>
</head><body><h1>Acme</h1></body>`;

describe("analyzeBrandDesignFromUrl", () => {
  it("rejects a private URL without fetching", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const result = await analyzeBrandDesignFromUrl("http://127.0.0.1/");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe("rejected");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("extracts a proposal from a public page", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(PAGE, { status: 200, headers: { "content-type": "text/html" } }),
    );
    const result = await analyzeBrandDesignFromUrl("https://acme.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.logoUrl).toBe("https://acme.com/touch.png");
      expect(result.proposal.faviconUrl).toBe("https://acme.com/favicon.ico");
      expect(result.proposal.palette.primary).toBe("#c8a24b");
      expect(result.proposal.headingFont).toBe("Oswald");
      expect(result.proposal.bodyFont).toBe("Inter");
      expect(result.proposal.sourceUrl).toBe("https://acme.com/");
    }
  });

  it("returns a proposal with null logo when none is present", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<head></head><body>hi</body>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const result = await analyzeBrandDesignFromUrl("https://acme.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proposal.logoUrl).toBeNull();
  });
});

describe("fetchPublicImage", () => {
  it("rejects a private host without fetching", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const result = await fetchPublicImage("http://10.0.0.5/logo.png");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe("rejected");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-image content type", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html>nope</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const result = await fetchPublicImage("https://acme.com/not-an-image");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe("failed");
  });

  it("returns bytes for an image response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/png" } }),
    );
    const result = await fetchPublicImage("https://cdn.acme.com/logo.png");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentType).toBe("image/png");
      expect(result.bytes.byteLength).toBe(4);
    }
  });
});
