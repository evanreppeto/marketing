import { isIP } from "node:net";

const MAX_SOURCE_BYTES = 1_000_000;
const ALLOWED_CONTENT_TYPES = [
  "application/json",
  "application/xhtml+xml",
  "text/html",
  "text/markdown",
  "text/plain",
] as const;

export type UrlSourceDocument = {
  url: string;
  title: string;
  fileName: string;
  contentType: string;
  text: string;
  byteSize: number;
};

export type FetchUrlSourceInput = {
  url: string;
  fetcher?: typeof fetch;
};

export type DiscoverWebsiteSourceUrlsInput = {
  url: string;
  maxUrls?: number;
  fetcher?: typeof fetch;
};

const SOURCE_PATH_KEYWORDS = [
  "about",
  "services",
  "service",
  "products",
  "product",
  "solutions",
  "capabilities",
  "work",
  "case-study",
  "case-studies",
  "reviews",
  "testimonials",
  "pricing",
  "contact",
  "faq",
] as const;

export function assertPublicHttpUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid website URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("URL imports only support http and https links.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL imports cannot include usernames or passwords.");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = isIP(host);
  const blocked =
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    (ipVersion === 6 && /^(fc|fd|fe80):/i.test(host));
  if (blocked) {
    throw new Error("URL imports must point to a public website.");
  }

  parsed.hash = "";
  return parsed;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function readableHtml(html: string): { title: string | null; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return {
    title: title ? decodeHtmlEntities(title).replace(/\s+/g, " ").trim() : null,
    text: decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim(),
  };
}

function titleFromUrl(url: URL): string {
  const path = url.pathname
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/\.[a-z0-9]{2,8}$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return path || url.hostname.replace(/^www\./, "");
}

function sanitizeFileName(value: string): string {
  const clean = value
    .replace(/https?:\/\//i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${clean || "website-source"}.txt`;
}

function isAllowedContentType(contentType: string): boolean {
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.some((allowed) => normalized === allowed);
}

function fetchHeaders() {
  return {
    accept: "text/html,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.1",
    "user-agent": "ArcBrandSourceImporter/1.0",
  };
}

function sourceLinkScore(url: URL): number {
  const path = `${url.pathname.toLowerCase()} ${url.search.toLowerCase()}`;
  const keywordIndex = SOURCE_PATH_KEYWORDS.findIndex((keyword) => path.includes(keyword));
  const depth = url.pathname.split("/").filter(Boolean).length;
  const keywordScore = keywordIndex >= 0 ? keywordIndex : 99;
  return keywordScore * 10 + depth;
}

function shouldSkipSourceLink(url: URL): boolean {
  return /\.(avi|css|docx?|gif|ico|jpe?g|js|mov|mp3|mp4|pdf|png|svg|webp|xlsx?|zip)$/i.test(url.pathname);
}

function normalizeSameOriginLink(base: URL, href: string): string | null {
  if (!href || href.startsWith("#") || /^(mailto|tel|sms|javascript):/i.test(href)) return null;
  let candidate: URL;
  try {
    candidate = new URL(href, base);
  } catch {
    return null;
  }
  if (candidate.origin !== base.origin) return null;
  if (!["http:", "https:"].includes(candidate.protocol)) return null;
  candidate.hash = "";
  for (const key of [...candidate.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|msclkid)/i.test(key)) candidate.searchParams.delete(key);
  }
  if (shouldSkipSourceLink(candidate)) return null;
  return candidate.toString();
}

function extractSameOriginLinks(html: string, base: URL): string[] {
  const links = new Set<string>();
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const link = normalizeSameOriginLink(base, match[1] ?? match[2] ?? match[3] ?? "");
    if (link) links.add(link);
  }
  return [...links];
}

export async function discoverWebsiteSourceUrls({
  url,
  maxUrls = 6,
  fetcher = fetch,
}: DiscoverWebsiteSourceUrlsInput): Promise<string[]> {
  const parsed = assertPublicHttpUrl(url);
  const response = await fetcher(parsed.toString(), {
    headers: fetchHeaders(),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`URL returned ${response.status}.`);
  const finalUrl = response.url ? assertPublicHttpUrl(response.url) : parsed;

  const contentType = response.headers.get("content-type") ?? "text/plain";
  const normalizedType = contentType.split(";")[0].trim().toLowerCase();
  if (normalizedType !== "text/html" && normalizedType !== "application/xhtml+xml") {
    return [finalUrl.toString()];
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_SOURCE_BYTES) throw new Error("URL source is too large to inspect.");
  const html = await response.text();
  if (new TextEncoder().encode(html).byteLength > MAX_SOURCE_BYTES) throw new Error("URL source is too large to inspect.");

  const base = finalUrl;
  const homepage = base.toString();
  const candidates = extractSameOriginLinks(html, base)
    .filter((candidate) => candidate !== homepage)
    .sort((a, b) => sourceLinkScore(new URL(a)) - sourceLinkScore(new URL(b)));

  return [homepage, ...candidates].slice(0, Math.max(1, maxUrls));
}

export async function fetchUrlSource({ url, fetcher = fetch }: FetchUrlSourceInput): Promise<UrlSourceDocument> {
  const parsed = assertPublicHttpUrl(url);
  const response = await fetcher(parsed.toString(), {
    headers: fetchHeaders(),
    redirect: "follow",
  });
  const finalUrl = response.url ? assertPublicHttpUrl(response.url) : parsed;

  if (!response.ok) {
    throw new Error(`URL returned ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "text/plain";
  if (!isAllowedContentType(contentType)) {
    throw new Error("URL imports currently support public text, HTML, markdown, and JSON pages.");
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_SOURCE_BYTES) {
    throw new Error("URL source is too large to import.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    throw new Error("URL source is too large to import.");
  }

  const raw = new TextDecoder().decode(bytes);
  const normalizedType = contentType.split(";")[0].trim().toLowerCase();
  const html = normalizedType === "text/html" || normalizedType === "application/xhtml+xml";
  const parsedText = html ? readableHtml(raw) : { title: null, text: raw.replace(/\s+/g, " ").trim() };
  const title = parsedText.title || titleFromUrl(finalUrl);
  const text = parsedText.text.slice(0, MAX_SOURCE_BYTES).trim();

  if (text.length < 20) {
    throw new Error("URL did not contain enough readable text.");
  }

  return {
    url: finalUrl.toString(),
    title,
    fileName: sanitizeFileName(title),
    contentType,
    text,
    byteSize: new TextEncoder().encode(text).byteLength,
  };
}
