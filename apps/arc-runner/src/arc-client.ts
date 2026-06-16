import type { Config } from "./config";

/**
 * Thin client over the app's Arc Operations API (/api/v1/arc/*). The runner
 * never touches Supabase directly — this is its only seam into app state.
 */

export type ChatReplyInput = {
  agentTaskId: string;
  body: string;
  status?: "complete" | "failed";
  metadata?: Record<string, unknown>;
};

export type QueryParams = Record<string, string | number | undefined | null>;

function toQuery(params: QueryParams | undefined): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function createArcClient(config: Config) {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${config.hermesAgentApiToken}`,
  };

  /** Authenticated GET against the Operations API. Throws on non-2xx or { ok:false }. */
  async function apiGet<T = unknown>(path: string, params?: QueryParams): Promise<T> {
    const res = await fetch(`${config.appApiBaseUrl}${path}${toQuery(params)}`, { headers });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string } & Record<string, unknown>;
    if (!res.ok || json?.ok === false) {
      throw new Error(`GET ${path} -> ${res.status} ${json?.message ?? ""}`.trim());
    }
    return json as T;
  }

  /** Authenticated POST against the Operations API. Throws on non-2xx or { ok:false }. */
  async function apiPost<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${config.appApiBaseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string } & Record<string, unknown>;
    if (!res.ok || json?.ok === false) {
      throw new Error(`POST ${path} -> ${res.status} ${json?.message ?? ""}`.trim());
    }
    return json as T;
  }

  async function postChatReply(input: ChatReplyInput): Promise<void> {
    await apiPost("/api/v1/arc/messages", {
      agentTaskId: input.agentTaskId,
      body: input.body,
      status: input.status ?? "complete",
      metadata: input.metadata ?? {},
    });
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

  return { apiGet, apiPost, postChatReply, postStep };
}

export type ArcClient = ReturnType<typeof createArcClient>;
