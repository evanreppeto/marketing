import { describe, expect, it } from "vitest";

import { countUsage, toAssetView } from "./read-model";
import { type MediaAssetRow } from "./types";

const row = (over: Partial<MediaAssetRow> = {}): MediaAssetRow => ({
  id: "a1", folder_id: null, file_name: "before.jpg", storage_path: "library/o/a1-before.jpg",
  public_url: "https://x/before.jpg", content_type: "image/jpeg", kind: "image",
  width: 3024, height: 4032, byte_size: 2_100_000, duration_seconds: null,
  source: "uploaded", provenance: {}, risk_flags: [], tags: ["before-after"],
  available_to_arc: true, uploaded_by: "Evan", created_at: "2026-06-14T00:00:00Z", ...over,
});

describe("toAssetView", () => {
  it("maps a photo row, deriving badge/dimensions/size", () => {
    const v = toAssetView(row(), 2);
    expect(v.badge).toBe("PHOTO");
    expect(v.dimensions).toBe("3024 × 4032");
    expect(v.size).toBe("2.1 MB");
    expect(v.usedInCount).toBe(2);
  });
  it("labels AI-sourced assets with the AI badge", () => {
    expect(toAssetView(row({ source: "ai_generated" }), 0).badge).toBe("AI");
  });
  it("labels logos and video", () => {
    expect(toAssetView(row({ kind: "logo" }), 0).badge).toBe("LOGO");
    expect(toAssetView(row({ kind: "video", content_type: "video/mp4" }), 0).badge).toBe("VIDEO");
  });
});

describe("countUsage", () => {
  const assets = [
    { id: "a1", storage_path: "library/o/a1.jpg", public_url: "https://x/a1.jpg" },
    { id: "a2", storage_path: "library/o/a2.jpg", public_url: "https://x/a2.jpg" },
  ];

  it("counts an entry once even when it matches on both path and url", () => {
    const counts = countUsage(assets, [{ path: "library/o/a1.jpg", url: "https://x/a1.jpg" }]);
    expect(counts.get("a1")).toBe(1);
    expect(counts.get("a2")).toBe(0);
  });

  it("counts multiple distinct entries and matches by library_asset_id", () => {
    const counts = countUsage(assets, [
      { library_asset_id: "a2" },
      { url: "https://x/a2.jpg" },
      { path: "nope" },
    ]);
    expect(counts.get("a2")).toBe(2);
    expect(counts.get("a1")).toBe(0);
  });
});
