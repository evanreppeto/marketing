import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { runArcPartnerCampaign } from "./orchestrator";

type InsertArg = {
  channel?: string;
  asset_type?: string;
  dispatch_locked?: boolean;
  audit_payload?: { media_assets?: Array<{ url: string }> };
};

describe("runArcPartnerCampaign creativeAssets", () => {
  it("persists each creative as a campaign_asset carrying media_assets, dispatch locked", async () => {
    const supabase = createSupabaseQueryMock({});

    await runArcPartnerCampaign(
      {
        creativeAssets: [
          { type: "image", url: "https://cdn.example/hero.png", title: "Hero" },
          { type: "video", url: "https://cdn.example/spot.mp4" },
        ],
      },
      supabase,
    );

    const inserts = supabase.calls.filter(([method]) => method === "insert").map(([, arg]) => arg as InsertArg);
    const creativeInserts = inserts.filter((arg) => Array.isArray(arg.audit_payload?.media_assets));

    const mediaUrls = creativeInserts.flatMap((arg) => arg.audit_payload!.media_assets!.map((media) => media.url));
    expect(mediaUrls).toEqual(
      expect.arrayContaining(["https://cdn.example/hero.png", "https://cdn.example/spot.mp4"]),
    );

    const image = creativeInserts.find((arg) => arg.channel === "image");
    const video = creativeInserts.find((arg) => arg.channel === "video");
    expect(image?.asset_type).toBe("image_prompt");
    expect(video?.asset_type).toBe("video_prompt");

    // every creative is dispatch-locked, and nothing in the run unlocks outbound
    for (const arg of inserts) {
      expect(arg).not.toHaveProperty("dispatch_locked", false);
    }
    expect(image?.dispatch_locked).toBe(true);
  });
});
