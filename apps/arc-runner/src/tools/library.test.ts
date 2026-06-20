import { describe, expect, it, vi } from "vitest";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { libraryDraftTools, libraryReadTools } from "./library";

describe("list_media", () => {
  it("is named list_media and GETs the media endpoint with filters", async () => {
    const apiGet = vi.fn(async () => ({ media: [{ id: "a1", fileName: "x.jpg" }] }));
    const client = { apiGet } as unknown as ArcClient;
    const step = vi.fn(async () => {});
    const [listMedia] = libraryReadTools(client, step);
    expect(listMedia.name).toBe("list_media");

    const handler = listMedia.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
    const out = await handler({ kind: "image", limit: 5 });

    expect(apiGet).toHaveBeenCalledWith("/api/v1/arc/media", { kind: "image", limit: 5 });
    expect(out.content[0].text).toContain("a1");
  });
});

describe("attach_media", () => {
  it("is named attach_media, POSTs the attach endpoint, and emits a draft card", async () => {
    const media = { kind: "image", url: "https://x/y.jpg", source: "bsr_real", sourceId: "a1" };
    const apiPost = vi.fn(async () => ({ campaignId: "c1", assetId: "as1", media }));
    const client = { apiPost } as unknown as ArcClient;
    const step = vi.fn(async () => {});
    const cards: ArcActionCard[] = [];
    const [attachMedia] = libraryDraftTools(client, step, (c) => cards.push(c));

    const handler = attachMedia.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
    const out = await handler({ library_asset_id: "a1", title: "Before/after", campaign_id: "c1" });

    expect(apiPost).toHaveBeenCalledWith(
      "/api/v1/arc/library/attach",
      expect.objectContaining({ library_asset_id: "a1", title: "Before/after", campaign_id: "c1" }),
    );
    expect(cards[0]).toMatchObject({
      kind: "draft",
      title: "Before/after",
      media,
      approval: { kind: "campaign", campaignId: "c1", assetId: "as1" },
    });
    expect(out.content[0].text).toContain("as1");
  });

  it("emits no card when the attach POST fails", async () => {
    const apiPost = vi.fn(async () => {
      throw new Error("not available");
    });
    const client = { apiPost } as unknown as ArcClient;
    const step = vi.fn(async () => {});
    const cards: ArcActionCard[] = [];
    const [attachMedia] = libraryDraftTools(client, step, (c) => cards.push(c));
    const handler = attachMedia.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
    const out = await handler({ library_asset_id: "a1", title: "T", campaign_id: "c1" });
    expect(cards).toHaveLength(0);
    expect(out.content[0].text).toContain("failed");
  });
});
