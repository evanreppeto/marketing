/**
 * Campaign asset types — mirrors the Postgres `campaign_asset_type` enum. Kept
 * here (pure, no I/O) so BOTH the operator and Arc write paths validate against
 * the same set, and so a free-string asset_type from a runner tool is normalized
 * to a real enum value instead of failing as a late Postgres 502 (the recurring
 * "tool/DB enum drift" bug class). A type-level drift guard lives in the test.
 */
export const CAMPAIGN_ASSET_TYPE_VALUES = [
  "landing_page",
  "search_ad",
  "social_ad",
  "display_ad",
  "google_business_post",
  "email",
  "sms",
  "video_prompt",
  "image_prompt",
  "one_pager",
  "referral_packet",
  "review_response",
  "script",
  "other",
] as const;

export type CampaignAssetType = (typeof CAMPAIGN_ASSET_TYPE_VALUES)[number];

const CAMPAIGN_ASSET_TYPE_SET = new Set<string>(CAMPAIGN_ASSET_TYPE_VALUES);

/**
 * Aliases the agent (or an operator) plausibly emits that are NOT enum members.
 * Mapped to the real value so a model that says "video_ad" / "image" still lands
 * a draft. Every value on the right MUST be a real CampaignAssetType.
 */
const CAMPAIGN_ASSET_TYPE_ALIASES: Record<string, CampaignAssetType> = {
  video: "video_prompt",
  video_ad: "video_prompt",
  image: "image_prompt",
  image_ad: "image_prompt",
  photo: "image_prompt",
  text: "sms",
  paid_social: "social_ad",
  ad: "social_ad",
  flyer: "one_pager",
};

/** True only for an exact `campaign_asset_type` enum member. */
export function isCampaignAssetType(value: unknown): value is CampaignAssetType {
  return typeof value === "string" && CAMPAIGN_ASSET_TYPE_SET.has(value);
}

/**
 * Normalize a free-string asset type to a valid `campaign_asset_type`, applying
 * a small alias map first. Returns null when the value can't be resolved so the
 * caller can reject with a clean 400 instead of a late enum 502.
 */
export function normalizeCampaignAssetType(value: unknown): CampaignAssetType | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v.length === 0) return null;
  if (CAMPAIGN_ASSET_TYPE_SET.has(v)) return v as CampaignAssetType;
  return CAMPAIGN_ASSET_TYPE_ALIASES[v] ?? null;
}

/**
 * The delivery channel each asset type is sent on.
 *
 * `promoteAssetToCampaign` — the path Arc uses to attach a draft to a campaign —
 * wrote `asset_type` and left `channel` null. That looks harmless, but the
 * dispatch enqueue keys off `channel`, NOT `asset_type`: `addressableChannel`
 * tests the channel string for /email|mail/, so a null channel took the
 * non-addressable branch and produced a dispatch with no recipient and no
 * subject. Every email Arc drafted was therefore unsendable, and the failure was
 * invisible — the campaign looked complete and the Outbox row looked real.
 *
 * Deriving it here keeps the two columns from disagreeing: an asset that calls
 * itself an email is now addressable as one.
 */
export const CAMPAIGN_ASSET_CHANNELS: Readonly<Record<CampaignAssetType, string>> = {
  email: "email",
  sms: "sms",
  landing_page: "web",
  one_pager: "doc",
  referral_packet: "doc",
  review_response: "web",
  google_business_post: "web",
  search_ad: "google_ads",
  social_ad: "meta_ad",
  display_ad: "meta_ad",
  // Creative prompts produce media that a paid channel later carries; they are
  // never addressable themselves.
  video_prompt: "media",
  image_prompt: "media",
  script: "media",
  other: "other",
};

/** The channel an asset of this type is delivered on. */
export function channelForAssetType(assetType: CampaignAssetType): string {
  return CAMPAIGN_ASSET_CHANNELS[assetType];
}
