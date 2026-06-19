import { describe, expect, it } from "vitest";

import { parseGoogleDriveFileIds } from "./drive-client";

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
