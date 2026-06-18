const MAX_TEXT = 8000;

/** Brand signal extracted from a fetched page. */
export type BrandSignal = {
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  text: string;
};

/** True for IPv4 literals in private/loopback/link-local ranges. */
function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}

/**
 * Throw unless `raw` is a public http(s) URL. Synchronous SSRF guard for literal
 * hosts (scheme + localhost + private IPv4 + IPv6 loopback). The route adds a
 * DNS-resolution check for named hosts before fetching.
 */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "[::1]") {
    throw new Error("Refusing to fetch a loopback host.");
  }
  if (isPrivateIpv4(host)) {
    throw new Error("Refusing to fetch a private/loopback address.");
  }
  return url;
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m ? m[1].trim() : null;
}

/** Strip markup to readable text + pull title/description/favicon. Pure. */
export function extractBrandSignal(html: string, baseUrl: string): BrandSignal {
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    firstMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const iconHref =
    firstMatch(html, /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i) ??
    firstMatch(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);
  let faviconUrl: string | null = null;
  if (iconHref) {
    try {
      faviconUrl = new URL(iconHref, baseUrl).toString();
    } catch {
      faviconUrl = null;
    }
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);

  return { title, description, faviconUrl, text };
}
