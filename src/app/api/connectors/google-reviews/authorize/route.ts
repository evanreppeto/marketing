import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { buildGoogleAuthorizeUrl, googleOAuthClientId, isGoogleOAuthConfigured } from "@/lib/connectors/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GR_OAUTH_COOKIE = "gr_oauth";

function origin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

function settingsRedirect(base: string, gb: string): string {
  return `${base}/settings?s=connections&c=reviews-signals&gb=${encodeURIComponent(gb)}`;
}

/**
 * Start the Google Business Profile "Connect" OAuth flow. Operator-gated: generates
 * a state nonce, stashes the flow state in a short-lived httpOnly cookie, and
 * redirects to Google's authorize endpoint. The callback completes the exchange.
 */
export async function GET(request: Request): Promise<NextResponse> {
  await requireOperator();
  const base = origin(request);

  const clientId = googleOAuthClientId();
  if (!isGoogleOAuthConfigured() || !clientId) {
    return NextResponse.redirect(settingsRedirect(base, "not_configured"));
  }

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx?.workspaceId) {
    return NextResponse.redirect(settingsRedirect(base, "no_workspace"));
  }

  const redirectUri = `${base}/api/connectors/google-reviews/callback`;
  const state = randomUUID();

  const response = NextResponse.redirect(buildGoogleAuthorizeUrl({ clientId, redirectUri, state }));
  response.cookies.set(
    GR_OAUTH_COOKIE,
    JSON.stringify({ state, workspaceId: ctx.workspaceId, orgId: ctx.orgId ?? null }),
    { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/connectors/google-reviews", maxAge: 600 },
  );
  return response;
}
