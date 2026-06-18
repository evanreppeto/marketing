import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      async () => ({ media, objectPath: "arc-generated/y.png" }),
      async () => ({ campaignId: "c1", assetId: "a1" }),
    ]);
    const out = await call({ prompt: "blue gradient", title: "BG", name: "Brand", persona: "persona_landlord", restoration_focus: "water" });

    expect(apiPost).toHaveBeenNthCalledWith(1, "/api/v1/arc/media/generate-image", expect.objectContaining({ prompt: "blue gradient" }));
    expect(apiPost).toHaveBeenNthCalledWith(
      2,
      "/api/v1/arc/campaigns/draft-asset",
      expect.objectContaining({ media_url: "https://x/y.png", media_path: "arc-generated/y.png", title: "BG" }),
    );
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

  it("forwards the turn's level on the generate-image POST when ctx provides it", async () => {
    const media = { kind: "image", url: "https://x/y.png", source: "ai_generated", format: "1:1", model: "m" };
    const posts: Array<() => Promise<unknown>> = [
      async () => ({ media, objectPath: "arc-generated/y.png" }),
      async () => ({ campaignId: "c1", assetId: "a1" }),
    ];
    let i = 0;
    const apiPost = vi.fn(async () => posts[i++]());
    const client = { apiPost } as unknown as ArcClient;
    const step = vi.fn(async () => {});
    const [genImage] = mediaTools(client, step, () => {}, { level: "standard" });
    const handler = genImage.handler as (
      a: Record<string, unknown>,
      e?: unknown,
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
    await handler({ prompt: "blue gradient", title: "BG", campaign_id: "c1" });
    expect(apiPost).toHaveBeenNthCalledWith(
      1,
      "/api/v1/arc/media/generate-image",
      expect.objectContaining({ level: "standard" }),
    );
  });
});

function setupVideo(posts: Array<() => Promise<unknown>>) {
  const cards: ArcActionCard[] = [];
  let i = 0;
  const apiPost = vi.fn(async () => posts[i++]());
  const client = { apiPost } as unknown as ArcClient;
  const step = vi.fn(async () => {});
  const [, genVideo] = mediaTools(client, step, (c) => cards.push(c));
  const call = (args: Record<string, unknown>) =>
    (genVideo.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>)(args);
  return { cards, apiPost, call, genVideo };
}

describe("generate_video", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is named generate_video", () => {
    const { genVideo } = setupVideo([async () => ({})]);
    expect(genVideo.name).toBe("generate_video");
  });

  it("generates a video, creates a draft asset, emits a video card", async () => {
    const media = { kind: "video", url: "https://x/v.mp4", source: "ai_generated", model: "veo" };
    const { cards, apiPost, call } = setupVideo([
      async () => ({ operationName: "op/1", model: "veo-2.0-generate-001" }), // start
      async () => ({ status: "running" }), // poll 1
      async () => ({ status: "done", media, objectPath: "arc-generated/v.mp4" }), // poll 2
      async () => ({ campaignId: "c1", assetId: "a1" }), // draft-asset
    ]);
    const p = call({
      prompt: "flood cleanup b-roll",
      title: "Clip",
      name: "X",
      persona: "persona_landlord",
      restoration_focus: "water",
    });
    await vi.runAllTimersAsync();
    const out = await p;

    expect(apiPost).toHaveBeenNthCalledWith(
      1,
      "/api/v1/arc/media/generate-video",
      expect.objectContaining({ prompt: expect.stringContaining("flood cleanup b-roll") }),
    );
    expect(apiPost).toHaveBeenNthCalledWith(
      4,
      "/api/v1/arc/campaigns/draft-asset",
      expect.objectContaining({
        media_url: "https://x/v.mp4",
        media_path: "arc-generated/v.mp4",
        asset_type: "video_ad",
        title: "Clip",
      }),
    );
    expect(cards[0]).toMatchObject({
      kind: "draft",
      media: { kind: "video", format: "16:9" },
      approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
    });
    expect(out.content[0].text).toContain("a1");
  });

  it("times out and emits no card when Veo never finishes", async () => {
    const posts: Array<() => Promise<unknown>> = [
      async () => ({ operationName: "op/1", model: "veo" }), // start
    ];
    for (let i = 0; i < 36; i++) posts.push(async () => ({ status: "running" })); // every poll still running
    const { cards, call } = setupVideo(posts);
    const p = call({ prompt: "x", title: "T", campaign_id: "c1" });
    await vi.runAllTimersAsync();
    const out = await p;

    expect(cards).toHaveLength(0);
    expect(out.content[0].text).toContain("timed out");
  });

  it("emits no card when start fails", async () => {
    const { cards, call } = setupVideo([
      async () => {
        throw new Error("quota");
      },
    ]);
    const p = call({ prompt: "x", title: "T", campaign_id: "c1" });
    await vi.runAllTimersAsync();
    const out = await p;
    expect(cards).toHaveLength(0);
    expect(out.content[0].text).toContain("failed");
  });

  it("forwards the turn's level on the start POST when ctx provides it", async () => {
    const apiPost = vi.fn(async () => ({ operationName: "op/1", model: "veo" }));
    const client = { apiPost } as unknown as ArcClient;
    const step = vi.fn(async () => {});
    const [, genVideo] = mediaTools(client, step, () => {}, { level: "standard" });
    const handler = genVideo.handler as (
      a: Record<string, unknown>,
      e?: unknown,
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
    // Times out (only the start resolves), but the start body is all we assert.
    const p = handler({ prompt: "x", title: "T", campaign_id: "c1" });
    await vi.runAllTimersAsync();
    await p;
    expect(apiPost).toHaveBeenNthCalledWith(
      1,
      "/api/v1/arc/media/generate-video",
      expect.objectContaining({ level: "standard" }),
    );
  });
});
