import { describe, expect, it } from "vitest";

import { createArcSetupPrompt, createArcVerificationMessage, getArcSetupWalkthrough } from "./setup-prompt";

describe("createArcSetupPrompt", () => {
  it("renders a copy-paste prompt for connecting Arc to the hosted workspace", () => {
    const prompt = createArcSetupPrompt({
      appBaseUrl: "https://acme.growthengine.com/",
      agentName: "Arc",
    });

    expect(prompt).toContain("You are Arc, connected to the Growth Engine hosted workspace.");
    expect(prompt).toContain("GROWTH_APP_BASE_URL=https://acme.growthengine.com");
    expect(prompt).toContain("GROWTH_APP_AGENT_TOKEN=PASTE_AGENT_TOKEN_HERE");
    expect(prompt).toContain("GET https://acme.growthengine.com/api/v1/arc/ping");
    expect(prompt).toContain("POST https://acme.growthengine.com/api/v1/arc/messages");
    expect(prompt).toContain("Marketing Operator");
    expect(prompt).toContain("Prioritize lead generation, trust-building, local SEO");
    expect(prompt).toContain("Never approve, publish, send, launch, dispatch, or unlock public-facing work.");
  });

  it("uses custom placeholders when provided", () => {
    const prompt = createArcSetupPrompt({
      appBaseUrl: "http://127.0.0.1:3000",
      agentName: "Arc Prime",
      tokenPlaceholder: "sk_live_test",
      webhookSecretPlaceholder: "secret",
    });

    expect(prompt).toContain("GROWTH_APP_AGENT_TOKEN=sk_live_test");
    expect(prompt).toContain("ARC_WEBHOOK_SECRET=secret");
    expect(prompt).toContain("You are Arc Prime");
  });
});

describe("getArcSetupWalkthrough", () => {
  it("returns a detailed ordered walkthrough for Prompt Mode", () => {
    const steps = getArcSetupWalkthrough({ appBaseUrl: "https://acme.growthengine.com" });

    expect(steps.map((step) => step.title)).toEqual([
      "Open this hosted workspace",
      "Create or copy an agent token",
      "Paste the setup prompt into Arc",
      "Ask Arc to verify the connection",
      "Connect the wake webhook when ready",
      "Send one Arc message",
    ]);
    expect(steps[0].detail).toContain("https://acme.growthengine.com");
    expect(steps[3].detail).toContain("/api/v1/arc/ping");
  });
});

describe("createArcVerificationMessage", () => {
  it("renders the follow-up instruction to paste into Arc", () => {
    const message = createArcVerificationMessage({ appBaseUrl: "https://acme.growthengine.com/" });

    expect(message).toContain("Run the Growth Engine connection check now.");
    expect(message).toContain("GET https://acme.growthengine.com/api/v1/arc/ping");
    expect(message).toContain("GET https://acme.growthengine.com/api/v1/arc/messages?limit=20");
    expect(message).toContain("tell me exactly what passed or failed");
  });
});
