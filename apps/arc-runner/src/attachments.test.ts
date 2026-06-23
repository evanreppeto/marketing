import { describe, expect, it } from "vitest";
import { buildTurnContent } from "./attachments";
import type { ArcAttachment } from "./types";

const img: ArcAttachment = { url: "https://gcs/x.png", objectPath: "a", contentType: "image/png", name: "x.png" };
const pdf: ArcAttachment = { url: "https://gcs/y.pdf", objectPath: "b", contentType: "application/pdf", name: "y.pdf" };

describe("buildTurnContent", () => {
  it("returns the plain string when there are no attachments", () => {
    expect(buildTurnContent("hello", [])).toBe("hello");
    expect(buildTurnContent("hello", undefined)).toBe("hello");
  });

  it("returns content blocks with the text first when attachments exist", () => {
    const content = buildTurnContent("look at these", [img, pdf]);
    expect(Array.isArray(content)).toBe(true);
    const blocks = content as Array<Record<string, unknown>>;
    expect(blocks[0]).toEqual({ type: "text", text: "look at these" });
  });

  it("maps an image to a url image block", () => {
    const blocks = buildTurnContent("x", [img]) as Array<Record<string, unknown>>;
    expect(blocks).toContainEqual({ type: "image", source: { type: "url", url: "https://gcs/x.png" } });
  });

  it("maps a pdf to a url document block", () => {
    const blocks = buildTurnContent("x", [pdf]) as Array<Record<string, unknown>>;
    expect(blocks).toContainEqual({
      type: "document",
      source: { type: "url", url: "https://gcs/y.pdf" },
      title: "y.pdf",
    });
  });

  it("drops unsupported types rather than emitting a broken block", () => {
    const vid: ArcAttachment = { url: "https://gcs/v.mp4", objectPath: "c", contentType: "video/mp4", name: "v.mp4" };
    const blocks = buildTurnContent("x", [vid, img]) as Array<Record<string, unknown>>;
    expect(blocks).toHaveLength(2); // text block + the one image
  });
});
