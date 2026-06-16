import { randomBytes } from "node:crypto";

import { normalizeBaseUrl } from "@/lib/deployment/app-url";
import { type MarketingAgentProfile } from "./marketing-guidance";
import { createArcSetupPrompt, createArcVerificationMessage } from "./setup-prompt";

export type ArcSetupBundleInput = {
  appBaseUrl: string;
  agentName?: string;
  token: string;
  webhookSecret?: string;
  marketingProfile?: MarketingAgentProfile;
  selectedSkillIds?: string[];
  customInstructions?: string;
};

export type ArcSetupBundle = {
  token: string;
  webhookSecret: string;
  prompt: string;
  verificationMessage: string;
  envFile: string;
};

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function createArcSetupBundle({
  agentName,
  appBaseUrl,
  token,
  webhookSecret = generateWebhookSecret(),
  marketingProfile,
  selectedSkillIds,
  customInstructions,
}: ArcSetupBundleInput): ArcSetupBundle {
  const baseUrl = normalizeBaseUrl(appBaseUrl);
  const prompt = createArcSetupPrompt({
    agentName,
    appBaseUrl: baseUrl,
    tokenPlaceholder: token,
    webhookSecretPlaceholder: webhookSecret,
    marketingProfile,
    selectedSkillIds,
    customInstructions,
  });

  return {
    token,
    webhookSecret,
    prompt,
    verificationMessage: createArcVerificationMessage({ appBaseUrl: baseUrl }),
    envFile: [
      `GROWTH_APP_BASE_URL=${baseUrl}`,
      `GROWTH_APP_AGENT_TOKEN=${token}`,
      `ARC_WEBHOOK_SECRET=${webhookSecret}`,
    ].join("\n"),
  };
}
