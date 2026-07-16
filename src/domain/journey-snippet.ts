/**
 * Journey collector snippet — the pure decision logic shared with the browser
 * script served at GET /api/v1/journey/snippet.js.
 *
 * The snippet only tracks *attributable, first-party* arrivals: a visitor who
 * landed via a campaign-tagged link (carrying the `bsg_at` token that dispatch
 * stamps, or a `utm_campaign` UUID). A bare visit with no campaign context is
 * NOT tracked — we don't fingerprint anonymous traffic, we follow campaign
 * click-throughs. This function is the single source of truth for that decision;
 * `buildCollectorScript` inlines the same rule into the browser IIFE.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SnippetTouch = {
  /** The touch kind for a landing arrival — always a collectable engaged-stage kind. */
  kind: "site_visit";
  token: string | null;
  campaignId: string | null;
  channel: string | null;
};

/**
 * Pure + total: given a URL query string (e.g. `location.search`), decide whether
 * this landing is an attributable campaign arrival and, if so, what to collect.
 * Returns null when there's no campaign token/id — i.e. don't track this visit.
 */
export function readSnippetTouch(search: string): SnippetTouch | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return null;
  }
  const token = params.get("bsg_at");
  const utmCampaign = params.get("utm_campaign");
  const campaignId = utmCampaign && UUID_RE.test(utmCampaign) ? utmCampaign : null;
  if (!token && !campaignId) return null;
  return { kind: "site_visit", token: token || null, campaignId, channel: params.get("utm_source") || null };
}
