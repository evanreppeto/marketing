import { type Database } from "@/lib/supabase/database.types";

type RestorationFocus = Database["public"]["Enums"]["restoration_focus"];
type CampaignAssetType = Database["public"]["Enums"]["campaign_asset_type"];

/**
 * Runtime mirrors of the Postgres enums `restoration_focus` and
 * `campaign_asset_type`. The `satisfies` clause makes `tsc` fail if these drift
 * from the generated DB types, keeping the app-layer guard in sync with the
 * migration. Validate against these at the route boundary so an out-of-enum
 * value from Arc returns a clean 400 instead of a late Postgres 502 on insert.
 */
export const RESTORATION_FOCUS_VALUES = [
  "flood",
  "water_backup",
  "burst_pipe",
  "storm_surge",
  "standing_water",
  "mold",
  "sewage",
  "fire",
] as const satisfies readonly RestorationFocus[];

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
] as const satisfies readonly CampaignAssetType[];

export function isRestorationFocus(value: string): value is RestorationFocus {
  return (RESTORATION_FOCUS_VALUES as readonly string[]).includes(value);
}

export function isCampaignAssetType(value: string): value is CampaignAssetType {
  return (CAMPAIGN_ASSET_TYPE_VALUES as readonly string[]).includes(value);
}
