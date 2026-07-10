import { type SupabaseClient } from "@supabase/supabase-js";

import {
  applyRefreshResponse,
  buildRefreshRequest,
  isAccessTokenStale,
  parseConnectorCredential,
  serializeOAuthBundle,
  type OAuthRefreshBundle,
  type OAuthTokenResponse,
} from "@/domain";

import { readConnectorCredential, updateConnectorCredential } from "./credentials";

export type EnsureFreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "needs_reconnect"; error: string };

/**
 * Return a valid Higgsfield access token, refreshing it via the OAuth token
 * endpoint when stale and best-effort-persisting the new bundle into the Vault
 * secret in place. Refresh failure → needs_reconnect (caller drops the connector).
 */
export async function ensureFreshAccessToken(
  client: SupabaseClient,
  credentialRef: string | null,
  bundle: OAuthRefreshBundle,
): Promise<EnsureFreshResult> {
  const now = Date.now();
  if (!isAccessTokenStale(bundle, now)) {
    return { ok: true, accessToken: bundle.accessToken };
  }

  const { url, body } = buildRefreshRequest(bundle);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: "needs_reconnect", error: `refresh failed (${res.status}): ${detail.slice(0, 200)}` };
    }
    const json = (await res.json()) as OAuthTokenResponse;
    if (!json.access_token) {
      return { ok: false, reason: "needs_reconnect", error: "refresh response missing access_token" };
    }
    const next = applyRefreshResponse(bundle, json, Date.now());
    await updateConnectorCredential(client, credentialRef, serializeOAuthBundle(next)); // best-effort
    return { ok: true, accessToken: next.accessToken };
  } catch (error) {
    return { ok: false, reason: "needs_reconnect", error: error instanceof Error ? error.message : "refresh error" };
  }
}

export type ResolveTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "missing" | "needs_reconnect"; error?: string };

/**
 * Resolve a stored connector credential ref to a usable bearer access token. A
 * bare token (manually pasted) is returned as-is; an `oauth_refresh` bundle (from a
 * one-click OAuth connect) is auto-renewed in place via ensureFreshAccessToken and
 * the fresh access token returned. This is what lets a pasted token and a
 * one-click OAuth connection behave identically at every point a workspace's
 * connector token is handed to a provider (e.g. the HubSpot import + connection
 * test), while the provider modules keep consuming a plain token.
 */
export async function resolveConnectorAccessToken(
  client: SupabaseClient,
  ref: string | null,
): Promise<ResolveTokenResult> {
  const raw = await readConnectorCredential(client, ref);
  if (!raw) return { ok: false, reason: "missing" };
  const cred = parseConnectorCredential(raw);
  if (cred.kind === "oauth_refresh") {
    const fresh = await ensureFreshAccessToken(client, ref, cred);
    if (!fresh.ok) return { ok: false, reason: "needs_reconnect", error: fresh.error };
    return { ok: true, accessToken: fresh.accessToken };
  }
  return { ok: true, accessToken: cred.token };
}
