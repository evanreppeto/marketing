import { describe, expect, it } from "vitest";

import { parseHermesPartnerCampaignRequest } from "./contracts";

describe("parseHermesPartnerCampaignRequest creativeAssets", () => {
  it("defaults creativeAssets to an empty array", () => {
    const request = parseHermesPartnerCampaignRequest({});
    expect(request.creativeAssets).toEqual([]);
  });

  it("accepts creative assets and applies the default type", () => {
    const request = parseHermesPartnerCampaignRequest({
      creativeAssets: [
        { url: "https://cdn.example/hero.png" },
        { type: "video", url: "https://cdn.example/spot.mp4", title: "Hero spot" },
      ],
    });

    expect(request.creativeAssets).toHaveLength(2);
    expect(request.creativeAssets[0]).toMatchObject({ type: "image", url: "https://cdn.example/hero.png" });
    expect(request.creativeAssets[1]).toMatchObject({ type: "video", title: "Hero spot" });
  });

  it("rejects a creative asset with an invalid url", () => {
    expect(() =>
      parseHermesPartnerCampaignRequest({ creativeAssets: [{ type: "image", url: "not-a-url" }] }),
    ).toThrow();
  });
});
