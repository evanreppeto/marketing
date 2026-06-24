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

  it("registers an approval-gated campaign-package skill that drafts but does not generate media", () => {
    const skill = resolveArcSkill("campaign-package-drafting");

    expect(skill).toMatchObject({
      id: "campaign-package-drafting",
      businessAgnostic: true,
      approvalPolicy: "approval_gated_drafts",
    });
    expect(skill?.allowedTools).toContain("create_campaign_draft");
    expect(skill?.allowedTools).toContain("attach_media");
    // Boundary: net-new media generation stays with the broader drafting skill.
    expect(skill?.allowedTools).not.toContain("generate_image");
    expect(skill?.allowedTools).not.toContain("generate_video");
  });
});
