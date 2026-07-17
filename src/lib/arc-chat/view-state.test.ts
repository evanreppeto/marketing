import { describe, expect, it } from "vitest";

import { getArcConversationHeader, shouldShowDemoLauncher } from "./view-state";

describe("shouldShowDemoLauncher", () => {
  it("shows the launcher for an untouched new demo conversation", () => {
    expect(shouldShowDemoLauncher({ selectedDemoId: "new", turnCount: 0, pending: false })).toBe(true);
  });

  it("switches to the conversation as soon as the first turn starts", () => {
    expect(shouldShowDemoLauncher({ selectedDemoId: "new", turnCount: 1, pending: true })).toBe(false);
  });

  it("does not replace an existing demo conversation with the launcher", () => {
    expect(shouldShowDemoLauncher({ selectedDemoId: "storm", turnCount: 0, pending: false })).toBe(false);
  });
});

describe("getArcConversationHeader", () => {
  it("removes stale campaign metadata from a new demo conversation", () => {
    expect(getArcConversationHeader({ live: false, selectedDemoId: "new" })).toEqual({
      title: "New conversation",
      subtitle: "Full workspace memory is on",
    });
  });

  it("keeps the campaign-specific metadata on the storm demo", () => {
    expect(getArcConversationHeader({ live: false, selectedDemoId: "storm" })).toEqual({
      title: "Storm Rapid Response",
      subtitle: "Storm-damage homeowners · 4 assets · Naperville, IL",
    });
  });

  it("uses the active server title for live conversations", () => {
    expect(getArcConversationHeader({ live: true, activeTitle: "Inspection follow-up", selectedDemoId: "storm" })).toEqual({
      title: "Inspection follow-up",
      subtitle: "Private conversation",
    });
  });
});
