import { describe, expect, it, vi } from "vitest";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { mediaTools } from "./media";

function setup(posts: Array<() => Promise<unknown>>) {
  const cards: ArcActionCard[] = [];
  let i = 0;
  const apiPost = vi.fn(async () => posts[i++]());
  const client = { apiPost } as unknown as ArcClient;
  const step = vi.fn(async () => {});
  const [genImage] = mediaTools(client, step, (c) => cards.push(c));
  const call = (args: Record<string, unknown>) =>
    (genImage.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>)(args);
  return { cards, apiPost, call, genImage };
}

describe("generate_image", () => {
  it("is named generate_image", () => {
    const { genImage } = setup([async () => ({})]);
    expect(genImage.name).toBe("generate_image");
  });

  it("generates, creates a draft asset, and emits a media+approval card", async () => {
    const media = { kind: "image", url: "https://x/y.png", source: "ai_generated", format: "1:1", model: "m", jobId: "j" };
    const { cards, apiPost, call } = setup([
      async () => ({ media }),
      async () => ({ campaignId: "c1", assetId: "a1" }),
    ]);
    const out = await call({ prompt: "blue gradient", title: "BG", name: "Brand", persona: "persona_landlord", restoration_focus: "water" });

    expect(apiPost).toHaveBeenNthCalledWith(1, "/api/v1/arc/media/generate-image", expect.objectContaining({ prompt: "blue gradient" }));
    expect(apiPost).toHaveBeenNthCalledWith(2, "/api/v1/arc/campaigns/draft-asset", expect.objectContaining({ media_url: "https://x/y.png", title: "BG" }));
    expect(cards[0]).toMatchObject({
      kind: "draft",
      title: "BG",
      media,
      approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
    });
    expect(out.content[0].text).toContain("a1");
  });

  it("emits no card when generation fails", async () => {
    const { cards, call } = setup([
      async () => {
        throw new Error("quota");
      },
    ]);
    const out = await call({ prompt: "x", title: "T", campaign_id: "c1" });
    expect(cards).toHaveLength(0);
    expect(out.content[0].text).toContain("failed");
  });
});
