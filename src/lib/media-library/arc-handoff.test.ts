import { describe, expect, it } from "vitest";

import { toArcAttachments, toArcMediaSummary, toArcFolderSummaries } from "./arc-handoff";

describe("toArcAttachments", () => {
  it("maps library assets to ArcAttachment shape using the public URL", () => {
    const out = toArcAttachments([
      { public_url: "https://x/a.jpg", storage_path: "library/o/a.jpg", content_type: "image/jpeg", file_name: "a.jpg" },
    ]);
    expect(out).toEqual([
      { url: "https://x/a.jpg", objectPath: "library/o/a.jpg", contentType: "image/jpeg", name: "a.jpg" },
    ]);
  });
});

describe("toArcMediaSummary", () => {
  it("includes folderId and resolved folderName", () => {
    const rows = [
      { id: "a1", file_name: "x.jpg", public_url: "u", storage_path: "p", kind: "image", width: 10, height: 20, tags: ["t"], risk_flags: [], folder_id: "f1" },
      { id: "a2", file_name: "y.jpg", public_url: "u2", storage_path: "p2", kind: "image", width: null, height: null, tags: null, risk_flags: null, folder_id: null },
    ];
    const out = toArcMediaSummary(rows, new Map([["f1", "Logos & Brand"]]));
    expect(out[0]).toMatchObject({ id: "a1", folderId: "f1", folderName: "Logos & Brand", dimensions: "10 × 20" });
    expect(out[1]).toMatchObject({ id: "a2", folderId: null, folderName: null });
  });
});

describe("toArcFolderSummaries", () => {
  it("returns every folder with available-only counts", () => {
    const folders = [
      { id: "f1", name: "Logos & Brand", description: "Brand marks", parent_id: null },
      { id: "f2", name: "Team", description: null, parent_id: null },
    ];
    const out = toArcFolderSummaries(folders, ["f1", "f1", null, "f1"]);
    expect(out).toEqual([
      { id: "f1", name: "Logos & Brand", description: "Brand marks", parentId: null, availableAssetCount: 3 },
      { id: "f2", name: "Team", description: null, parentId: null, availableAssetCount: 0 },
    ]);
  });
});
