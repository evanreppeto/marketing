import { describe, expect, it } from "vitest";

import { buildFilesystemTree } from "./folder-tree-model";
import { type MediaAssetView, type MediaFolderView } from "@/lib/media-library/types";

const folders: MediaFolderView[] = [
  { id: "all", name: "All media", parentId: null, depth: 0, count: 4, directCount: 4, description: null },
  { id: "jobs", name: "[Demo] Job Photos", parentId: null, depth: 0, count: 3, directCount: 0, description: null },
  { id: "water", name: "[Demo] Water Damage", parentId: "jobs", depth: 1, count: 2, directCount: 0, description: null },
  { id: "before", name: "[Demo] Before", parentId: "water", depth: 2, count: 1, directCount: 1, description: null },
  { id: "brand", name: "[Demo] Brand Assets", parentId: null, depth: 0, count: 1, directCount: 1, description: null },
];

const asset = (overrides: Partial<MediaAssetView>): MediaAssetView => ({
  id: "asset",
  folderId: null,
  fileName: "asset.jpg",
  url: "https://example.com/asset.jpg",
  kind: "image",
  badge: "PHOTO",
  dimensions: "1200 x 800",
  size: "42 KB",
  source: "uploaded",
  tags: [],
  riskFlags: [],
  availableToArc: true,
  uploadedBy: null,
  usedInCount: 0,
  ...overrides,
});

describe("buildFilesystemTree", () => {
  it("nests folders and uploaded files under an all-media root", () => {
    const [root] = buildFilesystemTree({
      folders,
      assets: [
        asset({ id: "a-before", folderId: "before", fileName: "water-before-basement.jpg" }),
        asset({ id: "a-brand", folderId: "brand", fileName: "bsr-logo-reference.png", badge: "LOGO" }),
        asset({ id: "a-loose", folderId: null, fileName: "icon.png" }),
      ],
      activeFolderId: "all",
    });

    expect(root).toMatchObject({
      id: "folder:all",
      kind: "folder",
      name: "All media",
      count: 4,
      defaultOpen: true,
    });
    expect(root.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "folder:jobs", name: "[Demo] Job Photos", kind: "folder" }),
        expect.objectContaining({ id: "folder:brand", name: "[Demo] Brand Assets", kind: "folder" }),
        expect.objectContaining({ id: "asset:a-loose", name: "icon.png", kind: "file" }),
      ]),
    );
    expect(root.nodes?.[0].nodes?.[0].nodes?.[0].nodes).toEqual([
      expect.objectContaining({ id: "asset:a-before", name: "water-before-basement.jpg", kind: "file" }),
    ]);
  });

  it("opens the active folder path and assigns folder tones", () => {
    const [root] = buildFilesystemTree({
      folders,
      assets: [asset({ id: "a-before", folderId: "before", fileName: "water-before-basement.jpg" })],
      activeFolderId: "before",
    });

    const jobs = root.nodes?.find((node) => node.id === "folder:jobs");
    const water = jobs?.nodes?.find((node) => node.id === "folder:water");
    const before = water?.nodes?.find((node) => node.id === "folder:before");

    expect(jobs).toMatchObject({ defaultOpen: true, accent: "#60A5FA" });
    expect(water).toMatchObject({ defaultOpen: true, accent: "#38BDF8" });
    expect(before).toMatchObject({ defaultOpen: true, isActive: true, accent: "#F43F5E" });
  });
});
