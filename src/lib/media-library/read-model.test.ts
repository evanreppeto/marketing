import { describe, expect, it } from "vitest";

import { toAssetView } from "./read-model";
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
