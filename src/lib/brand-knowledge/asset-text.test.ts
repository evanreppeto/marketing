import { describe, expect, it } from "vitest";

import { extractAssetText, isTextLikeContentType } from "./asset-text";

const enc = (s: string) => new TextEncoder().encode(s);

describe("isTextLikeContentType", () => {
  it("recognizes text types", () => {
    expect(isTextLikeContentType("text/plain")).toBe(true);
    expect(isTextLikeContentType("text/markdown")).toBe(true);
    expect(isTextLikeContentType("text/csv")).toBe(true);
  });
  it("rejects pdf and images", () => {
    expect(isTextLikeContentType("application/pdf")).toBe(false);
    expect(isTextLikeContentType("image/png")).toBe(false);
  });
});

describe("extractAssetText", () => {
  it("decodes plain text / markdown / csv", async () => {
    const out = await extractAssetText({ bytes: enc("Hello brand"), contentType: "text/plain", fileName: "a.txt" });
    expect(out).toBe("Hello brand");
  });

  it("returns null for pdf and images (Gemini reads those inline)", async () => {
    expect(await extractAssetText({ bytes: enc("%PDF"), contentType: "application/pdf", fileName: "a.pdf" })).toBeNull();
    expect(await extractAssetText({ bytes: enc("x"), contentType: "image/png", fileName: "a.png" })).toBeNull();
  });

  it("returns null (never throws) on corrupt docx", async () => {
    const out = await extractAssetText({
      bytes: enc("not a real docx"),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "broken.docx",
    });
    expect(out).toBeNull();
  });

  it("returns null for empty/whitespace text", async () => {
    expect(await extractAssetText({ bytes: enc("   "), contentType: "text/plain", fileName: "a.txt" })).toBeNull();
  });
});
