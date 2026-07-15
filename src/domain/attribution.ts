const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CampaignLinkInput = {
  destinationUrl: string;
  campaignId: string;
  assetId?: string;
  channel?: string;
};

function toBase64Url(json: string): string {
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Pure: stamp a destination URL with utm params + a compact bsg_at token. */
export function buildCampaignLink({ destinationUrl, campaignId, assetId, channel }: CampaignLinkInput): string {
  if (!UUID_RE.test(campaignId)) {
    throw new Error("buildCampaignLink: campaignId must be a valid UUID.");
  }
  const url = new URL(destinationUrl);
  // assetId is intentionally not UUID-validated here: resolveAttribution validates
  // decoded.a on the way out, so a bad assetId simply resolves to a null asset.
  const tokenPayload = {
    c: campaignId,
    ...(assetId ? { a: assetId } : {}),
    ...(channel ? { ch: channel } : {}),
  };
  const token = toBase64Url(JSON.stringify(tokenPayload));
  url.searchParams.set("utm_source", channel ?? "arc");
  url.searchParams.set("utm_medium", "campaign");
  url.searchParams.set("utm_campaign", campaignId);
  url.searchParams.set("bsg_at", token);
  return url.toString();
}

// Hosts we never rewrite: tagging an unsubscribe or a social-profile link with a
// campaign token is wrong (pollutes third-party analytics, and the token would
// never round-trip back through our ingest). Matched as a suffix so subdomains
// count (m.facebook.com → facebook.com).
const NEVER_TAG_HOSTS = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "maps.google.com",
  "goo.gl",
];

function hostIsSkipped(host: string, extraSkip: string[]): boolean {
  const h = host.toLowerCase();
  return [...NEVER_TAG_HOSTS, ...extraSkip].some((skip) => h === skip || h.endsWith(`.${skip}`));
}

/** Whether a single URL should receive campaign tagging. Total — never throws. */
function shouldTag(raw: string, extraSkip: string[]): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false; // relative/mailto/tel/#anchor/malformed — leave untouched
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.searchParams.has("bsg_at")) return false; // already tagged — idempotent
  if (/unsubscribe|list-unsubscribe/i.test(raw)) return false;
  return !hostIsSkipped(url.hostname, extraSkip);
}

export type StampLinksInput = {
  campaignId: string;
  assetId?: string | null;
  channel?: string | null;
  /** Extra hosts to leave untagged, in addition to the social/unsubscribe defaults. */
  skipHosts?: string[];
};

// A bare-URL match for plain-text bodies. Trailing sentence punctuation is peeled
// back off the match so "visit https://x.co/a." keeps the period outside the link.
const TEXT_URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const TRAILING_PUNCT_RE = /[.,;:!?)]+$/;

/**
 * Pure: rewrite first-party links in an email body so a recipient's click-through
 * carries campaign identity (utm + the compact bsg_at token resolveAttribution
 * reads). Social, unsubscribe, non-http, and already-tagged links are left alone;
 * an unparseable body or a non-UUID campaignId is returned unchanged. Idempotent.
 */
export function stampCampaignLinks(
  body: { html?: string | null; text?: string | null },
  input: StampLinksInput,
): { html: string | null; text: string | null } {
  const html = body.html ?? null;
  const text = body.text ?? null;
  if (!UUID_RE.test(input.campaignId)) return { html, text };

  const skip = input.skipHosts ?? [];
  const tag = (raw: string): string => {
    if (!shouldTag(raw, skip)) return raw;
    try {
      return buildCampaignLink({
        destinationUrl: raw,
        campaignId: input.campaignId,
        assetId: input.assetId ?? undefined,
        channel: input.channel ?? undefined,
      });
    } catch {
      return raw;
    }
  };

  const stampedHtml = html == null ? null : html.replace(/(\bhref\s*=\s*)(["'])(.*?)\2/gi, (_m, pre, q, url) => `${pre}${q}${tag(url)}${q}`);
  const stampedText =
    text == null
      ? null
      : text.replace(TEXT_URL_RE, (match) => {
          const trailing = match.match(TRAILING_PUNCT_RE)?.[0] ?? "";
          const core = trailing ? match.slice(0, -trailing.length) : match;
          return `${tag(core)}${trailing}`;
        });

  return { html: stampedHtml, text: stampedText };
}

export type AttributionMethod = "explicit" | "token" | "utm" | "source_rule" | "unattributed";

export type AttributionInput = {
  campaignId?: string;
  campaignAssetId?: string;
  channel?: string;
  token?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  source?: string;
};

export type ResolvedAttribution = {
  campaignId: string | null;
  assetId: string | null;
  channel: string | null;
  utm: Record<string, string>;
  method: AttributionMethod;
};

function fromBase64Url(token: string): string {
  return atob(token.replace(/-/g, "+").replace(/_/g, "/"));
}

function decodeToken(token: string): { c?: string; a?: string; ch?: string } | null {
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as { c?: string; a?: string; ch?: string };
  } catch {
    return null;
  }
}

/** Pure + total: never throws. Last-touch precedence: explicit > token > utm > source rule > unattributed. */
export function resolveAttribution(
  input: AttributionInput,
  sourceRules: Record<string, string> = {},
): ResolvedAttribution {
  const utm: Record<string, string> = {};
  if (input.utmSource) utm.utm_source = input.utmSource;
  if (input.utmMedium) utm.utm_medium = input.utmMedium;
  if (input.utmCampaign) utm.utm_campaign = input.utmCampaign;

  if (input.campaignId && UUID_RE.test(input.campaignId)) {
    return {
      campaignId: input.campaignId,
      assetId: input.campaignAssetId && UUID_RE.test(input.campaignAssetId) ? input.campaignAssetId : null,
      channel: input.channel ?? null,
      utm,
      method: "explicit",
    };
  }

  if (input.token) {
    const decoded = decodeToken(input.token);
    if (decoded?.c && UUID_RE.test(decoded.c)) {
      return {
        campaignId: decoded.c,
        assetId: decoded.a && UUID_RE.test(decoded.a) ? decoded.a : null,
        channel: decoded.ch ?? input.channel ?? null,
        utm,
        method: "token",
      };
    }
  }

  if (input.utmCampaign && UUID_RE.test(input.utmCampaign)) {
    return { campaignId: input.utmCampaign, assetId: null, channel: input.utmSource ?? input.channel ?? null, utm, method: "utm" };
  }

  const ruled = input.source ? sourceRules[input.source] : undefined;
  if (ruled && UUID_RE.test(ruled)) {
    return { campaignId: ruled, assetId: null, channel: input.channel ?? null, utm, method: "source_rule" };
  }

  return { campaignId: null, assetId: null, channel: input.channel ?? null, utm, method: "unattributed" };
}

export type CampaignEconomicsInput = {
  attributedLeads: number;
  wonRevenueCents: number;
  wonCount: number;
  openPipelineCents: number;
  spendCents: number;
};

export type CampaignEconomics = {
  realizedRevenueCents: number;
  pipelineRevenueCents: number;
  spendCents: number;
  attributedLeads: number;
  wonCount: number;
  roas: number | null;
  cac: number | null;
  cpl: number | null;
};

/** Pure: realized-only ROAS. Pipeline is reported separately, never folded into ROAS. */
export function computeCampaignEconomics(input: CampaignEconomicsInput): CampaignEconomics {
  const { attributedLeads, wonRevenueCents, wonCount, openPipelineCents, spendCents } = input;
  return {
    realizedRevenueCents: wonRevenueCents,
    pipelineRevenueCents: openPipelineCents,
    spendCents,
    attributedLeads,
    wonCount,
    roas: spendCents > 0 ? wonRevenueCents / spendCents : null,
    cac: wonCount > 0 ? Math.round(spendCents / wonCount) : null,
    cpl: attributedLeads > 0 ? Math.round(spendCents / attributedLeads) : null,
  };
}
