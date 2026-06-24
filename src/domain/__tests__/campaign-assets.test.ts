import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_ASSET_TYPE_VALUES,
  isCampaignAssetType,
  normalizeCampaignAssetType,
  normalizeRestorationFocus,
} from "@/domain";
import type { Database } from "@/lib/supabase/database.types";

describe("normalizeCampaignAssetType", () => {
  it("passes through valid enum values unchanged", () => {
    expect(normalizeCampaignAssetType("social_ad")).toBe("social_ad");
    expect(normalizeCampaignAssetType("video_prompt")).toBe("video_prompt");
    expect(normalizeCampaignAssetType("image_prompt")).toBe("image_prompt");
  });

  it("maps the agent's common aliases to real enum values (prevents late 502s)", () => {
    expect(normalizeCampaignAssetType("video_ad")).toBe("video_prompt");
    expect(normalizeCampaignAssetType("video")).toBe("video_prompt");
    expect(normalizeCampaignAssetType("image")).toBe("image_prompt");
    expect(normalizeCampaignAssetType("text")).toBe("sms");
  });

  it("is case- and whitespace-tolerant", () => {
    expect(normalizeCampaignAssetType("  Social_Ad ")).toBe("social_ad");
  });

  it("returns null for unknown / empty / non-string values", () => {
    expect(normalizeCampaignAssetType("banana")).toBeNull();
    expect(normalizeCampaignAssetType("")).toBeNull();
    expect(normalizeCampaignAssetType(undefined)).toBeNull();
    expect(normalizeCampaignAssetType(42)).toBeNull();
  });

  it("isCampaignAssetType only accepts exact enum members", () => {
    expect(isCampaignAssetType("social_ad")).toBe(true);
    expect(isCampaignAssetType("video_ad")).toBe(false);
  });

  it("stays in sync with the generated DB enum (drift guard)", () => {
    // Type-level: this assignment fails typecheck if our list drifts from the enum.
    const fromDb: ReadonlyArray<Database["public"]["Enums"]["campaign_asset_type"]> =
      CAMPAIGN_ASSET_TYPE_VALUES;
    expect(fromDb).toHaveLength(14);
  });
});

describe("normalizeRestorationFocus", () => {
  it("passes through valid enum values unchanged", () => {
    expect(normalizeRestorationFocus("flood")).toBe("flood");
    expect(normalizeRestorationFocus("water_backup")).toBe("water_backup");
  });

  it("maps the tool-suggested aliases water/storm to real enum values", () => {
    expect(normalizeRestorationFocus("water")).toBe("water_backup");
    expect(normalizeRestorationFocus("storm")).toBe("storm_surge");
  });

  it("returns null for unknown / non-string values", () => {
    expect(normalizeRestorationFocus("lava")).toBeNull();
    expect(normalizeRestorationFocus(undefined)).toBeNull();
  });
});
