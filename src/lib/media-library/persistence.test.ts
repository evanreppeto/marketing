import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { buildStoragePath, insertAsset, sanitizeFileName } from "./persistence";

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
});
