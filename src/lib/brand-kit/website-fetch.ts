import { lookup } from "node:dns/promises";

import { assertPublicHttpUrl, extractBrandSignal, type BrandSignal } from "@/lib/brand-kit/website";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 1_000_000;

function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6) {
    return (
      address === "::1" ||
      address.toLowerCase().startsWith("fe80") ||
      address.toLowerCase().startsWith("fc") ||
      address.toLowerCase().startsWith("fd")
    );
  }
  const p = address.split(".").map(Number);
  if (p.length !== 4) return false;
  const [a, b] = p;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function resolvedIsPrivate(hostname: string): Promise<boolean> {
  try {
    const r = await lookup(hostname);
    return isPrivateAddress(r.address, r.family);
  } catch {
    return false;
  }
}

export async function fetchPublicBrandSignal(rawUrl: string): Promise<BrandSignal & { finalUrl: string }> {
  let url = assertPublicHttpUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const maxRedirects = 2;

  try {
    for (let hop = 0; ; hop++) {
      url = assertPublicHttpUrl(url.toString());
      if (await resolvedIsPrivate(url.hostname)) {
        throw new Error("Refusing to fetch a private/loopback address.");
      }

      const res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "ArcBrandBot/1.0" },
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= maxRedirects) throw new Error("Too many redirects.");
        url = new URL(location, url);
        continue;
      }

      if (!res.ok) throw new Error(`Site returned ${res.status}.`);
      const html = (await res.text()).slice(0, MAX_BYTES);
      return { ...extractBrandSignal(html, url.toString()), finalUrl: url.toString() };
    }
  } finally {
    clearTimeout(timer);
  }
}
