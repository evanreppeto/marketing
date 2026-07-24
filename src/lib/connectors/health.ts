import { checkHiggsfieldToken } from "./higgsfield-health";

// Provider-specific credential health checks. Each makes a real, minimal call to
// the provider to confirm the stored credential works — never a fabricated pass.

/** Validate a Gemini API key with a lightweight, unbilled models-list request. */
export async function checkGeminiKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (res.status === 200) return { ok: true };
    if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, error: `key rejected (${res.status})` };
    return { ok: false, error: `unexpected status ${res.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "health check error" };
  }
}

/**
 * Validate a GNews API key with a minimal 1-result search. GNews rejects a bad key
 * with 401/403; 429 means the key is valid but throttled (still healthy), so it
 * must not flip the card to error.
 */
export async function checkGnewsKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({ q: "test", lang: "en", max: "1", apikey: key });
    const res = await fetch(`https://gnews.io/api/v4/search?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (res.status === 200 || res.status === 429) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, error: `key rejected (${res.status})` };
    return { ok: false, error: `unexpected status ${res.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "health check error" };
  }
}

/**
 * Probe a firmographic enrichment vendor endpoint with the stored key, mirroring the
 * real lookup shape (`GET {endpoint}?domain=…` + `Authorization: Bearer`). We can't
 * assert the response body (vendor-specific), so any response that isn't an auth
 * rejection counts as reachable; only 401/403 (bad key) or a transport failure fail.
 */
export async function checkEnrichmentEndpoint(endpoint: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, error: "endpoint is not a valid URL" };
  }
  url.searchParams.set("domain", "example.com");
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: `key rejected (${res.status})` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "endpoint unreachable" };
  }
}

/** Dispatch a credential health check by connector key. */
export async function checkConnectorCredential(connectorKey: string, plaintext: string): Promise<{ ok: boolean; error?: string }> {
  switch (connectorKey) {
    case "higgsfield":
      return checkHiggsfieldToken(plaintext);
    case "gemini-research":
    case "gemini-media":
      // Both are Gemini API-key connectors — same key, same validation call.
      return checkGeminiKey(plaintext);
    case "news-search":
      return checkGnewsKey(plaintext);
    default:
      return { ok: false, error: "No health check is available for this connector yet." };
  }
}
