import { NextResponse } from "next/server";

import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { buildAuthorizeUrl, generatePkce, generateState, registerClient } from "@/lib/connectors/higgsfield-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const HF_OAUTH_COOKIE = "hf_oauth";

/** External origin (behind Vercel's proxy) so the redirect_uri matches what the browser used. */
function origin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

function settingsRedirect(base: string, hf: string): string {
  return `${base}/settings?s=connections&c=higgsfield&hf=${encodeURIComponent(hf)}`;
}

/**
 * Start the Higgsfield "Connect" OAuth flow. Operator-gated. Dynamically
 * registers a public client, generates PKCE + state, stashes the transient flow
 * state in a short-lived httpOnly cookie, and redirects the browser to
 * Higgsfield's authorize endpoint. The callback route completes the exchange.
 */
export async function GET(request: Request): Promise<NextResponse> {
  await requireOperator();
  const base = origin(request);

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx?.workspaceId) {
    return NextResponse.redirect(settingsRedirect(base, "no_workspace"));
  }

  const redirectUri = `${base}/api/connectors/higgsfield/callback`;
  const registered = await registerClient(redirectUri, `Arc — ${ctx.orgName ?? "workspace"}`);
  if (!registered.ok) {
    return NextResponse.redirect(settingsRedirect(base, "register_failed"));
  }

  const { verifier, challenge } = generatePkce();
  const state = generateState();

  const response = NextResponse.redirect(
    buildAuthorizeUrl({ clientId: registered.clientId, redirectUri, challenge, state }),
  );
  response.cookies.set(
    HF_OAUTH_COOKIE,
    JSON.stringify({ state, verifier, clientId: registered.clientId, workspaceId: ctx.workspaceId, orgId: ctx.orgId ?? null }),
    { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/connectors/higgsfield", maxAge: 600 },
  );
  return response;
}
