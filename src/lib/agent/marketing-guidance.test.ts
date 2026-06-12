import { describe, expect, it } from "vitest";

import { createMarketingOperatorPrompt, getCreativeToolRecommendations, getMarketingSkillPacks } from "./marketing-guidance";

describe("createMarketingOperatorPrompt", () => {
  it("orients Hermes toward marketing work with approval-safe boundaries", () => {
    const prompt = createMarketingOperatorPrompt();

    expect(prompt).toContain("Marketing Operator");
    expect(prompt).toContain("lead generation");
    expect(prompt).toContain("local SEO");
    expect(prompt).toContain("approval");
    expect(prompt).toContain("Do not publish");
  });

  it("includes a customer-specific agent profile and selected skill packs", () => {
    const prompt = createMarketingOperatorPrompt({
      profile: {
        companyName: "Acme Restoration",
        serviceArea: "Chicago suburbs",
        services: "water, fire, mold, reconstruction",
        idealCustomers: "homeowners and property managers",
        differentiators: "fast documentation and clean communication",
        brandVoice: "calm, direct, local expert",
        forbiddenClaims: "do not promise insurance approval",
      },
      selectedSkillIds: ["local-seo", "claim-safe-copy"],
      customInstructions: "Prefer short campaign briefs.",
    });

    expect(prompt).toContain("Acme Restoration");
    expect(prompt).toContain("Chicago suburbs");
    expect(prompt).toContain("homeowners and property managers");
    expect(prompt).toContain("fast documentation and clean communication");
    expect(prompt).toContain("calm, direct, local expert");
    expect(prompt).toContain("do not promise insurance approval");
    expect(prompt).toContain("Local SEO");
    expect(prompt).toContain("Claim-Safe Copy");
    expect(prompt).not.toContain("Analytics Reporting");
    expect(prompt).toContain("Prefer short campaign briefs.");
  });
});

describe("getMarketingSkillPacks", () => {
  it("returns useful copyable skill packs for marketing agents", () => {
    const skills = getMarketingSkillPacks();

    expect(skills.map((skill) => skill.id)).toContain("brand-voice");
    expect(skills.map((skill) => skill.id)).toContain("local-seo");
    expect(skills.map((skill) => skill.id)).toContain("approval-workflow");
    expect(skills.every((skill) => skill.prompt.trim().length > 80)).toBe(true);
  });
});

describe("getCreativeToolRecommendations", () => {
  it("returns image and design tools with copyable Hermes instructions", () => {
    const tools = getCreativeToolRecommendations();

    expect(tools.map((tool) => tool.id)).toEqual(["openai-images", "canva", "figma", "runway"]);
    expect(tools.every((tool) => tool.prompt.includes("Use this when"))).toBe(true);
  });
});
