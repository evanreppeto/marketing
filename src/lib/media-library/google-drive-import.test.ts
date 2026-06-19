import { describe, expect, it } from "vitest";

import { importGoogleDriveFiles } from "./google-drive-import";

describe("importGoogleDriveFiles", () => {
  it("copies Drive files into media assets with Drive provenance", async () => {
    const inserted: unknown[] = [];

    const result = await importGoogleDriveFiles({
      orgId: "org-1",
      folderId: "folder-1",
      fileIds: ["drive-file-1"],
      uploadedBy: "operator",
      accessToken: "ya29.access",
      downloader: async ({ fileId, accessToken }) => ({
        fileId,
        accessToken,
        name: "Storm Photos.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([7, 8, 9]),
        webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
        modifiedTime: "2026-06-18T12:00:00.000Z",
        size: 3,
      }),
      insert: async (input) => {
        inserted.push(input);
        return "asset-1";
      },
    });

    expect(result).toEqual({ imported: 1, skipped: 0, assetIds: ["asset-1"], errors: [] });
    expect(inserted).toEqual([
      expect.objectContaining({
        orgId: "org-1",
        folderId: "folder-1",
        fileName: "Storm Photos.pdf",
        contentType: "application/pdf",
        kind: "document",
        source: "google_drive",
        byteSize: 3,
        provenance: {
          googleDriveFileId: "drive-file-1",
          googleDriveWebUrl: "https://drive.google.com/file/d/drive-file-1/view",
          googleDriveModifiedTime: "2026-06-18T12:00:00.000Z",
        },
      }),
    ]);
  });
});
