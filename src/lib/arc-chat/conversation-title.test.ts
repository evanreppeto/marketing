import { describe, expect, it } from "vitest";

import { deriveArcConversationTitle } from "./conversation-title";

describe("deriveArcConversationTitle", () => {
  it("uses the first request sentence instead of the full prompt", () => {
    expect(deriveArcConversationTitle(
      "where are we with arc. Make sure we pull the current version and review everything.",
    )).toBe("Where are we with arc");
  });

  it("removes conversational filler and clips at a word boundary", () => {
    expect(deriveArcConversationTitle(
      "Could you please help me understand which homeowners need an inspection follow-up this afternoon",
    )).toBe("Understand which homeowners need an inspection…");
  });

  it("turns a command-only prompt into a readable title", () => {
    expect(deriveArcConversationTitle("/find-leads")).toBe("Find leads");
  });

  it("falls back when the prompt is blank", () => {
    expect(deriveArcConversationTitle("  \n  ")).toBe("New conversation");
  });
});
