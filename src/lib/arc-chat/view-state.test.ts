import { describe, expect, it } from "vitest";

import {
  getArcConversationHeader,
  getArcConversationScrollTarget,
  shouldShowDemoLauncher,
  shouldUseDemoSeedWorkspace,
} from "./view-state";

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

describe("shouldUseDemoSeedWorkspace", () => {
  it("uses the historical workspace before a new turn starts", () => {
    expect(shouldUseDemoSeedWorkspace({ live: false, selectedDemoId: "storm", turnCount: 0 })).toBe(true);
  });

  it("switches the workspace to the current run after the operator sends a message", () => {
    expect(shouldUseDemoSeedWorkspace({ live: false, selectedDemoId: "storm", turnCount: 1 })).toBe(false);
  });

  it("never inserts seeded campaign context into a blank conversation", () => {
    expect(shouldUseDemoSeedWorkspace({ live: false, selectedDemoId: "new", turnCount: 0 })).toBe(false);
  });
});

describe("getArcConversationScrollTarget", () => {
  it("starts a live blank conversation at the top of its launcher", () => {
    expect(getArcConversationScrollTarget({ live: true, activeConversationId: null, selectedDemoId: "storm" })).toBe("start");
  });

  it("keeps established live conversations pinned to their latest turn", () => {
    expect(getArcConversationScrollTarget({ live: true, activeConversationId: "conversation-1", selectedDemoId: "storm" })).toBe("end");
  });

  it("starts the demo launcher at the top", () => {
    expect(getArcConversationScrollTarget({ live: false, activeConversationId: null, selectedDemoId: "new" })).toBe("start");
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
