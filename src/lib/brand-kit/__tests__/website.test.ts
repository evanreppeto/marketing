import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, extractBrandSignal } from "../website";

describe("assertPublicHttpUrl", () => {
  it("accepts a normal https url", () => {
    expect(() => assertPublicHttpUrl("https://example.com/about")).not.toThrow();
  });
  it("rejects non-http(s) schemes", () => {
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow();
    expect(() => assertPublicHttpUrl("ftp://example.com")).toThrow();
  });
  it("rejects localhost and private/loopback IP literals", () => {
    expect(() => assertPublicHttpUrl("http://localhost/")).toThrow();
    expect(() => assertPublicHttpUrl("http://127.0.0.1/")).toThrow();
    expect(() => assertPublicHttpUrl("http://10.0.0.5/")).toThrow();
    expect(() => assertPublicHttpUrl("http://192.168.1.1/")).toThrow();
    expect(() => assertPublicHttpUrl("http://169.254.1.1/")).toThrow();
  });
});

describe("extractBrandSignal", () => {
  it("pulls title, meta description, and readable text; strips scripts/styles", () => {
    const html = `
      <html><head>
        <title>Acme Plumbing</title>
        <meta name="description" content="Fast, friendly plumbing.">
        <link rel="icon" href="/favicon.ico">
        <style>.x{color:red}</style>
      </head><body>
        <script>var a=1;</script>
        <h1>We fix leaks</h1><p>Serving the city since 2001.</p>
      </body></html>`;
    const sig = extractBrandSignal(html, "https://acme.com");
    expect(sig.title).toBe("Acme Plumbing");
    expect(sig.description).toBe("Fast, friendly plumbing.");
    expect(sig.faviconUrl).toBe("https://acme.com/favicon.ico");
    expect(sig.text).toContain("We fix leaks");
    expect(sig.text).toContain("Serving the city since 2001.");
    expect(sig.text).not.toContain("var a=1");
    expect(sig.text).not.toContain("color:red");
  });

  it("caps text length", () => {
    const long = "word ".repeat(5000);
    const sig = extractBrandSignal(`<body>${long}</body>`, "https://x.com");
    expect(sig.text.length).toBeLessThanOrEqual(8000);
  });
});
