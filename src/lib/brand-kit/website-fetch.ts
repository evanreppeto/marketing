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
