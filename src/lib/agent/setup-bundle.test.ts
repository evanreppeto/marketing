import { describe, expect, it } from "vitest";

import { createArcSetupBundle, generateWebhookSecret } from "./setup-bundle";

describe("generateWebhookSecret", () => {
  it("creates random webhook secrets with a recognizable prefix", () => {
    const first = generateWebhookSecret();
    const second = generateWebhookSecret();

    expect(first).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });
});

describe("createArcSetupBundle", () => {
  it("returns a ready-to-paste prompt with generated credentials filled in", () => {
    const bundle = createArcSetupBundle({
      agentName: "Arc Prime",
      appBaseUrl: "https://acme.growthengine.com/",
      token: "sk_live_test_token",
      webhookSecret: "whsec_test_secret",
    });

    expect(bundle.token).toBe("sk_live_test_token");
    expect(bundle.webhookSecret).toBe("whsec_test_secret");
    expect(bundle.prompt).toContain("You are Arc Prime");
    expect(bundle.prompt).toContain("GROWTH_APP_BASE_URL=https://acme.growthengine.com");
    expect(bundle.prompt).toContain("GROWTH_APP_AGENT_TOKEN=sk_live_test_token");
    expect(bundle.prompt).toContain("ARC_WEBHOOK_SECRET=whsec_test_secret");
    expect(bundle.prompt).not.toContain("PASTE_AGENT_TOKEN_HERE");
    expect(bundle.prompt).not.toContain("PASTE_SHARED_WEBHOOK_SECRET_HERE");
  });

  it("returns an env file and verification message for the same workspace", () => {
    const bundle = createArcSetupBundle({
      appBaseUrl: "https://acme.growthengine.com/",
      token: "sk_live_test_token",
      webhookSecret: "whsec_test_secret",
    });

    expect(bundle.envFile).toContain("GROWTH_APP_BASE_URL=https://acme.growthengine.com");
    expect(bundle.envFile).toContain("GROWTH_APP_AGENT_TOKEN=sk_live_test_token");
    expect(bundle.envFile).toContain("ARC_WEBHOOK_SECRET=whsec_test_secret");
    expect(bundle.verificationMessage).toContain("GET https://acme.growthengine.com/api/v1/arc/ping");
    expect(bundle.verificationMessage).toContain("GET https://acme.growthengine.com/api/v1/arc/messages?limit=20");
  });

  it("carries the agent profile and selected skills into the generated prompt", () => {
    const bundle = createArcSetupBundle({
      appBaseUrl: "https://acme.growthengine.com/",
      token: "sk_live_test_token",
      webhookSecret: "whsec_test_secret",
      marketingProfile: {
        companyName: "Acme Restoration",
        serviceArea: "Chicago",
        services: "roofing and storm restoration",
        idealCustomers: "homeowners with storm damage",
        differentiators: "clear photo documentation",
        brandVoice: "calm and confident",
        forbiddenClaims: "never guarantee claim approval",
      },
      selectedSkillIds: ["brand-voice", "approval-workflow"],
    });

    expect(bundle.prompt).toContain("Acme Restoration");
    expect(bundle.prompt).toContain("roofing and storm restoration");
    expect(bundle.prompt).toContain("Brand Voice");
    expect(bundle.prompt).toContain("Approval Workflow");
    expect(bundle.prompt).not.toContain("Analytics Reporting");
  });
});
