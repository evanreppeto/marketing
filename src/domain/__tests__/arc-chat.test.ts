import { describe, expect, it } from "vitest";

import {
  ArcMessageError,
  deriveThreadTitle,
  parseMedia,
  parseMentions,
  serializeMentions,
  validateArcMessageInput,
  type ArcMention,
} from "../arc-chat";

const mention: ArcMention = { type: "campaign", id: "c1", label: "Roof storm push", href: "/campaigns/c1" };

describe("parseMedia", () => {
  it("keeps valid image/video items with their optional fields", () => {
    const out = parseMedia([
      { kind: "image", url: "https://x/a.png", caption: "Hero", alt: "alt" },
      { kind: "video", url: "https://x/b.mp4", poster: "https://x/p.jpg" },
    ]);
    expect(out).toEqual([
      { kind: "image", url: "https://x/a.png", caption: "Hero", alt: "alt" },
      { kind: "video", url: "https://x/b.mp4", poster: "https://x/p.jpg" },
    ]);
  });
  it("parses a JSON string", () => {
    expect(parseMedia(JSON.stringify([{ kind: "image", url: "https://x/a.png" }]))).toEqual([
      { kind: "image", url: "https://x/a.png" },
    ]);
  });
  it("drops items with an invalid kind or missing url, and junk input", () => {
    expect(parseMedia([{ kind: "gif", url: "https://x/a.gif" }, { kind: "image" }])).toEqual([]);
    expect(parseMedia("nope")).toEqual([]);
    expect(parseMedia(null)).toEqual([]);
  });
});

describe("deriveThreadTitle", () => {
  it("uses the first line, trimmed and collapsed", () => {
    expect(deriveThreadTitle("  How is   the roof storm push doing?  ")).toBe("How is the roof storm push doing?");
  });
  it("truncates long messages on a word boundary with an ellipsis", () => {
    const title = deriveThreadTitle("Compare the insurance agent persona against last month numbers and tell me everything");
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith("…")).toBe(true);
  });
  it("falls back to 'New chat' for empty input", () => {
    expect(deriveThreadTitle("   ")).toBe("New chat");
  });
});

describe("validateArcMessageInput", () => {
  it("returns trimmed body and mentions for valid input", () => {
    const out = validateArcMessageInput({ body: "  hi mark  ", mentions: [mention] });
    expect(out).toEqual({ body: "hi mark", mentions: [mention] });
  });
  it("throws ArcMessageError on empty body", () => {
    expect(() => validateArcMessageInput({ body: "   ", mentions: [] })).toThrow(ArcMessageError);
  });
  it("throws ArcMessageError when over the length cap", () => {
    expect(() => validateArcMessageInput({ body: "x".repeat(4001), mentions: [] })).toThrow(ArcMessageError);
  });
  it("drops malformed mentions rather than throwing", () => {
    const out = validateArcMessageInput({ body: "hi", mentions: [mention, { type: "campaign" } as unknown as ArcMention] });
    expect(out.mentions).toEqual([mention]);
  });
});

describe("serializeMentions / parseMentions", () => {
  it("round-trips a list of mentions", () => {
    expect(parseMentions(serializeMentions([mention]))).toEqual([mention]);
  });
  it("parses a JSON string", () => {
    expect(parseMentions(JSON.stringify([mention]))).toEqual([mention]);
  });
  it("returns [] for junk", () => {
    expect(parseMentions("not json")).toEqual([]);
    expect(parseMentions(null)).toEqual([]);
    expect(parseMentions([{ nope: true }])).toEqual([]);
  });
});
