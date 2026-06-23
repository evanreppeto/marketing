# Pull Brand Design From Website — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator paste their company website on the Brand page and pull the logo, colors, and fonts onto the Business Profile — so the masthead shows the real logo and palette instead of the "BR" monogram.

**Architecture:** A pure extractor (`src/domain/brand-design.ts`) parses logo/color/font signals from raw HTML. A Node-runtime fetch layer (`src/lib/brand-kit/design-fetch.ts`) reuses the existing SSRF guard but keeps the CSS the text-import path strips. Two `requireOperator()`-gated server actions analyze (preview) then apply (re-guard + download logo, write profile). A client preview card gates the write. No schema change — `business_profiles` already has `logo_url`, `favicon_url`, `brand_palette`.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Supabase (service-role admin client), Vitest. Package manager **pnpm**.

**Reference spec:** `docs/superpowers/specs/2026-06-23-brand-design-from-website-design.md`

---

## Conventions for every task

- Run a single test file with: `pnpm test path/to/file.test.ts`
- Run lint scoped to changed files only (the repo lint scans vendored files and reports ~31k unrelated problems): `pnpm exec eslint <file> <file>`
- Typecheck with `pnpm build` (lint does NOT typecheck; typed Supabase enums need literal unions).
- Commit after each task. Branch is already a feature branch (`claude/elegant-heyrovsky-02dc2e`); do not touch `main`.

---

## File Structure

New:
- `src/domain/brand-design.ts` — pure extraction + palette mapping
- `src/domain/__tests__/brand-design.test.ts`
- `src/lib/brand-kit/design-fetch.ts` — SSRF-guarded page + image fetch, analyze
- `src/lib/brand-kit/design-fetch.test.ts`
- `src/app/library/brand/_components/brand-design-import.tsx` — preview/apply UI

Modified:
- `src/domain/index.ts` — re-export `brand-design`
- `src/lib/brand-kit/website-fetch.ts` — extract reusable `fetchPublicHtml` + export `hostResolvesToPrivate`
- `src/app/library/brand/actions.ts` — add analyze + apply actions
- `src/app/library/brand/page.tsx` — render `BrandDesignImport`

---

## Task 1: Pure brand-design extractor

**Files:**
- Create: `src/domain/brand-design.ts`
- Test: `src/domain/__tests__/brand-design.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/brand-design.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/domain/__tests__/brand-design.test.ts`
Expected: FAIL — `Failed to resolve import "../brand-design"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/brand-design.ts`:

```ts
/**
 * Brand design extraction — pure, no I/O. Given a page's raw HTML, surface the
 * company's logo candidates, brand colors, and fonts so the operator can pull
 * their visual identity onto the Business Profile. Best-effort by design: a
 * human reviews the result before it is applied. I/O (fetching, storing) lives
 * in src/lib/brand-kit/design-fetch.ts.
 */

export type BrandDesignColor = { hex: string; source: "theme-color" | "css-var" | "frequency" };

export type BrandDesignSignal = {
  logoCandidates: string[];
  faviconUrl: string | null;
  colors: BrandDesignColor[];
  headingFont: string | null;
  bodyFont: string | null;
};

export type BrandDesignPaletteUpdate = {
  primary?: string;
  secondary?: string;
  accent?: string;
  dark?: string;
  light?: string;
  headingFont?: string;
  bodyFont?: string;
};

const GENERIC_FONTS = new Set([
  "sans-serif", "serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif",
  "ui-monospace", "cursive", "fantasy", "inherit", "initial", "unset",
  "-apple-system", "blinkmacsystemfont", "arial", "helvetica",
]);

function absolute(href: string, baseUrl: string): string | null {
  try {
    return new URL(href.trim(), baseUrl).toString();
  } catch {
    return null;
  }
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? "").trim() : null;
}

function tagsOf(html: string, tagName: string): string[] {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
}

function extractLogos(html: string, baseUrl: string): { candidates: string[]; favicon: string | null } {
  const out: string[] = [];
  const push = (href: string | null) => {
    if (!href) return;
    const abs = absolute(href, baseUrl);
    if (abs && !out.includes(abs)) out.push(abs);
  };

  const links = tagsOf(html, "link");
  // 1. apple-touch-icon
  for (const t of links) {
    if (/rel\s*=\s*["'][^"']*apple-touch-icon[^"']*["']/i.test(t)) push(attr(t, "href"));
  }
  // 2. og:image / twitter:image
  for (const t of tagsOf(html, "meta")) {
    const prop = attr(t, "property") ?? attr(t, "name") ?? "";
    if (/^(og:image|twitter:image)$/i.test(prop)) push(attr(t, "content"));
  }
  // 3. logo-ish <img>
  for (const t of tagsOf(html, "img")) {
    const hay = `${attr(t, "alt") ?? ""} ${attr(t, "class") ?? ""} ${attr(t, "src") ?? ""} ${attr(t, "id") ?? ""}`;
    if (/logo|brand|wordmark/i.test(hay)) push(attr(t, "src"));
  }
  // 4. favicon (also returned separately)
  let favicon: string | null = null;
  for (const t of links) {
    if (/rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(t) && !/apple-touch-icon/i.test(t)) {
      const abs = absolute(attr(t, "href") ?? "", baseUrl);
      if (abs) {
        favicon ??= abs;
        push(abs);
      }
    }
  }
  return { candidates: out, favicon };
}

function normalizeHex(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

function rgbToHex(raw: string): string | null {
  const m = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(raw);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  if ([r, g, b].some((n) => n > 255)) return null;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** 0 = black, 1 = white. Used to bucket dark/light vs. vivid brand colors. */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** 0 = gray, higher = more saturated. */
function saturation(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function extractColors(html: string): BrandDesignColor[] {
  const found = new Map<string, BrandDesignColor>();
  const add = (hex: string | null, source: BrandDesignColor["source"]) => {
    if (hex && !found.has(hex)) found.set(hex, { hex, source });
  };

  for (const t of tagsOf(html, "meta")) {
    if (/name\s*=\s*["']theme-color["']/i.test(t)) add(normalizeHex(attr(t, "content") ?? ""), "theme-color");
  }

  const styles = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join("\n");
  const inline = (html.match(/style\s*=\s*"([^"]*)"/gi) ?? []).join("\n");
  const css = `${styles}\n${inline}`;

  for (const m of css.matchAll(/--[\w-]*(?:primary|secondary|accent|brand|color)[\w-]*\s*:\s*([^;]+)/gi)) {
    add(normalizeHex(m[1]) ?? rgbToHex(m[1]), "css-var");
  }

  const freq = new Map<string, number>();
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,6}\b/g)) {
    const hex = normalizeHex(m[0]);
    if (hex) freq.set(hex, (freq.get(hex) ?? 0) + 1);
  }
  for (const m of css.matchAll(/rgba?\([^)]*\)/gi)) {
    const hex = rgbToHex(m[0]);
    if (hex) freq.set(hex, (freq.get(hex) ?? 0) + 1);
  }
  for (const [hex] of [...freq.entries()].sort((a, b) => b[1] - a[1])) add(hex, "frequency");

  // Rank: saturated brand colors first, gray extremes last.
  return [...found.values()].sort((a, b) => {
    const va = saturation(a.hex) > 0.15 ? 0 : 1;
    const vb = saturation(b.hex) > 0.15 ? 0 : 1;
    return va - vb;
  });
}

function cleanFamily(raw: string): string | null {
  const first = raw.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "").trim();
  if (!first) return null;
  if (GENERIC_FONTS.has(first.toLowerCase())) return null;
  return first;
}

function extractFonts(html: string): { headingFont: string | null; bodyFont: string | null } {
  const families: string[] = [];
  const pushFamily = (name: string | null) => {
    if (name && !families.includes(name)) families.push(name);
  };

  for (const t of tagsOf(html, "link")) {
    const href = attr(t, "href") ?? "";
    if (/fonts\.googleapis\.com/i.test(href)) {
      for (const m of href.matchAll(/family=([^&:]+)/gi)) {
        pushFamily(cleanFamily(decodeURIComponent(m[1]).replace(/\+/g, " ")));
      }
    }
  }

  const styles = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join("\n");
  // Prefer a heading rule's family for the heading font.
  const headingRule = /(?:^|[}\s,])h[1-3][^{]*\{[^}]*font-family\s*:\s*([^;}]+)/i.exec(styles);
  const headingFromRule = headingRule ? cleanFamily(headingRule[1]) : null;
  for (const m of styles.matchAll(/font-family\s*:\s*([^;}]+)/gi)) pushFamily(cleanFamily(m[1]));

  const headingFont = headingFromRule ?? families[0] ?? null;
  const bodyFont = families.find((f) => f !== headingFont) ?? families[0] ?? null;
  return { headingFont, bodyFont: headingFont && bodyFont === headingFont ? null : bodyFont };
}

export function extractBrandDesign(html: string, baseUrl: string): BrandDesignSignal {
  const { candidates, favicon } = extractLogos(html, baseUrl);
  const { headingFont, bodyFont } = extractFonts(html);
  return { logoCandidates: candidates, faviconUrl: favicon, colors: extractColors(html), headingFont, bodyFont };
}

/** Map a signal onto Business Profile palette slots. Vivid colors fill
 *  primary/secondary/accent in order; the darkest and lightest fill dark/light. */
export function brandDesignToPaletteUpdate(signal: BrandDesignSignal): BrandDesignPaletteUpdate {
  const update: BrandDesignPaletteUpdate = {};
  const vivid = signal.colors.filter((c) => saturation(c.hex) > 0.15).map((c) => c.hex);
  const [primary, secondary, accent] = vivid;
  if (primary) update.primary = primary;
  if (secondary) update.secondary = secondary;
  if (accent) update.accent = accent;

  const byLum = [...signal.colors].sort((a, b) => luminance(a.hex) - luminance(b.hex));
  if (byLum.length > 0) {
    update.dark = byLum[0].hex;
    update.light = byLum[byLum.length - 1].hex;
  }
  if (signal.headingFont) update.headingFont = signal.headingFont;
  if (signal.bodyFont) update.bodyFont = signal.bodyFont;
  return update;
}
```

- [ ] **Step 4: Re-export from the domain barrel**

In `src/domain/index.ts`, add after the existing `export * from "./brand-kit";` line:

```ts
export * from "./brand-design";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/domain/__tests__/brand-design.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Lint the new/changed files**

Run: `pnpm exec eslint src/domain/brand-design.ts src/domain/__tests__/brand-design.test.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/domain/brand-design.ts src/domain/__tests__/brand-design.test.ts src/domain/index.ts
git commit -m "feat(brand): pure extractor for logo/colors/fonts from website HTML"
```

---

## Task 2: Extract reusable `fetchPublicHtml` from `website-fetch.ts`

This refactor makes the existing SSRF-guarded fetch loop reusable by the new design fetcher, with no behavior change. The existing `website-fetch.test.ts` is the safety net.

**Files:**
- Modify: `src/lib/brand-kit/website-fetch.ts`
- Test (existing, must stay green): `src/lib/brand-kit/website-fetch.test.ts`

- [ ] **Step 1: Refactor `website-fetch.ts`**

Replace the entire body of `src/lib/brand-kit/website-fetch.ts` with the version below. It pulls the guarded fetch loop into an exported `fetchPublicHtml`, exports the DNS guard as `hostResolvesToPrivate`, and rewrites `fetchBrandSignalFromUrl` to use them. Constants and SSRF behavior are unchanged.

```ts
import { lookup } from "node:dns/promises";

import { assertPublicHttpUrl, extractBrandSignal, type BrandSignal } from "./website";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 2;

export type FetchBrandSignalResult =
  | { ok: true; signal: BrandSignal }
  | { ok: false; status: "rejected" | "failed"; message: string };

export type FetchHtmlResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; status: "rejected" | "failed"; message: string };

function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6)
    return (
      address === "::1" ||
      address.toLowerCase().startsWith("fe80") ||
      address.toLowerCase().startsWith("fc") ||
      address.toLowerCase().startsWith("fd")
    );
  const p = address.split(".").map(Number);
  if (p.length !== 4) return false;
  const [a, b] = p;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** True when a hostname's resolved address is private/loopback. Best-effort:
 *  if DNS lookup is unavailable, returns false (allow). */
export async function hostResolvesToPrivate(hostname: string): Promise<boolean> {
  try {
    const r = await lookup(hostname);
    return isPrivateAddress(r.address, r.family);
  } catch {
    return false;
  }
}

/**
 * Fetch a public URL's HTML with SSRF protection: http(s) only, literal +
 * DNS-resolved private/loopback addresses rejected, redirects re-validated each
 * hop, 5s timeout, 1MB cap. Node runtime only (uses node:dns). Returns the raw
 * (capped) HTML and the final URL after redirects.
 */
export async function fetchPublicHtml(rawUrl: string): Promise<FetchHtmlResult> {
  let url: URL;
  try {
    url = assertPublicHttpUrl(rawUrl);
  } catch (error) {
    return { ok: false, status: "rejected", message: error instanceof Error ? error.message : "Unsafe URL." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      let safe: URL;
      try {
        safe = assertPublicHttpUrl(current.toString());
      } catch (error) {
        return { ok: false, status: "rejected", message: error instanceof Error ? error.message : "Unsafe redirect target." };
      }
      if (await hostResolvesToPrivate(safe.hostname)) {
        return { ok: false, status: "rejected", message: "Refusing to fetch a private/loopback address." };
      }

      const res = await fetch(safe, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "ArcBrandBot/1.0" },
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) return { ok: false, status: "failed", message: "Too many redirects." };
        try {
          current = new URL(location, safe);
        } catch {
          return { ok: false, status: "failed", message: "Invalid redirect location." };
        }
        continue;
      }

      if (!res.ok) return { ok: false, status: "failed", message: `Site returned ${res.status}.` };
      const raw = await res.text();
      return { ok: true, html: raw.slice(0, MAX_BYTES), finalUrl: safe.toString() };
    }
  } catch (error) {
    return { ok: false, status: "failed", message: error instanceof Error ? error.message : "Failed to fetch the site." };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a public website and extract brand signal (title, description, favicon,
 * readable text). SSRF-guarded via fetchPublicHtml. No LLM — callers structure
 * the result. Shared by the Arc API route and the operator first-run flow.
 */
export async function fetchBrandSignalFromUrl(rawUrl: string): Promise<FetchBrandSignalResult> {
  const result = await fetchPublicHtml(rawUrl);
  if (!result.ok) return result;
  return { ok: true, signal: extractBrandSignal(result.html, result.finalUrl) };
}
```

- [ ] **Step 2: Run the existing tests to verify no regression**

Run: `pnpm test src/lib/brand-kit/website-fetch.test.ts`
Expected: PASS — all 4 existing cases still green (loopback reject, redirect-to-private reject, error status, successful extract).

- [ ] **Step 3: Lint**

Run: `pnpm exec eslint src/lib/brand-kit/website-fetch.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/brand-kit/website-fetch.ts
git commit -m "refactor(brand): extract reusable fetchPublicHtml + hostResolvesToPrivate"
```

---

## Task 3: Design fetch layer (`analyzeBrandDesignFromUrl` + `fetchPublicImage`)

**Files:**
- Create: `src/lib/brand-kit/design-fetch.ts`
- Test: `src/lib/brand-kit/design-fetch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/brand-kit/design-fetch.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/brand-kit/design-fetch.test.ts`
Expected: FAIL — `Failed to resolve import "./design-fetch"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/brand-kit/design-fetch.ts`:

```ts
import { brandDesignToPaletteUpdate, extractBrandDesign } from "@/domain";

import { assertPublicHttpUrl } from "./website";
import { fetchPublicHtml, hostResolvesToPrivate } from "./website-fetch";

const IMAGE_TIMEOUT_MS = 5000;
const MAX_IMAGE_BYTES = 3_000_000;
const MAX_IMAGE_REDIRECTS = 2;

export type BrandDesignProposal = {
  logoUrl: string | null;
  faviconUrl: string | null;
  palette: { primary?: string; secondary?: string; accent?: string; dark?: string; light?: string };
  headingFont: string | null;
  bodyFont: string | null;
  sourceUrl: string;
};

export type AnalyzeBrandDesignResult =
  | { ok: true; proposal: BrandDesignProposal }
  | { ok: false; status: "rejected" | "failed"; message: string };

export type FetchImageResult =
  | { ok: true; bytes: Uint8Array; contentType: string; finalUrl: string }
  | { ok: false; status: "rejected" | "failed"; message: string };

/** Fetch a public page (keeping its CSS) and structure a brand-design proposal.
 *  No storage — the apply action re-guards + stores any chosen logo. */
export async function analyzeBrandDesignFromUrl(rawUrl: string): Promise<AnalyzeBrandDesignResult> {
  const page = await fetchPublicHtml(rawUrl);
  if (!page.ok) return page;

  const signal = extractBrandDesign(page.html, page.finalUrl);
  const update = brandDesignToPaletteUpdate(signal);
  return {
    ok: true,
    proposal: {
      logoUrl: signal.logoCandidates[0] ?? null,
      faviconUrl: signal.faviconUrl,
      palette: {
        primary: update.primary,
        secondary: update.secondary,
        accent: update.accent,
        dark: update.dark,
        light: update.light,
      },
      headingFont: update.headingFont ?? null,
      bodyFont: update.bodyFont ?? null,
      sourceUrl: page.finalUrl,
    },
  };
}

/** SSRF-guarded image download for the apply step: http(s) only, literal +
 *  DNS-resolved private addresses rejected, redirects re-validated each hop,
 *  5s timeout, 3MB cap, content-type must be image/*. Node runtime only. */
export async function fetchPublicImage(rawUrl: string): Promise<FetchImageResult> {
  let url: URL;
  try {
    url = assertPublicHttpUrl(rawUrl);
  } catch (error) {
    return { ok: false, status: "rejected", message: error instanceof Error ? error.message : "Unsafe URL." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      let safe: URL;
      try {
        safe = assertPublicHttpUrl(current.toString());
      } catch (error) {
        return { ok: false, status: "rejected", message: error instanceof Error ? error.message : "Unsafe redirect target." };
      }
      if (await hostResolvesToPrivate(safe.hostname)) {
        return { ok: false, status: "rejected", message: "Refusing to fetch a private/loopback address." };
      }

      const res = await fetch(safe, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "ArcBrandBot/1.0", accept: "image/*" },
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= MAX_IMAGE_REDIRECTS) return { ok: false, status: "failed", message: "Too many redirects." };
        try {
          current = new URL(location, safe);
        } catch {
          return { ok: false, status: "failed", message: "Invalid redirect location." };
        }
        continue;
      }

      if (!res.ok) return { ok: false, status: "failed", message: `Image returned ${res.status}.` };
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!contentType.startsWith("image/")) {
        return { ok: false, status: "failed", message: "That URL did not return an image." };
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        return { ok: false, status: "failed", message: "Image is too large to import." };
      }
      return { ok: true, bytes, contentType, finalUrl: safe.toString() };
    }
  } catch (error) {
    return { ok: false, status: "failed", message: error instanceof Error ? error.message : "Failed to fetch the image." };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/brand-kit/design-fetch.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint src/lib/brand-kit/design-fetch.ts src/lib/brand-kit/design-fetch.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/brand-kit/design-fetch.ts src/lib/brand-kit/design-fetch.test.ts
git commit -m "feat(brand): SSRF-guarded website design analyze + image fetch"
```

---

## Task 4: Server actions (analyze + apply)

**Files:**
- Modify: `src/app/library/brand/actions.ts`

Add the imports, content types, and two actions below. Place the new code at the end of the file (after `importAndAnalyzeBrandWebsiteAction`).

- [ ] **Step 1: Add imports at the top of `actions.ts`**

Add these alongside the existing imports:

```ts
import { analyzeBrandDesignFromUrl, fetchPublicImage, type BrandDesignProposal } from "@/lib/brand-kit/design-fetch";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";
import { insertAssetWithUrl } from "@/lib/media-library/persistence";
import { classifyKind, NEUTRAL_DEFAULTS, type BusinessProfile } from "@/domain";
```

Note: `insertAssetWithUrl` is the URL-returning variant — `actions.ts` currently
imports `insertAsset`; add `insertAssetWithUrl` to that import or as shown. Keep
the existing `validateUpload`/`classifyKind` import from `@/domain` deduplicated
(merge into one `@/domain` import line; do not import a name twice).

- [ ] **Step 2: Append the actions to `actions.ts`**

```ts
export type BrandDesignAnalyzeState =
  | { ok: true; proposal: BrandDesignProposal }
  | { ok: false; message: string }
  | null;

export type BrandDesignApplyState = { ok: boolean; message: string } | null;

const DESIGN_NOT_CONFIGURED = { ok: false as const, message: "Supabase is not configured." };

/** Fetch the operator's website and propose logo/colors/fonts (no writes). */
export async function analyzeBrandDesignFromWebsiteAction(
  _previous: BrandDesignAnalyzeState,
  formData: FormData,
): Promise<BrandDesignAnalyzeState> {
  await requireOperator();

  const rawUrl = String(formData.get("websiteUrl") ?? "").trim();
  if (!rawUrl) return { ok: false, message: "Enter your website URL." };

  const result = await analyzeBrandDesignFromUrl(rawUrl);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, proposal: result.proposal };
}

async function storeBrandImage(args: {
  orgId: string;
  url: string;
  role: "logo" | "favicon";
  sourceUrl: string;
  uploadedBy: string;
}): Promise<string | null> {
  const image = await fetchPublicImage(args.url);
  if (!image.ok) return null;
  const host = (() => {
    try {
      return new URL(args.sourceUrl || args.url).hostname.replace(/^www\./, "");
    } catch {
      return args.role;
    }
  })();
  const safeName = host.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || args.role;
  const ext = image.contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const fileName = `${args.role}-${safeName}.${ext}`;
  const result = await insertAssetWithUrl({
    orgId: args.orgId,
    folderId: null,
    fileName,
    bytes: image.bytes,
    contentType: image.contentType,
    kind: classifyKind(image.contentType, fileName),
    byteSize: image.bytes.byteLength,
    source: "url",
    provenance: { brandRole: args.role, sourceUrl: args.sourceUrl },
    uploadedBy: args.uploadedBy,
  });
  return result.url;
}

function fillColor(current: { label: string; hex: string }, hex: string | undefined, overwrite: boolean) {
  if (!hex) return current;
  if (current.hex && !overwrite) return current;
  return { label: current.label, hex };
}

/** Apply a reviewed design proposal to the Business Profile. Re-guards + stores
 *  the chosen logo/favicon; fills blank fields unless overwrite is set. */
export async function applyBrandDesignAction(
  _previous: BrandDesignApplyState,
  formData: FormData,
): Promise<BrandDesignApplyState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return DESIGN_NOT_CONFIGURED;

  const orgId = await getCurrentOrgId();
  const uploadedBy = await getOperatorActor();
  const overwrite = formData.get("overwrite") === "on";
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();

  const current: BusinessProfile = (await getBusinessProfile(orgId)) ?? NEUTRAL_DEFAULTS;

  const get = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v.length > 0 ? v : undefined;
  };

  const next: BusinessProfile = { ...current };

  const logoUrl = get("logoUrl");
  if (logoUrl && (!current.logoUrl || overwrite)) {
    const stored = await storeBrandImage({ orgId, url: logoUrl, role: "logo", sourceUrl, uploadedBy });
    if (stored) next.logoUrl = stored;
  }
  const faviconUrl = get("faviconUrl");
  if (faviconUrl && (!current.faviconUrl || overwrite)) {
    const stored = await storeBrandImage({ orgId, url: faviconUrl, role: "favicon", sourceUrl, uploadedBy });
    if (stored) next.faviconUrl = stored;
  }

  next.brandPalette = {
    ...current.brandPalette,
    primary: fillColor(current.brandPalette.primary, get("primary"), overwrite),
    secondary: fillColor(current.brandPalette.secondary, get("secondary"), overwrite),
    accent: fillColor(current.brandPalette.accent, get("accent"), overwrite),
    dark: fillColor(current.brandPalette.dark, get("dark"), overwrite),
    light: fillColor(current.brandPalette.light, get("light"), overwrite),
    headingFont: current.brandPalette.headingFont && !overwrite ? current.brandPalette.headingFont : get("headingFont") ?? current.brandPalette.headingFont,
    bodyFont: current.brandPalette.bodyFont && !overwrite ? current.brandPalette.bodyFont : get("bodyFont") ?? current.brandPalette.bodyFont,
  };

  if (!current.websiteUrl && sourceUrl) next.websiteUrl = sourceUrl;

  try {
    await upsertBusinessProfile(orgId, next);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't apply the design." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/library/brand");
  revalidatePath("/settings");
  revalidatePath("/arc");
  return { ok: true, message: "Brand design applied." };
}
```

- [ ] **Step 3: Typecheck the whole app**

Run: `pnpm build`
Expected: build completes with no TypeScript errors. (If `insertAsset` is now
unused in `actions.ts`, keep it — it's still used by the upload/url import
actions. Only resolve genuine duplicate-import or unused-import errors.)

- [ ] **Step 4: Lint**

Run: `pnpm exec eslint src/app/library/brand/actions.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/library/brand/actions.ts
git commit -m "feat(brand): analyze + apply server actions for website design import"
```

---

## Task 5: Preview/apply UI + wire into the Brand page

**Files:**
- Create: `src/app/library/brand/_components/brand-design-import.tsx`
- Modify: `src/app/library/brand/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/library/brand/_components/brand-design-import.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Globe2, Palette, RefreshCw, Sparkles, Wand2 } from "lucide-react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import {
  analyzeBrandDesignFromWebsiteAction,
  applyBrandDesignAction,
  type BrandDesignAnalyzeState,
  type BrandDesignApplyState,
} from "@/app/library/brand/actions";

const initialAnalyze: BrandDesignAnalyzeState = null;
const initialApply: BrandDesignApplyState = null;

export function BrandDesignImport() {
  const [analyzeState, analyzeAction, analyzing] = useActionState(analyzeBrandDesignFromWebsiteAction, initialAnalyze);
  const [applyState, applyAction, applying] = useActionState(applyBrandDesignAction, initialApply);

  const proposal = analyzeState?.ok ? analyzeState.proposal : null;
  const swatches = proposal
    ? ([proposal.palette.primary, proposal.palette.secondary, proposal.palette.accent, proposal.palette.dark, proposal.palette.light].filter(Boolean) as string[])
    : [];

  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">
            <Wand2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
            Pull brand design from your website
          </h3>
          <p className="mt-1.5 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">
            Paste your homepage and Arc will detect your logo, colors, and fonts. You review before anything is applied.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
          <Sparkles aria-hidden className="h-3.5 w-3.5 text-[var(--accent)]" />
          Logo, colors, fonts
        </span>
      </div>

      <form action={analyzeAction} className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-[16rem] flex-1 gap-1.5">
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Globe2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
            Website URL
          </span>
          <input
            className="min-h-11 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            name="websiteUrl"
            placeholder="https://yourcompany.com"
            type="url"
          />
        </label>
        <button className={buttonClasses({ variant: "primary", size: "sm", className: "min-h-11" })} disabled={analyzing} type="submit">
          {analyzing ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Palette aria-hidden className="h-4 w-4" />}
          {analyzing ? "Reading site..." : "Pull design"}
        </button>
      </form>

      {analyzeState && !analyzeState.ok ? (
        <div className="mt-3"><StatusPill tone="red">{analyzeState.message}</StatusPill></div>
      ) : null}

      {proposal ? (
        <form action={applyAction} className="mt-4 grid gap-4 rounded-[12px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
          <div className="flex flex-wrap items-center gap-5">
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Logo</span>
              {proposal.logoUrl ? (
                <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-white p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Detected logo" className="h-full w-full object-contain" src={proposal.logoUrl} />
                </span>
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-xl border border-dashed border-[var(--border-hairline)] text-[10px] text-[var(--text-muted)]">None</span>
              )}
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Colors</span>
              <div className="flex flex-wrap gap-2">
                {swatches.length > 0 ? swatches.map((hex) => (
                  <span key={hex} className="grid gap-1 text-center">
                    <span className="block h-8 w-12 rounded-md border border-[var(--border-hairline)]" style={{ backgroundColor: hex }} />
                    <span className="font-mono text-[10px] uppercase text-[var(--text-muted)]">{hex}</span>
                  </span>
                )) : <span className="text-sm text-[var(--text-muted)]">None detected</span>}
              </div>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Fonts</span>
              <div className="text-sm text-[var(--text-secondary)]">
                <div>Headings · {proposal.headingFont ?? "—"}</div>
                <div>Body · {proposal.bodyFont ?? "—"}</div>
              </div>
            </div>
          </div>

          {/* Carry the reviewed proposal to the apply action. */}
          <input type="hidden" name="logoUrl" value={proposal.logoUrl ?? ""} />
          <input type="hidden" name="faviconUrl" value={proposal.faviconUrl ?? ""} />
          <input type="hidden" name="primary" value={proposal.palette.primary ?? ""} />
          <input type="hidden" name="secondary" value={proposal.palette.secondary ?? ""} />
          <input type="hidden" name="accent" value={proposal.palette.accent ?? ""} />
          <input type="hidden" name="dark" value={proposal.palette.dark ?? ""} />
          <input type="hidden" name="light" value={proposal.palette.light ?? ""} />
          <input type="hidden" name="headingFont" value={proposal.headingFont ?? ""} />
          <input type="hidden" name="bodyFont" value={proposal.bodyFont ?? ""} />
          <input type="hidden" name="sourceUrl" value={proposal.sourceUrl} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input className="h-4 w-4 accent-[var(--accent)]" name="overwrite" type="checkbox" />
              Overwrite values I&apos;ve already set
            </label>
            <div className="flex items-center gap-2">
              {applyState ? <StatusPill tone={applyState.ok ? "green" : "red"}>{applyState.message}</StatusPill> : null}
              <button className={buttonClasses({ variant: "primary", size: "sm" })} disabled={applying} type="submit">
                {applying ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Wand2 aria-hidden className="h-4 w-4" />}
                {applying ? "Applying..." : "Apply to brand"}
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the Brand page**

In `src/app/library/brand/page.tsx`:

Add the import near the other `_components` imports:

```tsx
import { BrandDesignImport } from "./_components/brand-design-import";
```

Render it directly under the masthead. Change:

```tsx
      <BrandIdentity agentName={agentName} profile={profile} />
      <TeachArc agentName={agentName} />
```

to:

```tsx
      <BrandIdentity agentName={agentName} profile={profile} />
      <BrandDesignImport />
      <TeachArc agentName={agentName} />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: build completes with no TypeScript errors.

- [ ] **Step 4: Lint**

Run: `pnpm exec eslint src/app/library/brand/_components/brand-design-import.tsx src/app/library/brand/page.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/library/brand/_components/brand-design-import.tsx src/app/library/brand/page.tsx
git commit -m "feat(brand): website design import preview/apply card on Brand page"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the new test files together**

Run: `pnpm test src/domain/__tests__/brand-design.test.ts src/lib/brand-kit/design-fetch.test.ts src/lib/brand-kit/website-fetch.test.ts`
Expected: all PASS.

- [ ] **Step 2: Build the app**

Run: `pnpm build`
Expected: successful production build, no type errors.

- [ ] **Step 3: Verify in the running app (preview tools)**

Start the dev server (`preview_start` if not already running) and open `/library/brand`.

Verification must be DOM/text-based, not screenshots — the content pages mount a heavy particle canvas that hangs `preview_screenshot` (and `/arc` WebGL freezes eval). Use:
- `preview_snapshot` on `/library/brand` → confirm the "Pull brand design from your website" card and its URL input render.
- `preview_console_logs` → no errors after the page loads.

If a test/real Supabase + a public site are available, optionally `preview_fill` the URL input with a real homepage and click "Pull design", then `preview_snapshot` to confirm the preview card shows a logo tile / swatches. (Without Supabase configured, "Apply" returns "Supabase is not configured." — that is the expected graceful-degrade path, not a bug.)

- [ ] **Step 4: Final commit (if any verification fixups were made)**

```bash
git add -A
git commit -m "test(brand): verify website design import end to end"
```

---

## Self-Review Notes (already reconciled against the spec)

- **Spec coverage:** pure extractor (Task 1) ✓; reusable SSRF fetch (Task 2) ✓; analyze + image fetch (Task 3) ✓; analyze/apply actions with fill-blanks + overwrite + store-on-apply (Task 4) ✓; preview/apply UI + page wiring + logo guarantee (Task 5) ✓; tests + verification (Tasks 1,3,6) ✓. No schema change required (confirmed: `business_profiles` already has `logo_url`/`favicon_url`/`brand_palette`).
- **Type consistency:** `extractBrandDesign` / `brandDesignToPaletteUpdate` (Task 1) are consumed with matching signatures in Task 3; `BrandDesignProposal` shape from Task 3 is consumed field-for-field by the actions (Task 4) and UI hidden inputs (Task 5); `fetchPublicHtml`/`hostResolvesToPrivate` defined in Task 2 are imported in Task 3.
- **Known gotchas surfaced:** lint scans vendored files (scope eslint to changed files); lint ≠ typecheck (run `pnpm build`); `revalidatePath` throws under vitest (the action is not unit-tested — covered by build + preview instead); screenshots hang on particle pages (DOM checks only).
