import { describe, expect, it } from "vitest";

import { ARC_SKILLS, resolveArcSkill } from "./skills";

describe("Arc skill registry", () => {
  it("ships broad, company-agnostic skills that grant tools by allowlist", () => {
    const skill = resolveArcSkill("company-research");

    expect(skill).toMatchObject({
      id: "company-research",
      businessAgnostic: true,
      approvalPolicy: "propose_only",
    });
    expect(skill?.allowedTools).toContain("research_web");
    expect(skill?.allowedTools).toContain("cite_sources");
    expect(skill?.allowedTools).not.toContain("create_campaign_draft");
  });

  it("resolves nullish skill ids without narrowing the base mode tools", () => {
    expect(resolveArcSkill(undefined)).toBeNull();
    expect(resolveArcSkill(null)).toBeNull();
  });

  it("rejects unknown skill ids so bad payloads do not accidentally expand access", () => {
    expect(() => resolveArcSkill("restoration-only-secret-skill")).toThrow(/Unknown Arc skill/);
  });

  it("keeps every registered skill business agnostic", () => {
    expect(ARC_SKILLS.length).toBeGreaterThan(0);
    expect(ARC_SKILLS.every((skill) => skill.businessAgnostic)).toBe(true);
  });
});
