import { describe, expect, it, vi } from "vitest";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { libraryReadTools, libraryDraftTools, libraryWriteTools } from "./library";

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

describe("list_media folder filter", () => {
  it("forwards folder_id to the media endpoint", async () => {
    const apiGet = vi.fn(async () => ({ media: [] }));
    const client = { apiGet } as unknown as ArcClient;
    const [listMedia] = libraryReadTools(client, vi.fn(async () => {}));
    const handler = listMedia.handler as (a: Record<string, unknown>, e?: unknown) => Promise<unknown>;
    await handler({ folder_id: "f1", limit: 10 });
    expect(apiGet).toHaveBeenCalledWith("/api/v1/arc/media", { kind: undefined, folder_id: "f1", limit: 10 });
  });
});

describe("list_folders", () => {
  it("is named list_folders and GETs the folders endpoint", async () => {
    const apiGet = vi.fn(async () => ({ folders: [{ id: "f1", name: "Logos & Brand" }] }));
    const client = { apiGet } as unknown as ArcClient;
    const tools = libraryReadTools(client, vi.fn(async () => {}));
    const listFolders = tools.find((t) => t.name === "list_folders")!;
    expect(listFolders).toBeDefined();
    const handler = listFolders.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ text: string }> }>;
    const out = await handler({});
    expect(apiGet).toHaveBeenCalledWith("/api/v1/arc/folders", {});
    expect(out.content[0].text).toContain("f1");
  });
});

describe("create_folder + file_asset", () => {
  it("create_folder POSTs the create_folder action", async () => {
    const apiPost = vi.fn(async () => ({ action: "create_folder", folder_id: "f9" }));
    const client = { apiPost } as unknown as ArcClient;
    const [createFolder] = libraryWriteTools(client, vi.fn(async () => {}));
    expect(createFolder.name).toBe("create_folder");
    const handler = createFolder.handler as (a: Record<string, unknown>, e?: unknown) => Promise<unknown>;
    await handler({ name: "Proof", description: "Before/after" });
    expect(apiPost).toHaveBeenCalledWith("/api/v1/arc/media", {
      action: "create_folder", name: "Proof", description: "Before/after", parent_id: undefined,
    });
  });

  it("file_asset POSTs the file_asset action (null folder for root)", async () => {
    const apiPost = vi.fn(async () => ({ action: "file_asset", asset_id: "a1" }));
    const client = { apiPost } as unknown as ArcClient;
    const tools = libraryWriteTools(client, vi.fn(async () => {}));
    const fileAsset = tools.find((t) => t.name === "file_asset")!;
    const handler = fileAsset.handler as (a: Record<string, unknown>, e?: unknown) => Promise<unknown>;
    await handler({ asset_id: "a1" });
    expect(apiPost).toHaveBeenCalledWith("/api/v1/arc/media", { action: "file_asset", asset_id: "a1", folder_id: null });
  });
});
