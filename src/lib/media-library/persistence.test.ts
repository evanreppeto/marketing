import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { buildStoragePath, createFolder, insertAsset, insertAssetWithUrl, sanitizeFileName } from "./persistence";

describe("sanitizeFileName", () => {
  it("strips path separators and unsafe chars", () => {
    expect(sanitizeFileName("../../etc/p w!d.jpg")).toBe("p-w-d.jpg");
    expect(sanitizeFileName("photo.PNG")).toBe("photo.PNG");
  });
});

describe("buildStoragePath", () => {
  it("namespaces by org and asset id", () => {
    expect(buildStoragePath("org1", "asset1", "before.jpg")).toBe("library/org1/asset1-before.jpg");
  });
});

describe("createFolder", () => {
  it("persists a parent folder when creating a subfolder", async () => {
    const supabase = createSupabaseQueryMock({
      media_folders: { data: { id: "folder-2" }, error: null },
    });

    await createFolder({
      orgId: "org-1",
      name: "After photos",
      parentId: "folder-1",
      client: supabase,
    });

    expect(supabase.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        org_id: "org-1",
        name: "After photos",
        parent_id: "folder-1",
      }),
    ]);
  });
});

describe("insertAsset", () => {
  it("persists source provenance for imported Google Drive files", async () => {
    const supabase = createSupabaseQueryMock({
      media_assets: [
        { data: { id: "asset-1" }, error: null },
        { data: null, error: null },
      ],
    });
    const uploaded: Array<{ path: string; contentType: string; bytes: Uint8Array }> = [];

    await insertAsset({
      orgId: "org-1",
      folderId: null,
      fileName: "Capabilities.pdf",
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      kind: "document",
      byteSize: 3,
      source: "google_drive",
      provenance: {
        googleDriveFileId: "file-123",
        googleDriveWebUrl: "https://drive.google.com/file/d/file-123/view",
      },
      uploadedBy: "operator",
      client: supabase,
      uploader: async (path, bytes, contentType) => {
        uploaded.push({ path, bytes, contentType });
        return `https://cdn.example/${path}`;
      },
    });

    expect(uploaded).toEqual([
      {
        path: "library/org-1/asset-1-Capabilities.pdf",
        bytes: new Uint8Array([1, 2, 3]),
        contentType: "application/pdf",
      },
    ]);
    expect(supabase.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        source: "google_drive",
        provenance: {
          googleDriveFileId: "file-123",
          googleDriveWebUrl: "https://drive.google.com/file/d/file-123/view",
        },
      }),
    ]);
  });

  it("can return the uploaded public URL for brand profile assets", async () => {
    const supabase = createSupabaseQueryMock({
      media_assets: [
        { data: { id: "asset-logo" }, error: null },
        { data: null, error: null },
      ],
    });

    const result = await insertAssetWithUrl({
      orgId: "org-1",
      folderId: null,
      fileName: "logo.png",
      bytes: new Uint8Array([4, 5, 6]),
      contentType: "image/png",
      kind: "image",
      byteSize: 3,
      source: "uploaded",
      provenance: { brandRole: "logo" },
      uploadedBy: "operator",
      client: supabase,
      uploader: async (path) => `https://cdn.example/${path}`,
    });

    expect(result).toEqual({
      id: "asset-logo",
      url: "https://cdn.example/library/org-1/asset-logo-logo.png",
    });
  });
});
