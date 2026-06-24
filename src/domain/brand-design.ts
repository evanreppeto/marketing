/**
 * Brand design extraction — pure, no I/O. Given a page's raw HTML, surface the
 * company's logo candidates, brand colors, and fonts so the operator can pull
 * their visual identity onto the Business Profile. Best-effort by design: a
 * human reviews the result before it is applied. I/O (fetching, storing) lives
 * in src/lib/brand-kit/design-fetch.ts.
 */

export type BrandDesignColor = { hex: string; source: "theme-color" | "css-var" | "frequency"; count?: number };

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
  if (/^#[0-9a-f]{3,4}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  else if (/^#[0-9a-f]{8}$/.test(v)) v = v.slice(0, 7);
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

/** Euclidean RGB distance (0–441). Used to collapse near-identical swatches. */
function rgbDistance(a: string, b: string): number {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const dr = ch(a, 1) - ch(b, 1);
  const dg = ch(a, 3) - ch(b, 3);
  const db = ch(a, 5) - ch(b, 5);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function extractColors(html: string): BrandDesignColor[] {
  const found = new Map<string, BrandDesignColor>();
  const add = (hex: string | null, source: BrandDesignColor["source"], count?: number) => {
    if (hex && !found.has(hex)) found.set(hex, { hex, source, ...(count !== undefined ? { count } : {}) });
  };

  for (const t of tagsOf(html, "meta")) {
    if (/name\s*=\s*["']theme-color["']/i.test(t)) add(normalizeHex(attr(t, "content") ?? ""), "theme-color");
  }

  const styles = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join("\n");
  const inline = (html.match(/style\s*=\s*"([^"]*)"/gi) ?? []).join("\n");
  const css = `${styles}\n${inline}`;

  for (const m of css.matchAll(/--[\w-]*(?:primary|secondary|accent|brand|color)[\w-]*\s*:\s*([^;}]+)/gi)) {
    const firstToken = m[1].trim().split(/\s+/)[0]; // drop "!important" and trailing tokens
    add(normalizeHex(firstToken) ?? rgbToHex(m[1]), "css-var");
  }

  const freq = new Map<string, number>();
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const hex = normalizeHex(m[0]);
    if (hex) freq.set(hex, (freq.get(hex) ?? 0) + 1);
  }
  for (const m of css.matchAll(/rgba?\([^)]*\)/gi)) {
    const hex = rgbToHex(m[0]);
    if (hex) freq.set(hex, (freq.get(hex) ?? 0) + 1);
  }
  for (const [hex, count] of [...freq.entries()].sort((a, b) => b[1] - a[1])) add(hex, "frequency", count);

  // Rank: saturated brand colors first, gray extremes last; within a bucket,
  // trust an explicit brand-named CSS variable over a theme-color meta (often a
  // dark chrome color) over a raw frequency match; then by on-page prominence.
  const sourceRank = (s: BrandDesignColor["source"]) => (s === "css-var" ? 0 : s === "theme-color" ? 1 : 2);
  const sorted = [...found.values()].sort((a, b) => {
    const va = saturation(a.hex) > 0.15 ? 0 : 1;
    const vb = saturation(b.hex) > 0.15 ? 0 : 1;
    if (va !== vb) return va - vb;
    const r = sourceRank(a.source) - sourceRank(b.source);
    if (r !== 0) return r;
    return (b.count ?? 0) - (a.count ?? 0);
  });
  // Collapse near-identical swatches; the earlier (higher-priority) one wins.
  const deduped: BrandDesignColor[] = [];
  for (const c of sorted) {
    if (deduped.some((kept) => rgbDistance(kept.hex, c.hex) < 32)) continue;
    deduped.push(c);
  }
  return deduped;
}

function cleanFamily(raw: string): string | null {
  for (const token of raw.split(",")) {
    const name = token.trim().replace(/^['"]|['"]$/g, "").trim();
    if (!name) continue;
    if (GENERIC_FONTS.has(name.toLowerCase())) continue;
    return name;
  }
  return null;
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

  // Prefer true neutrals (colors not chosen as a vivid brand color) for dark/light,
  // so a vivid primary doesn't also become the "dark" ink.
  const vividPicks = new Set([primary, secondary, accent].filter(Boolean));
  const neutrals = signal.colors.filter((c) => !vividPicks.has(c.hex));
  const pool = (neutrals.length > 0 ? neutrals : signal.colors)
    .slice()
    .sort((a, b) => luminance(a.hex) - luminance(b.hex));
  if (pool.length > 0) {
    update.dark = pool[0].hex;
    update.light = pool[pool.length - 1].hex;
  }
  if (signal.headingFont) update.headingFont = signal.headingFont;
  if (signal.bodyFont) update.bodyFont = signal.bodyFont;
  return update;
}
