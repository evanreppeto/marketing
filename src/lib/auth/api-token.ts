/**
 * Shared bearer-token auth for the v1 API surface.
 *
 * The agent endpoints (e.g. Hermes runs) are `required: true` — they refuse with
 * 503 until a token is configured, then 401 on mismatch. The lead-intake endpoint
 * is `required: false` so it stays open in dev / when no token is set, but is
 * enforced the moment a token IS configured (so configured deployments are closed).
 */

import { verifyAgentToken } from "@/lib/agent/tokens";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type BearerTokenResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; reason: "unauthorized" | "not_configured" };

type HeaderCarrier = { headers: { get(name: string): string | null } };

export function checkBearerToken(
  request: HeaderCarrier,
  envVarName: string,
  options: { required?: boolean } = {},
): BearerTokenResult {
  const required = options.required ?? true;
  const configured = process.env[envVarName];

  if (!configured) {
    // No token set: agent endpoints refuse; the public-ish intake endpoint allows.
    return required ? { ok: false, status: 503, reason: "not_configured" } : { ok: true };
  }

  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${configured}`) {
    return { ok: false, status: 401, reason: "unauthorized" };
  }

  return { ok: true };
}

type AgentBearerDeps = {
  verify: (plaintext: string) => Promise<{ ok: boolean }>;
  /** True when an env token OR Supabase (where DB tokens live) is configured. */
  anyConfigured: () => Promise<boolean>;
};

const DEFAULT_DEPS: AgentBearerDeps = {
  verify: (p) => verifyAgentToken(p),
  anyConfigured: async () => Boolean(process.env.HERMES_AGENT_API_TOKEN) || isSupabaseAdminConfigured(),
};

/**
 * Bearer auth for the agent (Hermes) API surface. Accepts the env
 * HERMES_AGENT_API_TOKEN (back-compat) OR any non-revoked app-issued DB token.
 * 503 when nothing is configured; 401 on mismatch.
 */
export async function checkAgentBearer(
  request: HeaderCarrier,
  deps: AgentBearerDeps = DEFAULT_DEPS,
): Promise<BearerTokenResult> {
  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : null;

  const envToken = process.env.HERMES_AGENT_API_TOKEN;
  if (envToken && presented === envToken) return { ok: true };

  if (presented) {
    const r = await deps.verify(presented);
    if (r.ok) return { ok: true };
  }

  if (!(await deps.anyConfigured())) return { ok: false, status: 503, reason: "not_configured" };
  return { ok: false, status: 401, reason: "unauthorized" };
}
