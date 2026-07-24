// Pure validation for waitlist signups — kept side-effect free so the API
// route stays thin and this stays unit-testable.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 254;

export type WaitlistEmailResult = { ok: true; email: string } | { ok: false; error: string };

export function normalizeWaitlistEmail(raw: unknown): WaitlistEmailResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Enter your email address." };
  }
  const email = raw.trim().toLowerCase();
  if (email.length === 0) {
    return { ok: false, error: "Enter your email address." };
  }
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return { ok: false, error: "That doesn't look like a valid email address." };
  }
  return { ok: true, email };
}
