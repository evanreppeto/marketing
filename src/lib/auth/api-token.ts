/**
 * Shared bearer-token auth for the v1 API surface.
 *
 * The agent endpoints (e.g. Hermes runs) are `required: true` — they refuse with
 * 503 until a token is configured, then 401 on mismatch. The lead-intake endpoint
 * is `required: false` so it stays open in dev / when no token is set, but is
 * enforced the moment a token IS configured (so configured deployments are closed).
 */

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
