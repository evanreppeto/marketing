/**
 * Shared bearer-token auth for the v1 API surface.
 *
 * The agent endpoints (e.g. Hermes runs) are `required: true` — they refuse with
 * 503 until a token is configured, then 401 on mismatch. The lead-intake endpoint
 * is `required: false` so it stays open in dev / when no token is set, but is
 * enforced the moment a token IS configured (so configured deployments are closed).
 */

import { hasActiveAgentTokens, verifyAgentToken, type VerifyAgentTokenResult } from "@/lib/agent/tokens";
import { recordAgentSeen } from "@/lib/agent/health";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

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
  verify?: (plaintext: string) => Promise<VerifyAgentTokenResult>;
  anyConfigured?: () => Promise<boolean>;
  recordSeen?: () => Promise<void>;
};

function bearerValue(request: HeaderCarrier): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length);
}

async function anyAgentTokenConfigured(): Promise<boolean> {
  if (process.env.HERMES_AGENT_API_TOKEN) return true;
  if (!isSupabaseAdminConfigured()) return false;
  try {
    return await hasActiveAgentTokens(getSupabaseAdminClient());
  } catch {
    return false;
  }
}

async function verifyConfiguredAgentToken(plaintext: string): Promise<VerifyAgentTokenResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false };
  try {
    return await verifyAgentToken(plaintext, getSupabaseAdminClient());
  } catch {
    return { ok: false };
  }
}

/**
 * Agent bearer gate for /api/v1/hermes. Back-compat env token wins, then
 * app-issued hashed DB tokens are accepted when configured.
 */
export async function checkAgentBearer(request: HeaderCarrier, deps: AgentBearerDeps = {}): Promise<BearerTokenResult> {
  const token = bearerValue(request);
  const envToken = process.env.HERMES_AGENT_API_TOKEN;
  const verify = deps.verify ?? verifyConfiguredAgentToken;
  const anyConfigured = deps.anyConfigured ?? anyAgentTokenConfigured;
  const recordSeen = deps.recordSeen ?? recordAgentSeen;

  if (token && envToken && token === envToken) {
    await recordSeen().catch(() => undefined);
    return { ok: true };
  }

  if (token) {
    const verified = await verify(token);
    if (verified.ok) {
      await recordSeen().catch(() => undefined);
      return { ok: true };
    }
  }

  if (!(await anyConfigured())) {
    return { ok: false, status: 503, reason: "not_configured" };
  }

  return { ok: false, status: 401, reason: "unauthorized" };
}
