import { NextResponse } from "next/server";

import { serializeOAuthBundle } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { writeConnectorCredential } from "@/lib/connectors/credentials";
import { exchangeCode, HUBSPOT_OAUTH } from "@/lib/connectors/hubspot-oauth";
import { setConnectorCredentialRef, setConnectorEnabled } from "@/lib/connectors/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { HUBSPOT_OAUTH_COOKIE } from "../authorize/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function origin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

function done(base: string, hs: string): NextResponse {
  const response = NextResponse.redirect(`${base}/settings?s=connections&c=hubspot-import&hs=${encodeURIComponent(hs)}`);
  response.cookies.delete({ name: HUBSPOT_OAUTH_COOKIE, path: "/api/connectors/hubspot" });
  return response;
}

type FlowState = { state: string; workspaceId: string; orgId: string | null };

/**
 * Complete the HubSpot "Connect" OAuth flow: validate state against the httpOnly
 * cookie, exchange the code (confidential — client_secret in the body) for tokens,
 * and store the refresh bundle on the workspace's `hubspot-import` connector
 * (enabled). The bundle carries clientSecret + clientId + the HubSpot token
 * endpoint so the shared oauth-refresh path auto-renews it. Redirects back to
 * Settings → Connections with a success/error marker.
 */
export async function GET(request: Request): Promise<NextResponse> {
  await requireOperator();
  const base = origin(request);
  const url = new URL(request.url);

  const providerError = url.searchParams.get("error");
  if (providerError) return done(base, providerError.slice(0, 40));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const raw = request.headers.get("cookie")?.match(/(?:^|;\s*)hs_oauth=([^;]+)/)?.[1];
  if (!code || !state || !raw) return done(base, "missing_params");

  let flow: FlowState;
  try {
    flow = JSON.parse(decodeURIComponent(raw)) as FlowState;
  } catch {
    return done(base, "bad_state");
  }
  if (flow.state !== state) return done(base, "state_mismatch");

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return done(base, "env_not_set");
  if (!isSupabaseAdminConfigured()) return done(base, "not_configured");

  const redirectUri = `${base}/api/connectors/hubspot/callback`;
  const exchanged = await exchangeCode({ code, redirectUri, clientId, clientSecret });
  if (!exchanged.ok) return done(base, "exchange_failed");

  const bundle = serializeOAuthBundle({
    kind: "oauth_refresh",
    accessToken: exchanged.tokens.accessToken,
    refreshToken: exchanged.tokens.refreshToken,
    expiresAt: exchanged.tokens.expiresAt,
    clientId,
    clientSecret,
    tokenEndpoint: HUBSPOT_OAUTH.tokenEndpoint,
  });

  try {
    const client = getSupabaseAdminClient();
    const credentialRef = await writeConnectorCredential(client, { workspaceId: flow.workspaceId, connectorKey: "hubspot-import", plaintext: bundle });
    await setConnectorCredentialRef(client, { workspaceId: flow.workspaceId, orgId: flow.orgId, connectorKey: "hubspot-import", credentialRef });
    await setConnectorEnabled(client, { workspaceId: flow.workspaceId, connectorKey: "hubspot-import", enabled: true });
  } catch {
    return done(base, "store_failed");
  }

  return done(base, "connected");
}
