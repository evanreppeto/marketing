import { describe, expect, it } from "vitest";

import { assembleGalleryCampaign } from "../read-model";

describe("assembleGalleryCampaign", () => {
  it("combines a live list item with its dispatch rows and result rows", () => {
    const item = {
      id: "c1", name: "Spring", persona: "Property Manager", href: "/campaigns/c1",
      thumbnailUrl: "http://x/img.png", assetTypes: ["Email", "Social Ad"], assetCount: 4, mediaCount: 2,
    };
    const out = assembleGalleryCampaign(
      item,
      [{ status: "sent" }, { status: "delivered" }],
      [{ impressions: 1000, clicks: 50, calls: 0, forms: 0, leads: 5, jobs: 1, won_revenue_cents: 200000, spend_cents: 50000 }],
    );
    expect(out).toMatchObject({ id: "c1", name: "Spring", href: "/campaigns/c1", thumbnailUrl: "http://x/img.png" });
    expect(out.dispatch).toMatchObject({ sent: 1, delivered: 1, total: 2 });
    expect(out.metrics).toMatchObject({ impressions: 1000, leads: 5, hasData: true, roi: 4 });
  });
});
