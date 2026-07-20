import { describe, expect, it } from "vitest";

import {
  ALL_ARC_SKILLS,
  ARC_SKILL_BUILDER,
  ARC_SKILL_LIBRARY,
  ARC_SKILLS,
  ARC_SKILL_IDS,
  arcSkillForCommand,
  arcSkillForKey,
  skillIdForArcCommand,
} from "./catalog";

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

  it("only advertises skills backed by the runner catalog", () => {
    expect(ARC_SKILLS).toHaveLength(8);
    expect(ARC_SKILL_LIBRARY).toHaveLength(6);
    expect(new Set(ALL_ARC_SKILLS.map((skill) => skill.key)).size).toBe(ALL_ARC_SKILLS.length);
    expect(ALL_ARC_SKILLS.every((skill) => Object.values(ARC_SKILL_IDS).includes(skill.id))).toBe(true);
    expect(ALL_ARC_SKILLS.every((skill) => skill.commands.length > 0 && skill.prompt.length > 0 && skill.mode.length > 0)).toBe(true);
  });

  it("resolves the focused product skill while keeping the generic runner playbook", () => {
    expect(arcSkillForCommand("/build-audience")?.name).toBe("Audience builder");
    expect(skillIdForArcCommand("/build-audience")).toBe(ARC_SKILL_IDS.opportunityDiscovery);
    expect(arcSkillForCommand("/create-asset")?.name).toBe("Asset studio");
    expect(skillIdForArcCommand("/create-asset")).toBe(ARC_SKILL_IDS.approvalGatedDrafting);
  });

  it("routes the system skill builder and online library commands", () => {
    expect(ARC_SKILL_BUILDER.commands[0]).toBe("/create-skill");
    expect(skillIdForArcCommand("/create-skill")).toBe(ARC_SKILL_IDS.skillAuthoring);
    expect(arcSkillForCommand("/storm-monitor")?.source).toBe("library");
    expect(arcSkillForKey("competitor-watch")?.name).toBe("Competitor watch");
  });
});
