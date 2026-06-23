import { describe, expect, it } from "vitest";

import { ARC_SKILL_IDS, skillIdForArcCommand } from "./catalog";

describe("Arc app skill catalog", () => {
  it("maps broad Arc commands onto generic runner skills", () => {
    expect(skillIdForArcCommand("find-leads")).toBe(ARC_SKILL_IDS.opportunityDiscovery);
    expect(skillIdForArcCommand("draft-campaign")).toBe(ARC_SKILL_IDS.approvalGatedDrafting);
    expect(skillIdForArcCommand("signals")).toBe(ARC_SKILL_IDS.companyResearch);
  });

  it("returns null for plain chat or unknown commands", () => {
    expect(skillIdForArcCommand(null)).toBeNull();
    expect(skillIdForArcCommand("")).toBeNull();
    expect(skillIdForArcCommand("unknown-command")).toBeNull();
  });
});
