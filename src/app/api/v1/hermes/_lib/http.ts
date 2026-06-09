import { NextResponse } from "next/server";

import { checkBearerToken } from "@/lib/auth/api-token";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Shared guards + response helpers for the Mark Operations API
 * (/api/v1/hermes/*). Folder is underscore-prefixed so Next.js treats it as a
 * private module, not a route. House response style: { ok, status, ... } and
 * { ok:false, status, message }. Secrets are never echoed back.
 */

/** Bearer-token gate. Returns an error response, or null when authorized. */
export function bearerGuard(request: Request): NextResponse | null {
  const auth = checkBearerToken(request, "HERMES_AGENT_API_TOKEN");
  if (auth.ok) return null;
  return NextResponse.json(
    auth.reason === "not_configured"
      ? {
          ok: false,
          status: "not_configured",
          message: "Set HERMES_AGENT_API_TOKEN before using the Mark Operations API.",
        }
      : { ok: false, status: "unauthorized", message: "The Mark Operations API requires a valid bearer token." },
    { status: auth.status },
  );
}

/** Supabase-configured gate. Returns a 503 response, or null when configured. */
export function supabaseGuard(): NextResponse | null {
  if (isSupabaseAdminConfigured()) return null;
  return NextResponse.json(
    {
      ok: false,
      status: "not_configured",
      message: "Supabase admin env vars are required for the Mark Operations API.",
    },
    { status: 503 },
  );
}

/** Bearer + Supabase guard in one call (the common case). */
export function guard(request: Request): NextResponse | null {
  return bearerGuard(request) ?? supabaseGuard();
}

export function ok(payload: Record<string, unknown>, httpStatus = 200): NextResponse {
  return NextResponse.json({ ok: true, status: "ok", ...payload }, { status: httpStatus });
}

export function fail(status: string, message: string, httpStatus: number): NextResponse {
  return NextResponse.json({ ok: false, status, message }, { status: httpStatus });
}

/** Parse a JSON body, returning the sentinel `INVALID_JSON` on malformed input. */
export const INVALID_JSON = Symbol("invalid-json");

export async function readJson(request: Request): Promise<unknown | typeof INVALID_JSON> {
  try {
    return await request.json();
  } catch {
    return INVALID_JSON;
  }
}
