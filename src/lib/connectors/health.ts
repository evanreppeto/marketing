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

/** Dispatch a credential health check by connector key. */
export async function checkConnectorCredential(connectorKey: string, plaintext: string): Promise<{ ok: boolean; error?: string }> {
  switch (connectorKey) {
    case "higgsfield":
      return checkHiggsfieldToken(plaintext);
    case "gemini-research":
      return checkGeminiKey(plaintext);
    default:
      return { ok: false, error: "No health check is available for this connector yet." };
  }
}
