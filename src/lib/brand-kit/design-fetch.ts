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
