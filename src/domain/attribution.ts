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
  url.searchParams.set("utm_source", channel ?? "mark");
  url.searchParams.set("utm_medium", "campaign");
  url.searchParams.set("utm_campaign", campaignId);
  url.searchParams.set("bsg_at", token);
  return url.toString();
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
