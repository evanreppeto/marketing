import { lookup } from "node:dns/promises";

import { assertPublicHttpUrl, extractBrandSignal, type BrandSignal } from "@/lib/brand-kit/website";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 2;

/** True for private/loopback/link-local/metadata addresses. Pure. */
export function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6) {
    const a = address.toLowerCase();
    return a === "::1" || a.startsWith("fe80") || a.startsWith("fc") || a.startsWith("fd");
  }
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  const [a, b] = p;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export type FetchedPage = { url: string; signal: BrandSignal };

export type FetchPublicPageResult =
  | { ok: true; page: FetchedPage }
  | { ok: false; status: number; message: string };

async function resolvedIsPrivate(hostname: string): Promise<boolean> {
  try {
    const r = await lookup(hostname);
    return isPrivateAddress(r.address, r.family);
  } catch {
    return false; // lookup unavailable — best effort, allow
  }
}

/**
 * Fetch a PUBLIC http(s) page with SSRF protection: literal + DNS-resolved
 * private/loopback hosts rejected, redirects re-validated each hop, 5s timeout,
 * 1MB cap. Returns the extracted readable signal. Never throws for expected
 * failures — returns { ok:false, status, message } (status is an HTTP-ish code).
 */
export async function fetchPublicPage(urlRaw: string): Promise<FetchPublicPageResult> {
  let url: URL;
  try {
    url = assertPublicHttpUrl(urlRaw);
  } catch (error) {
    return { ok: false, status: 400, message: error instanceof Error ? error.message : "Unsafe URL." };
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
        return { ok: false, status: 400, message: error instanceof Error ? error.message : "Unsafe redirect target." };
      }
      if (await resolvedIsPrivate(safe.hostname)) {
        return { ok: false, status: 400, message: "Refusing to fetch a private/loopback address." };
      }

      const res = await fetch(safe, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "ArcBot/1.0" },
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) return { ok: false, status: 502, message: "Too many redirects." };
        try {
          current = new URL(location, safe);
        } catch {
          return { ok: false, status: 502, message: "Invalid redirect location." };
        }
        continue;
      }

      if (!res.ok) return { ok: false, status: 502, message: `Site returned ${res.status}.` };
      const raw = await res.text();
      const signal = extractBrandSignal(raw.slice(0, MAX_BYTES), safe.toString());
      return { ok: true, page: { url: safe.toString(), signal } };
    }
  } catch (error) {
    return { ok: false, status: 502, message: error instanceof Error ? error.message : "Failed to fetch the page." };
  } finally {
    clearTimeout(timer);
  }
}
