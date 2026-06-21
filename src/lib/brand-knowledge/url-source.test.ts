import { describe, expect, it } from "vitest";

import { discoverWebsiteSourceUrls, fetchUrlSource } from "./url-source";

describe("fetchUrlSource", () => {
  it("imports readable public HTML as a text document", async () => {
    const fetcher: typeof fetch = async (url, init) => {
      expect(String(url)).toBe("https://example.com/about");
      expect(init?.headers).toMatchObject({ accept: expect.stringContaining("text/html") });
      return new Response(
        `
          <html>
            <head><title>About Arc Marketing</title><style>.x{}</style></head>
            <body><h1>About</h1><script>ignore()</script><p>Arc helps teams turn brand knowledge into useful marketing work.</p></body>
          </html>
        `,
        { headers: { "content-type": "text/html; charset=utf-8" }, status: 200 },
      );
    };

    const source = await fetchUrlSource({ url: "https://example.com/about#team", fetcher });

    expect(source).toMatchObject({
      url: "https://example.com/about",
      title: "About Arc Marketing",
      fileName: "About-Arc-Marketing.txt",
      contentType: "text/html; charset=utf-8",
    });
    expect(source.text).toContain("Arc helps teams");
    expect(source.text).not.toContain("ignore()");
  });

  it("blocks local and private network URLs", async () => {
    await expect(fetchUrlSource({ url: "http://localhost:3000/about" })).rejects.toThrow("public website");
    await expect(fetchUrlSource({ url: "http://192.168.1.10/about" })).rejects.toThrow("public website");
  });

  it("blocks redirects to local or private network URLs", async () => {
    const fetcher: typeof fetch = async () => {
      const response = new Response("Private page content that should not import.", {
        headers: { "content-type": "text/plain" },
        status: 200,
      });
      Object.defineProperty(response, "url", { value: "http://127.0.0.1/private" });
      return response;
    };

    await expect(fetchUrlSource({ url: "https://example.com/redirect", fetcher })).rejects.toThrow("public website");
  });

  it("rejects unsupported content types", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "application/octet-stream" }, status: 200 });

    await expect(fetchUrlSource({ url: "https://example.com/file.bin", fetcher })).rejects.toThrow("text, HTML, markdown, and JSON");
  });
});

describe("discoverWebsiteSourceUrls", () => {
  it("finds a prioritized same-origin set of useful website pages", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        `
          <a href="/blog/post">Blog</a>
          <a href="/services?utm_source=ad">Services</a>
          <a href="https://example.com/about#team">About</a>
          <a href="/reviews">Reviews</a>
          <a href="https://other.example.com/about">External</a>
          <a href="/logo.png">Logo</a>
          <a href="mailto:hello@example.com">Email</a>
        `,
        { headers: { "content-type": "text/html" }, status: 200 },
      );

    const urls = await discoverWebsiteSourceUrls({ url: "https://example.com", maxUrls: 4, fetcher });

    expect(urls).toEqual([
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/services",
      "https://example.com/reviews",
    ]);
  });

  it("falls back to the submitted URL when the entry point is not HTML", async () => {
    const fetcher: typeof fetch = async () =>
      new Response("Plain brand facts and service details.", { headers: { "content-type": "text/plain" }, status: 200 });

    await expect(discoverWebsiteSourceUrls({ url: "https://example.com/facts.txt", fetcher })).resolves.toEqual([
      "https://example.com/facts.txt",
    ]);
  });
});
