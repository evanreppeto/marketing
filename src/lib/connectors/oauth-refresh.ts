import { type SupabaseClient } from "@supabase/supabase-js";

import {
  applyRefreshResponse,
  buildRefreshRequest,
  isAccessTokenStale,
  serializeOAuthBundle,
  type OAuthRefreshBundle,
  type OAuthTokenResponse,
} from "@/domain";

import { updateConnectorCredential } from "./credentials";

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
