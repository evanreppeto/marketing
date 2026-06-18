import { describe, expect, it } from "vitest";

import { toArcAttachments } from "./arc-handoff";

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
