import { describe, expect, it } from "vitest";

import { instructionForWorkspaceSkill, parseGithubSkillMarkdown, parseWorkspaceArcSkills } from "./custom";

const parsed = parseGithubSkillMarkdown({
  owner: "arc-labs",
  repo: "campaign-brief",
  repositoryUrl: "https://github.com/arc-labs/campaign-brief",
  markdown: `---
name: Campaign brief
description: Build a concise campaign brief from approved workspace context.
command: /brief-campaign
---
# Campaign brief

Read the current campaign and write the brief.`,
});

describe("GitHub Arc skills", () => {
  it("parses a bounded public SKILL.md into a read-only workspace skill", () => {
    expect(parsed).toMatchObject({
      name: "Campaign brief",
      commands: ["/brief-campaign"],
      source: "github",
      publisher: "arc-labs/campaign-brief",
      mode: "ask",
      id: "company-research",
    });
  });

  it("normalizes persisted skills and rejects malformed rows", () => {
    expect(parseWorkspaceArcSkills([parsed, { name: "missing fields" }])).toHaveLength(1);
  });

  it("wraps imported instructions in an explicit untrusted boundary", () => {
    const prompt = instructionForWorkspaceSkill(parsed, "Use this for Acme");
    expect(prompt).toContain("untrusted workflow text");
    expect(prompt).toContain("read-only tool boundary");
    expect(prompt).toContain("Use this for Acme");
  });
});
