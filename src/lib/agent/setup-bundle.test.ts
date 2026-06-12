import { describe, expect, it } from "vitest";

import { createHermesSetupBundle, generateWebhookSecret } from "./setup-bundle";

describe("generateWebhookSecret", () => {
  it("creates random webhook secrets with a recognizable prefix", () => {
    const first = generateWebhookSecret();
    const second = generateWebhookSecret();

    expect(first).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });
});

describe("createHermesSetupBundle", () => {
  it("returns a ready-to-paste prompt with generated credentials filled in", () => {
    const bundle = createHermesSetupBundle({
      agentName: "Hermes Prime",
      appBaseUrl: "https://acme.growthengine.com/",
      token: "sk_live_test_token",
      webhookSecret: "whsec_test_secret",
    });

    expect(bundle.token).toBe("sk_live_test_token");
    expect(bundle.webhookSecret).toBe("whsec_test_secret");
    expect(bundle.prompt).toContain("You are Hermes Prime");
    expect(bundle.prompt).toContain("GROWTH_APP_BASE_URL=https://acme.growthengine.com");
    expect(bundle.prompt).toContain("GROWTH_APP_AGENT_TOKEN=sk_live_test_token");
    expect(bundle.prompt).toContain("HERMES_WEBHOOK_SECRET=whsec_test_secret");
    expect(bundle.prompt).not.toContain("PASTE_AGENT_TOKEN_HERE");
    expect(bundle.prompt).not.toContain("PASTE_SHARED_WEBHOOK_SECRET_HERE");
  });

  it("returns an env file and verification message for the same workspace", () => {
    const bundle = createHermesSetupBundle({
      appBaseUrl: "https://acme.growthengine.com/",
      token: "sk_live_test_token",
      webhookSecret: "whsec_test_secret",
    });

    expect(bundle.envFile).toContain("GROWTH_APP_BASE_URL=https://acme.growthengine.com");
    expect(bundle.envFile).toContain("GROWTH_APP_AGENT_TOKEN=sk_live_test_token");
    expect(bundle.envFile).toContain("HERMES_WEBHOOK_SECRET=whsec_test_secret");
    expect(bundle.verificationMessage).toContain("GET https://acme.growthengine.com/api/v1/hermes/ping");
    expect(bundle.verificationMessage).toContain("GET https://acme.growthengine.com/api/v1/hermes/messages?limit=20");
  });

  it("carries the agent profile and selected skills into the generated prompt", () => {
    const bundle = createHermesSetupBundle({
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
