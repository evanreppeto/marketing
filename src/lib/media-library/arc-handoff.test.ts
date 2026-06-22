import { describe, expect, it } from "vitest";

import { toArcAttachments, toArcMediaSummary } from "./arc-handoff";

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
  it("maps DB rows to compact Arc summaries with safe defaults", () => {
    const out = toArcMediaSummary([
      {
        id: "a1",
        file_name: "before-after.jpg",
        public_url: "https://x/before-after.jpg",
        storage_path: "library/org1/a1-before-after.jpg",
        kind: "image",
        width: 1200,
        height: 800,
        tags: ["fire", "before-after"],
        risk_flags: [],
      },
      {
        id: "a2",
        file_name: "logo.png",
        public_url: "https://x/logo.png",
        storage_path: "library/org1/a2-logo.png",
        kind: "logo",
        width: null,
        height: null,
        tags: null as unknown as string[],
        risk_flags: null as unknown as string[],
      },
    ]);

    expect(out).toEqual([
      {
        id: "a1",
        fileName: "before-after.jpg",
        url: "https://x/before-after.jpg",
        kind: "image",
        dimensions: "1200 × 800",
        tags: ["fire", "before-after"],
        riskFlags: [],
      },
      {
        id: "a2",
        fileName: "logo.png",
        url: "https://x/logo.png",
        kind: "logo",
        dimensions: null,
        tags: [],
        riskFlags: [],
      },
    ]);
  });
});
