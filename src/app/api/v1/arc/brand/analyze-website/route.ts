import { lookup } from "node:dns/promises";

import { INVALID_JSON, fail, guard, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { assertPublicHttpUrl, extractBrandSignal } from "@/lib/brand-kit/website";

export const runtime = "nodejs"; // needs node:dns + fetch with redirect control

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 1_000_000;

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

/**
 * Fetch a public website and extract brand signal (title, description, favicon,
 * readable text) for Arc to reason over. SSRF-guarded: http(s) only, literal +
 * DNS-resolved private/loopback addresses rejected, 5s timeout, 1MB cap. No LLM
 * here — Arc structures the result.
 *
 *   POST /api/v1/arc/brand/analyze-website  { url }
 *   -> 200 { ok, title, description, faviconUrl, text }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const urlRaw =
    typeof (payload as Record<string, unknown>).url === "string"
      ? ((payload as Record<string, unknown>).url as string).trim()
      : "";
  if (!urlRaw) return fail("rejected", "url is required.", 400);

  let url;
  try {
    url = assertPublicHttpUrl(urlRaw);
  } catch (error) {
    return fail("rejected", error instanceof Error ? error.message : "Unsafe URL.", 400);
  }

  // DNS guard for named hosts. Best-effort: if lookup is unavailable, the literal
  // guard above still applies.
  try {
    const resolved = await lookup(url.hostname);
    if (isPrivateAddress(resolved.address, resolved.family)) {
      return fail("rejected", "Refusing to fetch a private/loopback address.", 400);
    }
  } catch {
    /* lookup failed/unavailable — proceed; fetch will surface real errors */
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ArcBrandBot/1.0" } });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return fail("failed", `Site returned ${res.status}.`, 502);

    const raw = await res.text();
    const html = raw.slice(0, MAX_BYTES);
    const signal = extractBrandSignal(html, url.toString());
    return ok({ title: signal.title, description: signal.description, faviconUrl: signal.faviconUrl, text: signal.text });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to fetch the site.", 502);
  }
}
