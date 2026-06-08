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
