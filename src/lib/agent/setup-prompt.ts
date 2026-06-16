import { normalizeBaseUrl } from "@/lib/deployment/app-url";
import { createMarketingOperatorPrompt, type MarketingAgentProfile } from "./marketing-guidance";

export type ArcSetupPromptInput = {
  appBaseUrl: string;
  agentName?: string;
  tokenPlaceholder?: string;
  webhookSecretPlaceholder?: string;
  marketingProfile?: MarketingAgentProfile;
  selectedSkillIds?: string[];
  customInstructions?: string;
};

export type ArcSetupWalkthroughStep = {
  title: string;
  detail: string;
  action: string;
};

export function getArcSetupWalkthrough({ appBaseUrl }: { appBaseUrl: string }): ArcSetupWalkthroughStep[] {
  const baseUrl = normalizeBaseUrl(appBaseUrl);
  return [
    {
      title: "Open this hosted workspace",
      detail: `This app lives at ${baseUrl}. Keep this browser tab open while Arc connects back to it.`,
      action: "Confirm the URL matches the app you want Arc to control.",
    },
    {
      title: "Create or copy an agent token",
      detail: "Use an app-issued token from Inbound API tokens, or use ARC_AGENT_API_TOKEN if this deploy is still env-only.",
      action: "Paste the token into the setup prompt where it says PASTE_AGENT_TOKEN_HERE.",
    },
    {
      title: "Paste the setup prompt into Arc",
      detail: "The prompt teaches Arc the app URL, auth header, polling endpoint, reply endpoint, progress endpoint, and safety rules.",
      action: "Use Copy Arc prompt, or manually select the prompt text.",
    },
    {
      title: "Ask Arc to verify the connection",
      detail: `Arc should call GET ${baseUrl}/api/v1/arc/ping, then poll /api/v1/arc/messages?limit=20 and report the result.`,
      action: "Paste the verification message after the setup prompt.",
    },
    {
      title: "Connect the wake webhook when ready",
      detail: "Polling works first. The webhook URL and signing secret are optional acceleration so Arc messages wake Arc immediately.",
      action: "Set the webhook URL and shared secret below, then use Test connection.",
    },
    {
      title: "Send one Arc message",
      detail: "A real Arc message proves the full loop: app creates work, Arc reads it, Arc replies, and the app records the response.",
      action: "Open Arc and send a short test message.",
    },
  ];
}

export function createArcVerificationMessage({ appBaseUrl }: { appBaseUrl: string }): string {
  const baseUrl = normalizeBaseUrl(appBaseUrl);
  return `Run the Growth Engine connection check now.

1. Call:
GET ${baseUrl}/api/v1/arc/ping

2. Then poll:
GET ${baseUrl}/api/v1/arc/messages?limit=20

3. tell me exactly what passed or failed, including the HTTP status, response body, and whether you have the bearer token loaded.

Do not create public-facing work during this check. Only verify connectivity.`;
}

export function createArcSetupPrompt({
  appBaseUrl,
  agentName = "Arc",
  tokenPlaceholder = "PASTE_AGENT_TOKEN_HERE",
  webhookSecretPlaceholder = "PASTE_SHARED_WEBHOOK_SECRET_HERE",
  marketingProfile,
  selectedSkillIds,
  customInstructions,
}: ArcSetupPromptInput): string {
  const baseUrl = normalizeBaseUrl(appBaseUrl);
  const cleanAgentName = agentName.trim() || "Arc";

  return `You are ${cleanAgentName}, connected to the Growth Engine hosted workspace.

Use these Arc-side environment values:

GROWTH_APP_BASE_URL=${baseUrl}
GROWTH_APP_AGENT_TOKEN=${tokenPlaceholder}
ARC_WEBHOOK_SECRET=${webhookSecretPlaceholder}

Your job:
- Read queued work from Growth Engine.
- Reply to Arc chat messages.
- Draft, recommend, summarize, and log progress.
- Keep public-facing work locked for human approval.

${createMarketingOperatorPrompt({ profile: marketingProfile, selectedSkillIds, customInstructions })}

First verify the connection:

GET ${baseUrl}/api/v1/arc/ping
Authorization: Bearer ${tokenPlaceholder}

Then poll for Arc messages:

GET ${baseUrl}/api/v1/arc/messages?limit=20
Authorization: Bearer ${tokenPlaceholder}

When you answer an Arc message, post the final response:

POST ${baseUrl}/api/v1/arc/messages
Authorization: Bearer ${tokenPlaceholder}
Content-Type: application/json

{
  "agentTaskId": "the message agentTaskId",
  "body": "your reply for the operator",
  "status": "complete",
  "metadata": {}
}

You may report progress while working:

POST ${baseUrl}/api/v1/arc/messages/{agentTaskId}/steps
Authorization: Bearer ${tokenPlaceholder}
Content-Type: application/json

{
  "steps": [
    { "label": "Reading workspace context", "status": "active" }
  ],
  "body": "Working..."
}

Safety boundary:
- Never approve, publish, send, launch, dispatch, or unlock public-facing work.
- Never promise insurance coverage, claim approval, payouts, pricing, or guaranteed timelines.
- Create drafts and recommendations only; anything public-facing must go through Growth Engine approval state.
- If you cannot complete a task, reply with status "failed" or block the task with a short reason.

If the app wake webhook is not received, keep polling /api/v1/arc/messages and /api/v1/arc/tasks.`;
}
