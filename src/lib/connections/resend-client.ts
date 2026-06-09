import { type ResendEmailPayload } from "@/domain";

// Thin fetch wrapper over the Resend HTTP API — no SDK dependency. The secret is
// passed in by the caller (resolved from RESEND_API_KEY); this module never reads
// the env directly. Injected into executeResendDispatch so tests can mock the send.

const RESEND_API = "https://api.resend.com";

export type ResendTestResult = { ok: boolean; error?: string };

/** Lightweight authenticated probe used by "Test connection". Never throws. */
export async function testResendConnection(apiKey: string): Promise<ResendTestResult> {
  try {
    const response = await fetch(`${RESEND_API}/domains`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.ok) return { ok: true };
    const body = await response.text();
    return { ok: false, error: `Resend ${response.status}: ${body.slice(0, 200)}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Resend request failed." };
  }
}

/** Send one email via `POST /emails`. Returns the provider message id, or throws. */
export async function sendResendEmail(apiKey: string, payload: ResendEmailPayload): Promise<{ id: string }> {
  const response = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend send failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as { id?: string };
  if (!data.id) throw new Error("Resend send returned no message id.");
  return { id: data.id };
}
