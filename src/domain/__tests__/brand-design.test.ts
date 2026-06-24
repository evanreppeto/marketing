import { describe, expect, it } from "vitest";

import { brandDesignToPaletteUpdate, extractBrandDesign } from "../brand-design";

const BASE = "https://acme.com/";

describe("extractBrandDesign — logo", () => {
  it("prefers apple-touch-icon, resolved to an absolute URL", () => {
    const html = `<head>
      <link rel="apple-touch-icon" href="/touch.png">
      <meta property="og:image" content="https://cdn.acme.com/og.png">
      <link rel="icon" href="/favicon.ico">
    </head><body><img class="logo" src="/header-logo.svg"></body>`;
    const signal = extractBrandDesign(html, BASE);
    expect(signal.logoCandidates[0]).toBe("https://acme.com/touch.png");
    expect(signal.faviconUrl).toBe("https://acme.com/favicon.ico");
  });

  it("falls back to og:image, then a logo-ish <img>, then favicon", () => {
    const html = `<head><meta property="og:image" content="https://cdn.acme.com/og.png"></head>
      <body><img class="site-logo" src="/header-logo.svg"></body>`;
    const signal = extractBrandDesign(html, BASE);
    expect(signal.logoCandidates[0]).toBe("https://cdn.acme.com/og.png");
    expect(signal.logoCandidates).toContain("https://acme.com/header-logo.svg");
  });

  it("returns no logo candidates when none are present", () => {
    const signal = extractBrandDesign("<head></head><body><p>hi</p></body>", BASE);
    expect(signal.logoCandidates).toEqual([]);
    expect(signal.faviconUrl).toBeNull();
  });
});

describe("extractBrandDesign — colors", () => {
  it("pulls theme-color and brand-named CSS vars, normalized to lowercase hex", () => {
    const html = `<head>
      <meta name="theme-color" content="#1B2A4A">
      <style>:root{--brand-primary:#C8A24B;--color-accent:#0F8A5F;} body{color:#333333;background:#FFFFFF;}</style>
    </head>`;
    const signal = extractBrandDesign(html, BASE);
    const hexes = signal.colors.map((c) => c.hex);
    expect(hexes).toContain("#1b2a4a");
    expect(hexes).toContain("#c8a24b");
    expect(hexes).toContain("#0f8a5f");
  });

  it("ranks vivid brand colors above near-black and near-white", () => {
    const html = `<style>:root{--brand:#C8A24B} body{color:#000000;background:#ffffff}</style>`;
    const signal = extractBrandDesign(html, BASE);
    expect(signal.colors[0].hex).toBe("#c8a24b");
  });

  it("extracts rgb() colors as hex", () => {
    const html = `<head><style>:root{--brand-primary:rgb(200,162,75)} body{color:rgb(17,17,17)}</style></head>`;
    const signal = extractBrandDesign(html, BASE);
    expect(signal.colors.map((c) => c.hex)).toContain("#c8a24b");
  });
});

describe("extractBrandDesign — fonts", () => {
  it("reads Google Fonts families and font-family declarations", () => {
    const html = `<head>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@600&family=Inter&display=swap" rel="stylesheet">
      <style>h1{font-family:'Oswald',sans-serif} body{font-family:Inter,Arial,sans-serif}</style>
    </head>`;
    const signal = extractBrandDesign(html, BASE);
    expect(signal.headingFont).toBe("Oswald");
    expect(signal.bodyFont).toBe("Inter");
  });

  it("leaves fonts null when none are found", () => {
    const signal = extractBrandDesign("<head></head>", BASE);
    expect(signal.headingFont).toBeNull();
    expect(signal.bodyFont).toBeNull();
  });

  it("skips system-font fallbacks and picks the first real family in a stack", () => {
    const html = `<head><style>
      h1{font-family:system-ui,'Oswald',sans-serif}
      body{font-family:-apple-system,Inter,Arial,sans-serif}
    </style></head>`;
    const signal = extractBrandDesign(html, BASE);
    expect(signal.headingFont).toBe("Oswald");
    expect(signal.bodyFont).toBe("Inter");
  });
});

describe("brandDesignToPaletteUpdate", () => {
  it("maps vivid colors to primary/secondary/accent and gray extremes to dark/light", () => {
    const update = brandDesignToPaletteUpdate({
      logoCandidates: [],
      faviconUrl: null,
      colors: [
        { hex: "#c8a24b", source: "css-var" },
        { hex: "#1b2a4a", source: "theme-color" },
        { hex: "#0f8a5f", source: "frequency" },
        { hex: "#111111", source: "frequency" },
        { hex: "#fafafa", source: "frequency" },
      ],
      headingFont: "Oswald",
      bodyFont: "Inter",
    });
    expect(update.primary).toBe("#c8a24b");
    expect(update.secondary).toBe("#1b2a4a");
    expect(update.accent).toBe("#0f8a5f");
    expect(update.dark).toBe("#111111");
    expect(update.light).toBe("#fafafa");
    expect(update.headingFont).toBe("Oswald");
    expect(update.bodyFont).toBe("Inter");
  });

  it("omits slots with no available color", () => {
    const update = brandDesignToPaletteUpdate({
      logoCandidates: [], faviconUrl: null, colors: [{ hex: "#c8a24b", source: "css-var" }],
      headingFont: null, bodyFont: null,
    });
    expect(update.primary).toBe("#c8a24b");
    expect(update.secondary).toBeUndefined();
    expect(update.headingFont).toBeUndefined();
  });
});
