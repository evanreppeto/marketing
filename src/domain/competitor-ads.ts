/**
 * Pure mapping of competitor ad-library findings onto the existing competitor
 * signal contract (BSR-367). No I/O — the live pull from Meta Ad Library / Google
 * Ads Transparency lives behind an injectable source in the connector runtime;
 * this module only translates a fetched ad flight into a `CompetitorSignalInput`
 * so the SAME BSR-361 detector (`detectCompetitorOpportunities`) turns it into a
 * `competitor_signal` opportunity. Kept pure so it's unit-testable against
 * fixtures with no network.
 *
 * Read-only competitive intel. Nothing here contacts anyone — the opportunity it
 * feeds is a defensive/contested-market proposal the operator acts on behind the
 * approval gate.
 */

import { type CompetitorSignalInput } from "./opportunity-detection";

/** One competitor advertising flight observed in a public ad library. */
export type CompetitorAdFlight = {
  /** Stable id for this flight — the ad-library flight/page id, or a competitor+market key. Dedup key. */
  id: string;
  competitorName: string;
  /** Where the flight was seen: "meta_ad_library" | "google_ads_transparency" | … */
  channel: string;
  /** Keywords/terms the competitor is bidding on or emphasizing. */
  keywords?: string[];
  /** Captured ad creatives (headlines / snippets) — a flight-size proxy + creative intel. */
  creatives?: string[];
  /** Explicit creative count when the library gives one without the creatives themselves. */
  creativeCount?: number;
  /** Persona the flight targets, when inferable. */
  persona?: string;
  /** ISO capture time; intel older than the detector's freshness window is treated as stale. */
  capturedAt?: string;
  /** Competitor landing/transparency page URL. */
  url?: string;
};

function cleanStrings(values: unknown): string[] {
  return Array.isArray(values) ? values.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()) : [];
}

/**
 * Translate captured ad flights into the detector's `CompetitorSignalInput[]`,
 * deduped by flight id (so re-scans + Meta/Google overlap don't double up). New
 * intel defaults to `needs_review` — it surfaces an opportunity but stays flagged
 * as unconfirmed until a human looks.
 */
export function mapAdFlightsToSignals(flights: CompetitorAdFlight[]): CompetitorSignalInput[] {
  const byId = new Map<string, CompetitorSignalInput>();
  for (const flight of flights) {
    const id = (flight.id ?? "").trim();
    const competitorName = (flight.competitorName ?? "").trim();
    if (!id || !competitorName || byId.has(id)) continue;

    const keywords = cleanStrings(flight.keywords);
    const creatives = cleanStrings(flight.creatives);
    const creativeCount =
      typeof flight.creativeCount === "number" && flight.creativeCount >= 0 ? Math.floor(flight.creativeCount) : creatives.length;

    byId.set(id, {
      id,
      competitorName,
      channel: (flight.channel ?? "").trim() || "ad_library",
      status: "needs_review",
      ...(keywords.length ? { keywords } : {}),
      creativeCount,
      ...(flight.persona?.trim() ? { persona: flight.persona.trim() } : {}),
      ...(flight.capturedAt ? { capturedAt: flight.capturedAt } : {}),
      ...(typeof flight.url === "string" && /^https?:\/\//i.test(flight.url.trim()) ? { url: flight.url.trim() } : {}),
    });
  }
  return [...byId.values()];
}
