import type { CompetitorAdFlight } from "@/domain";

/**
 * Live source behind the competitor-ads connector: Meta's official Ad Library API
 * (graph.facebook.com/ads_archive). Read-only, official API only — no scraping.
 *
 * ⚠️ COVERAGE IS LIMITED BY META, NOT BY THIS CODE. Outside the EU the Ad Library
 * API only returns political / social-issue ads; general commercial ads are only
 * broadly queryable for EU-delivered ads (DSA). `adType` is therefore operator-
 * configurable and defaults to ALL, and a query that returns nothing returns []
 * rather than anything invented. The connector copy says this plainly — a silent
 * empty must never read as "no competitor activity".
 *
 * Ads are grouped per advertiser page into ONE flight, so `creativeCount` is a
 * real flight-size proxy and the id stays stable across re-scans (page + market),
 * letting upsertOpportunities' open-status dedup do its job.
 */

const META_ENDPOINT = "https://graph.facebook.com/v21.0/ads_archive";
const FETCH_TIMEOUT_MS = 9000;
const MAX_CREATIVE_SAMPLES = 5;

export type MetaAdLibraryOptions = {
  /** Terms to search the library for (competitor names / service terms). */
  searchTerms: string[];
  /** ISO-3166 alpha-2 countries the ads reached. Meta requires at least one. */
  countries: string[];
  /** "ALL" | "POLITICAL_AND_ISSUE_ADS". Outside the EU, ALL yields little/nothing. */
  adType?: string;
  /** Injected in tests so no live network is hit. */
  fetchImpl?: typeof fetch;
  /** Ads pulled per search term. */
  limit?: number;
};

type MetaAd = {
  id?: string;
  page_id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string;
  ad_snapshot_url?: string;
};
type MetaAdsResponse = { data?: MetaAd[] };

function cleanList(values: unknown): string[] {
  return Array.isArray(values) ? values.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()) : [];
}

/**
 * Group one search term's ads into per-advertiser flights. Ads with no page name
 * are dropped — a flight with no competitor cannot be acted on.
 */
export function metaAdsToFlights(ads: MetaAd[], term: string, now: string): CompetitorAdFlight[] {
  const byPage = new Map<string, { name: string; creatives: string[]; count: number; url?: string; startedAt?: string }>();
  for (const ad of ads) {
    const name = ad.page_name?.trim();
    if (!name) continue;
    const pageKey = ad.page_id?.trim() || name.toLowerCase();
    const entry = byPage.get(pageKey) ?? { name, creatives: [], count: 0, url: ad.ad_snapshot_url, startedAt: ad.ad_delivery_start_time };
    entry.count += 1;
    for (const creative of [...cleanList(ad.ad_creative_link_titles), ...cleanList(ad.ad_creative_bodies)]) {
      if (entry.creatives.length < MAX_CREATIVE_SAMPLES && !entry.creatives.includes(creative)) entry.creatives.push(creative);
    }
    byPage.set(pageKey, entry);
  }

  return [...byPage.entries()].map(([pageKey, entry]) => {
    // Stable across re-scans: advertiser + the term that surfaced them.
    const id = `meta:${pageKey}:${term.toLowerCase().replace(/\s+/g, "-")}`;
    const ms = entry.startedAt ? Date.parse(entry.startedAt) : NaN;
    return {
      id,
      competitorName: entry.name,
      channel: "meta_ad_library",
      keywords: [term],
      creatives: entry.creatives,
      creativeCount: entry.count,
      capturedAt: Number.isNaN(ms) ? now : new Date(ms).toISOString(),
      url: entry.url,
    } satisfies CompetitorAdFlight;
  });
}

async function fetchTerm(term: string, accessToken: string, opts: MetaAdLibraryOptions): Promise<MetaAd[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    search_terms: term,
    ad_reached_countries: JSON.stringify(opts.countries),
    ad_type: opts.adType?.trim() || "ALL",
    ad_active_status: "ACTIVE",
    fields: "id,page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_snapshot_url",
    limit: String(opts.limit ?? 25),
  });
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(`${META_ENDPOINT}?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as MetaAdsResponse;
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Build a competitor-ad source backed by the Meta Ad Library. Best-effort per term. */
export function metaAdLibrarySource(accessToken: string, opts: MetaAdLibraryOptions): { listAdFlights(now: string): Promise<CompetitorAdFlight[]> } {
  return {
    async listAdFlights(now: string): Promise<CompetitorAdFlight[]> {
      const terms = opts.searchTerms.map((t) => t.trim()).filter(Boolean);
      if (terms.length === 0 || opts.countries.length === 0) return [];
      const byId = new Map<string, CompetitorAdFlight>();
      for (const term of terms) {
        try {
          for (const flight of metaAdsToFlights(await fetchTerm(term, accessToken, opts), term, now)) {
            if (!byId.has(flight.id)) byId.set(flight.id, flight);
          }
        } catch {
          // best-effort per term — one bad term never sinks the scan
        }
      }
      return [...byId.values()];
    },
  };
}

export type MetaAdLibraryCheckResult = { ok: true; count?: number } | { ok: false; error: string };

/**
 * Operator "Test connection" probe. Unlike the scan source (best-effort → []), this
 * reports WHY it failed — a rejected token vs a query Meta accepted but that matched
 * nothing (very common outside the EU, where only political ads are queryable).
 */
export async function checkMetaAdLibrary(
  accessToken: string,
  opts: { searchTerms: string[]; countries: string[]; adType?: string; fetchImpl?: typeof fetch },
): Promise<MetaAdLibraryCheckResult> {
  const term = opts.searchTerms.map((t) => t.trim()).filter(Boolean)[0];
  if (!term) return { ok: false, error: "add at least one competitor / search term first" };
  if (opts.countries.length === 0) return { ok: false, error: "add at least one country code (e.g. US)" };
  const params = new URLSearchParams({
    access_token: accessToken,
    search_terms: term,
    ad_reached_countries: JSON.stringify(opts.countries),
    ad_type: opts.adType?.trim() || "ALL",
    fields: "id,page_name",
    limit: "1",
  });
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(`${META_ENDPOINT}?${params.toString()}`, { signal: controller.signal });
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, error: `Meta rejected the request (${res.status}) — check the access token and its Ad Library permission` };
    }
    if (!res.ok) return { ok: false, error: `Meta returned ${res.status}` };
    const json = (await res.json()) as MetaAdsResponse;
    return { ok: true, count: Array.isArray(json.data) ? json.data.length : 0 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Meta unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
