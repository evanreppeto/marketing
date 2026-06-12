import { randomBytes } from "node:crypto";

import { normalizeBaseUrl } from "@/lib/deployment/app-url";
import { type MarketingAgentProfile } from "./marketing-guidance";
import { createHermesSetupPrompt, createHermesVerificationMessage } from "./setup-prompt";

export type HermesSetupBundleInput = {
  appBaseUrl: string;
  agentName?: string;
  token: string;
  webhookSecret?: string;
  marketingProfile?: MarketingAgentProfile;
  selectedSkillIds?: string[];
  customInstructions?: string;
};

export type HermesSetupBundle = {
  token: string;
  webhookSecret: string;
  prompt: string;
  verificationMessage: string;
  envFile: string;
};

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function createHermesSetupBundle({
  agentName,
  appBaseUrl,
  token,
  webhookSecret = generateWebhookSecret(),
  marketingProfile,
  selectedSkillIds,
  customInstructions,
}: HermesSetupBundleInput): HermesSetupBundle {
  const baseUrl = normalizeBaseUrl(appBaseUrl);
  const prompt = createHermesSetupPrompt({
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
    verificationMessage: createHermesVerificationMessage({ appBaseUrl: baseUrl }),
    envFile: [
      `GROWTH_APP_BASE_URL=${baseUrl}`,
      `GROWTH_APP_AGENT_TOKEN=${token}`,
      `HERMES_WEBHOOK_SECRET=${webhookSecret}`,
    ].join("\n"),
  };
}
