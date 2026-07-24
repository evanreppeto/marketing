import { describe, expect, it } from "vitest";

import {
  canRefreshArcConversationTitle,
  deriveArcConversationTitle,
  deriveArcOutcomeConversationTitle,
} from "./conversation-title";

describe("deriveArcConversationTitle", () => {
  it("uses the first request sentence instead of the full prompt", () => {
    expect(deriveArcConversationTitle(
      "where are we with arc. Make sure we pull the current version and review everything.",
    )).toBe("Where are we with arc");
  });

  it("removes conversational request prefixes", () => {
    expect(deriveArcConversationTitle("Please help me find the strongest leads right now.")).toBe("Find the strongest leads right now");
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

describe("deriveArcOutcomeConversationTitle", () => {
  it("uses the meaningful result heading instead of the raw request", () => {
    expect(deriveArcOutcomeConversationTitle({
      request: "Using live CRM data, identify the highest-leverage opportunity this week.",
      response: "I checked the workspace.\n\n## Highest-leverage opportunity this week: stand up a Rebuild Homeowner motion\n\nHere is why.",
    })).toBe("Rebuild Homeowner motion");
  });

  it("uses an explicitly requested asset title", () => {
    expect(deriveArcOutcomeConversationTitle({
      request: 'Draft another email. Title it "Send-pipeline verification email 2".',
      response: "Done.",
    })).toBe("Send-pipeline verification email 2");
  });

  it("creates compact operational titles for common verification work", () => {
    expect(deriveArcOutcomeConversationTitle({
      request: "Use the CRM lead search tool and report the exact total number of leads.",
      response: "There are 200.",
    })).toBe("CRM lead count");
  });
});

describe("canRefreshArcConversationTitle", () => {
  it("preserves manual renames", () => {
    expect(canRefreshArcConversationTitle("Q3 homeowner strategy", "Analyze the homeowner opportunity")).toBe(false);
  });

  it("allows the initial automatic title to be upgraded", () => {
    const request = "Analyze the homeowner opportunity";
    expect(canRefreshArcConversationTitle(deriveArcConversationTitle(request), request)).toBe(true);
  });
});
