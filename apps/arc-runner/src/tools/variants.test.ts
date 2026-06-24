import { describe, expect, it, vi } from "vitest";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { variantsTools } from "./variants";

const client = {
  apiPost: vi.fn(async () => ({
    campaignId: "c1",
    submitted: [{ assetId: "a1", title: "B" }],
    ranked: { rationale: "Top pick scores 71/100 with a solid hook (80/100).", topK: [{ title: "B" }] },
  })),
} as unknown as ArcClient;
const step = vi.fn(async () => {});

describe("submit_ad_variants", () => {
  it("posts the batch and returns the rationale", async () => {
    const cards: ArcActionCard[] = [];
    const [submit] = variantsTools(client, step, (c) => cards.push(c), {});
    expect(submit.name).toBe("submit_ad_variants");
    const handler = submit.handler as (
      a: Record<string, unknown>,
      e?: unknown,
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
    const result = await handler(
      {
        campaign_id: "c1",
        asset_type: "video_ad",
        top_k: 1,
        variants: [
          { title: "A", media_url: "https://x/a.mp4" },
          { title: "B", media_url: "https://x/b.mp4" },
        ],
      },
      {} as never,
    );
    expect(client.apiPost).toHaveBeenCalledWith(
      "/api/v1/arc/campaigns/submit-variants",
      expect.objectContaining({ asset_type: "video_ad" }),
    );
    expect(JSON.stringify(result)).toContain("solid hook");
    expect(cards).toHaveLength(1);
  });
});
