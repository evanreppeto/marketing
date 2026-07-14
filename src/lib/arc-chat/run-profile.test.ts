import { describe, expect, it } from "vitest";

import { buildArcRunProfile, inferArcRunIntent } from "./run-profile";

describe("inferArcRunIntent", () => {
  it.each([
    ["Can you explain how context works?", "ask", null, "chat"],
    ["Find the latest storm reports", "ask", null, "research"],
    ["Update me on the latest storm reports", "ask", null, "research"],
    ["Compare these audience segments", "ask", null, "analysis"],
    ["Draft a follow-up email", "ask", null, "create"],
    ["Update the campaign owner", "act", null, "action"],
    ["Find qualified leads", "act", "find-leads", "research"],
    ["Give me the short version", "ask", "summarize", "analysis"],
  ] as const)("classifies %s as %s", (request, mode, command, expected) => {
    expect(inferArcRunIntent({ request, mode, command })).toBe(expected);
  });
});

describe("buildArcRunProfile", () => {
  it("creates distinct, uniquely keyed phase sets", () => {
    const prompts = [
      "Explain this campaign",
      "Search for local storm activity",
      "Analyze campaign performance",
      "Create a landing page",
      "Update the CRM record",
    ];

    const profiles = prompts.map((request) => buildArcRunProfile({ request, mode: request.startsWith("Update") ? "act" : "ask", sources: ["Workspace knowledge", "CRM records"] }));

    expect(new Set(profiles.map((profile) => profile.intent)).size).toBe(5);
    for (const profile of profiles) {
      expect(profile.activeLabel.length).toBeGreaterThan(0);
      expect(profile.approach).toContain("Workspace knowledge");
      expect(new Set(profile.phases.map((phase) => phase.id)).size).toBe(profile.phases.length);
    }
  });
});
