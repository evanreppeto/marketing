import { describe, expect, it } from "vitest";

import { downloadGoogleDriveFile, parseGoogleDriveFileIds } from "./drive-client";

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
