import type { Config } from "./config";

/**
 * Thin client over the app's Arc Operations API (/api/v1/arc/*). The bridge
 * never touches Supabase directly — this is its only seam into app state.
 */

export type ChatReplyInput = {
  agentTaskId: string;
  body: string;
  status?: "complete" | "failed";
  metadata?: Record<string, unknown>;
};

export function createArcClient(config: Config) {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${config.arcAgentApiToken}`,
  };

  async function postChatReply(input: ChatReplyInput): Promise<void> {
    const res = await fetch(`${config.appApiBaseUrl}/api/v1/arc/messages`, {
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
      throw new Error(`POST /api/v1/arc/messages -> ${res.status} ${detail}`.trim());
    }
  }

  /**
   * Append a live activity step to the pending chat bubble (the chain-of-thought
   * trace). Best-effort — a failed step must never break the run.
   */
  async function postStep(agentTaskId: string, label: string, status: "running" | "done"): Promise<void> {
    try {
      await fetch(`${config.appApiBaseUrl}/api/v1/arc/messages/${agentTaskId}/steps`, {
        method: "POST",
        headers,
        body: JSON.stringify({ label, status }),
      });
    } catch {
      /* steps are cosmetic; ignore */
    }
  }

  /** Read-only CRM lead search (GET /api/v1/arc/crm/leads). Powers the find_leads tool. */
  async function getLeads(params: {
    status?: string;
    persona?: string;
    source?: string;
    q?: string;
    limit?: number;
  }): Promise<unknown[]> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.persona) qs.set("persona", params.persona);
    if (params.source) qs.set("source", params.source);
    if (params.q) qs.set("q", params.q);
    qs.set("limit", String(params.limit ?? 25));

    const res = await fetch(`${config.appApiBaseUrl}/api/v1/arc/crm/leads?${qs.toString()}`, { headers });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`GET /api/v1/arc/crm/leads -> ${res.status} ${detail}`.trim());
    }
    const data = (await res.json()) as { leads?: unknown[] };
    return data.leads ?? [];
  }

  return { postChatReply, postStep, getLeads };
}

export type ArcClient = ReturnType<typeof createArcClient>;
