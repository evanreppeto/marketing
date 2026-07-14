import { describe, expect, it } from "vitest";

import { buildArcRunContract } from "./run-contract";

describe("buildArcRunContract", () => {
  it("defaults to a read-only, externally locked run", () => {
    expect(buildArcRunContract({})).toMatchObject({
      mode: "ask",
      modeLabel: "Read only",
      modelLabel: "Fast",
      workspaceEffect: "No workspace changes",
      externalEffect: "No external sends or spend",
      approval: "Not needed for read-only work",
    });
  });

  it("deduplicates known context scopes and drops unknown ones", () => {
    expect(buildArcRunContract({ contextScopes: ["crm", "brand", "crm", "unknown"] }).readScopes)
      .toEqual(["CRM records", "Brand profile"]);
  });

  it("summarizes draft outputs and produces a short receipt id", () => {
    expect(buildArcRunContract({
      mode: "draft",
      route: "standard",
      actionCount: 2,
      toolCount: 1,
      agentTaskId: "abc12345-6789",
    })).toMatchObject({
      modeLabel: "Draft only",
      modelLabel: "Deep",
      workspaceEffect: "May create reviewable drafts",
      approval: "Required before any outbound action",
      receiptId: "ABC12345",
      outputSummary: "2 reviewable outputs · 1 tool call",
    });
  });
});
