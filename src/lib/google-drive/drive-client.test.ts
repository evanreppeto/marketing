import { describe, expect, it } from "vitest";

import {
  downloadGoogleDriveFile,
  listGoogleDriveFolderFileIds,
  parseGoogleDriveFileIds,
  parseGoogleDriveFolderIds,
} from "./drive-client";

describe("parseGoogleDriveFileIds", () => {
  it("extracts file ids from common Drive URLs and raw ids", () => {
    expect(
      parseGoogleDriveFileIds(`
        https://drive.google.com/file/d/1AbC-Drive_File123/view?usp=sharing
        https://docs.google.com/document/d/2DocId_456/edit
        https://drive.google.com/open?id=3OpenId789
        4Raw_Id-xyz
      `),
    ).toEqual(["1AbC-Drive_File123", "2DocId_456", "3OpenId789", "4Raw_Id-xyz"]);
  });

  it("dedupes repeated ids and ignores unrelated text", () => {
    expect(
      parseGoogleDriveFileIds(`
        Here are the files:
        https://drive.google.com/file/d/abc123XYZ_-/view
        abc123XYZ_-
        not-a-drive-link
      `),
    ).toEqual(["abc123XYZ_-"]);
  });
});

describe("parseGoogleDriveFolderIds", () => {
  it("extracts folder ids from Drive folder URLs and raw ids", () => {
    expect(
      parseGoogleDriveFolderIds(`
        https://drive.google.com/drive/folders/1Folder_ABC-123?usp=sharing
        https://drive.google.com/drive/u/0/folders/2NestedFolder_456
        3Raw_Folder789
      `),
    ).toEqual(["1Folder_ABC-123", "2NestedFolder_456", "3Raw_Folder789"]);
  });
});

describe("listGoogleDriveFolderFileIds", () => {
  it("expands folder contents recursively and skips subfolder ids", async () => {
    const requestedUrls: string[] = [];
    const fetcher: typeof fetch = async (url) => {
      requestedUrls.push(String(url));
      const decoded = decodeURIComponent(String(url));
      if (decoded.includes("folder-root")) {
        return new Response(
          JSON.stringify({
            files: [
              { id: "file-a", name: "a.jpg", mimeType: "image/jpeg" },
              { id: "folder-child", name: "child", mimeType: "application/vnd.google-apps.folder" },
            ],
          }),
          { status: 200 },
        );
      }
      if (decoded.includes("folder-child")) {
        return new Response(
          JSON.stringify({
            files: [{ id: "file-b", name: "b.pdf", mimeType: "application/pdf" }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    };

    const result = await listGoogleDriveFolderFileIds({
      folderIds: ["folder-root"],
      accessToken: "token",
      fetcher,
    });

    expect(result).toMatchObject({
      fileIds: ["file-a", "file-b"],
      scannedFolders: 2,
      skippedFolders: 0,
      truncated: false,
      errors: [],
    });
    expect(requestedUrls.length).toBe(2);
  });

  it("caps folder expansion to protect imports from huge Drive trees", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          files: [
            { id: "file-a", name: "a.jpg", mimeType: "image/jpeg" },
            { id: "file-b", name: "b.jpg", mimeType: "image/jpeg" },
          ],
        }),
        { status: 200 },
      );

    const result = await listGoogleDriveFolderFileIds({
      folderIds: ["folder-root"],
      accessToken: "token",
      maxFiles: 1,
      fetcher,
    });

    expect(result.fileIds).toEqual(["file-a"]);
    expect(result.truncated).toBe(true);
  });
});

describe("downloadGoogleDriveFile", () => {
  it("exports Google Docs as PDF and captures readable plain text", async () => {
    const urls: string[] = [];
    const fetcher: typeof fetch = async (url) => {
      urls.push(String(url));
      if (String(url).includes("/export") && String(url).includes("text%2Fplain")) {
        return new Response("Brand voice: clear and confident.", { status: 200 });
      }
      if (String(url).includes("/export")) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: "doc-1",
          name: "Brand Guidelines",
          mimeType: "application/vnd.google-apps.document",
          webViewLink: "https://docs.google.com/document/d/doc-1/edit",
          modifiedTime: "2026-06-18T12:00:00.000Z",
        }),
        { status: 200 },
      );
    };

    const file = await downloadGoogleDriveFile({ fileId: "doc-1", accessToken: "token", fetcher });

    expect(file.name).toBe("Brand Guidelines.pdf");
    expect(file.mimeType).toBe("application/pdf");
    expect(file.plainText).toBe("Brand voice: clear and confident.");
    expect(urls.some((url) => url.includes("mimeType=text%2Fplain"))).toBe(true);
  });
});
