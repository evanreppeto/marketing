import { describe, expect, it } from "vitest";

import { acceptUpload, kindForContentType } from "./upload-policy";

describe("acceptUpload", () => {
  it("accepts a known image/video/pdf MIME type unchanged", () => {
    expect(acceptUpload("logo.png", "image/png")).toEqual({ ok: true, contentType: "image/png" });
    expect(acceptUpload("clip.mp4", "video/mp4")).toEqual({ ok: true, contentType: "video/mp4" });
    expect(acceptUpload("guide.pdf", "application/pdf")).toEqual({ ok: true, contentType: "application/pdf" });
  });

  it("accepts a .docx by its MIME type", () => {
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(acceptUpload("brand.docx", docx)).toEqual({ ok: true, contentType: docx });
  });

  it("accepts .md/.csv/.txt by extension when the browser sends no MIME type", () => {
    // Browsers routinely deliver these as "" or application/octet-stream.
    expect(acceptUpload("messaging-v3.md", "")).toEqual({ ok: true, contentType: "text/markdown" });
    expect(acceptUpload("audience.csv", "application/octet-stream")).toEqual({ ok: true, contentType: "text/csv" });
    expect(acceptUpload("notes.txt", "")).toEqual({ ok: true, contentType: "text/plain" });
  });

  it("accepts a .docx by extension when the browser mistypes it", () => {
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(acceptUpload("brand.docx", "application/octet-stream")).toEqual({ ok: true, contentType: docx });
  });

  it("prefers the real MIME type over the extension guess when both are present", () => {
    // A .csv the browser correctly typed keeps its given type, not the fallback.
    expect(acceptUpload("data.csv", "text/csv")).toEqual({ ok: true, contentType: "text/csv" });
  });

  it("is case-insensitive on the extension", () => {
    expect(acceptUpload("BRAND.DOCX", "")).toEqual({
      ok: true,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });

  it("rejects an unknown type with no recognized extension", () => {
    expect(acceptUpload("archive.zip", "application/zip")).toEqual({ ok: false });
    expect(acceptUpload("script.exe", "application/octet-stream")).toEqual({ ok: false });
  });
});

describe("kindForContentType", () => {
  it("maps by content-type family, defaulting non-image/video to document", () => {
    expect(kindForContentType("image/webp")).toBe("image");
    expect(kindForContentType("video/quicktime")).toBe("video");
    expect(kindForContentType("application/pdf")).toBe("document");
    expect(kindForContentType("text/markdown")).toBe("document");
  });
});
