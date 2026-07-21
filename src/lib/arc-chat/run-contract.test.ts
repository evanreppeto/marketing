import { describe, expect, it } from "vitest";

import { buildArcRunContract } from "./run-contract";

describe("buildArcRunContract", () => {
  it("defaults to an action-capable, externally locked run", () => {
    expect(buildArcRunContract({})).toMatchObject({
      mode: "act",
      modeLabel: "Workspace action",
      modelLabel: "Arc Spark",
      workspaceEffect: "May update internal workspace records",
      externalEffect: "No external sends or spend",
      approval: "Required before any outbound action",
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
      modelLabel: "Arc Forge",
      workspaceEffect: "May create reviewable drafts",
      approval: "Required before any outbound action",
      receiptId: "ABC12345",
      outputSummary: "2 reviewable outputs · 1 tool call",
    });
  });
});
