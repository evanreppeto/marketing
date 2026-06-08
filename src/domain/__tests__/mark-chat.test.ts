import { describe, expect, it } from "vitest";

import {
  MarkMessageError,
  deriveThreadTitle,
  parseMentions,
  serializeMentions,
  validateMarkMessageInput,
  type MarkMention,
} from "../mark-chat";

const mention: MarkMention = { type: "campaign", id: "c1", label: "Roof storm push", href: "/campaigns/c1" };

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

describe("validateMarkMessageInput", () => {
  it("returns trimmed body and mentions for valid input", () => {
    const out = validateMarkMessageInput({ body: "  hi mark  ", mentions: [mention] });
    expect(out).toEqual({ body: "hi mark", mentions: [mention] });
  });
  it("throws MarkMessageError on empty body", () => {
    expect(() => validateMarkMessageInput({ body: "   ", mentions: [] })).toThrow(MarkMessageError);
  });
  it("throws MarkMessageError when over the length cap", () => {
    expect(() => validateMarkMessageInput({ body: "x".repeat(4001), mentions: [] })).toThrow(MarkMessageError);
  });
  it("drops malformed mentions rather than throwing", () => {
    const out = validateMarkMessageInput({ body: "hi", mentions: [mention, { type: "campaign" } as unknown as MarkMention] });
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
