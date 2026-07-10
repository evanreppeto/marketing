import { NextResponse } from "next/server";

import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { buildAuthorizeUrl, generateState } from "@/lib/connectors/hubspot-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const HUBSPOT_OAUTH_COOKIE = "hs_oauth";

/** External origin (behind Vercel's proxy) so the redirect_uri matches what the browser used. */
function origin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

function settingsRedirect(base: string, hs: string): string {
  return `${base}/settings?s=connections&c=hubspot-import&hs=${encodeURIComponent(hs)}`;
}

/**
 * Start the HubSpot "Connect" OAuth flow. Operator-gated. HubSpot is a confidential
 * platform app (env HUBSPOT_CLIENT_ID/SECRET) — no dynamic registration, no PKCE.
 * Generates an anti-CSRF state, stashes the transient flow state in a short-lived
 * httpOnly cookie, and redirects the browser to HubSpot's authorize endpoint. The
 * callback route completes the confidential code exchange (sending client_secret).
 */
export async function GET(request: Request): Promise<NextResponse> {
  await requireOperator();
  const base = origin(request);

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId || !process.env.HUBSPOT_CLIENT_SECRET) {
    return NextResponse.redirect(settingsRedirect(base, "env_not_set"));
  }

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx?.workspaceId) {
    return NextResponse.redirect(settingsRedirect(base, "no_workspace"));
  }

  const redirectUri = `${base}/api/connectors/hubspot/callback`;
  const state = generateState();

  const response = NextResponse.redirect(buildAuthorizeUrl({ clientId, redirectUri, state }));
  response.cookies.set(
    HUBSPOT_OAUTH_COOKIE,
    JSON.stringify({ state, workspaceId: ctx.workspaceId, orgId: ctx.orgId ?? null }),
    { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/connectors/hubspot", maxAge: 600 },
  );
  return response;
}
