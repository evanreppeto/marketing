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
      expect(profile.completedSummary).toContain("Workspace knowledge");
      expect(profile.resultLabel.length).toBeGreaterThan(0);
      expect(profile.resultTitle.length).toBeGreaterThan(0);
      expect(profile.nextAction.length).toBeGreaterThan(0);
      expect(new Set(profile.phases.map((phase) => phase.id)).size).toBe(profile.phases.length);
    }
  });

  it("keeps the completion receipt specific to the request", () => {
    const profile = buildArcRunProfile({
      request: "Compare the roofing audiences that need attention next",
      mode: "ask",
      sources: ["CRM records"],
    });

    expect(profile.completedSummary).toContain("roofing audiences");
    expect(profile.completedSummary).not.toBe("I analyzed the relevant records, checked the strongest patterns, and prepared an inspectable recommendation.");
  });
});
