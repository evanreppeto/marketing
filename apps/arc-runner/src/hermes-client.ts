import type { Config } from "./config";

/**
 * Thin client over the app's Mark Operations API (/api/v1/hermes/*). The bridge
 * never touches Supabase directly — this is its only seam into app state.
 */

export type ChatReplyInput = {
  agentTaskId: string;
  body: string;
  status?: "complete" | "failed";
  metadata?: Record<string, unknown>;
};

export function createHermesClient(config: Config) {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${config.hermesAgentApiToken}`,
  };

  async function postChatReply(input: ChatReplyInput): Promise<void> {
    const res = await fetch(`${config.appApiBaseUrl}/api/v1/hermes/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        agentTaskId: input.agentTaskId,
        body: input.body,
        status: input.status ?? "complete",
        metadata: input.metadata ?? {},
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`POST /api/v1/hermes/messages -> ${res.status} ${detail}`.trim());
    }
  }

  return { postChatReply };
}

export type HermesClient = ReturnType<typeof createHermesClient>;
