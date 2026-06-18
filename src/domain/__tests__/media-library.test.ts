import { describe, expect, it } from "vitest";

import { classifyKind, formatByteSize, validateUpload, MAX_UPLOAD_BYTES } from "../media-library";

describe("classifyKind", () => {
  it("classifies images, video, and svg logos", () => {
    expect(classifyKind("image/png", "before.png")).toBe("image");
    expect(classifyKind("image/jpeg", "site.jpg")).toBe("image");
    expect(classifyKind("video/mp4", "flyover.mp4")).toBe("video");
    expect(classifyKind("image/svg+xml", "logo.svg")).toBe("logo");
    expect(classifyKind("application/pdf", "one-pager.pdf")).toBe("document");
  });
});

describe("validateUpload", () => {
  it("accepts a normal image", () => {
    expect(validateUpload({ contentType: "image/png", byteSize: 1_000_000 })).toEqual({ ok: true });
  });
  it("rejects an unsupported type", () => {
    const r = validateUpload({ contentType: "text/html", byteSize: 10 });
    expect(r.ok).toBe(false);
  });
  it("rejects oversize files", () => {
    const r = validateUpload({ contentType: "image/png", byteSize: MAX_UPLOAD_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
});

describe("formatByteSize", () => {
  it("formats bytes to human units", () => {
    expect(formatByteSize(2_100_000)).toBe("2.1 MB");
    expect(formatByteSize(14_000_000)).toBe("14 MB");
    expect(formatByteSize(900)).toBe("900 B");
  });
});
