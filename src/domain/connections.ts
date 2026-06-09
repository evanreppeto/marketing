// Pure, deterministic logic for outbound connections (Resend + social).
// No I/O. Secrets live in env vars; this module never reads process.env.

export type ConnectionProvider = "resend" | "instagram" | "facebook" | "linkedin" | "x";
export type ConnectionKind = "email" | "social";

/** Derived status surfaced to operators — never persisted (see read-model). */
export type ConnectionStatus = "not_configured" | "disabled" | "error" | "connected";

export type ConnectionRegistryEntry = {
  provider: ConnectionProvider;
  kind: ConnectionKind;
  label: string;
  /** Env var that supplies the secret, or null for providers without one yet (social). */
  envVar: string | null;
};

/** Canonical list of connectable providers. Seeded into the `connections` table. */
export const CONNECTION_REGISTRY: ConnectionRegistryEntry[] = [
  { provider: "resend", kind: "email", label: "Resend", envVar: "RESEND_API_KEY" },
  { provider: "instagram", kind: "social", label: "Instagram", envVar: null },
  { provider: "facebook", kind: "social", label: "Facebook", envVar: null },
  { provider: "linkedin", kind: "social", label: "LinkedIn", envVar: null },
  { provider: "x", kind: "social", label: "X", envVar: null },
];

/**
 * Compute the operator-facing status from the env secret presence, the operator
 * kill-switch, and the last connection-test result. Precedence: a missing secret
 * always wins (not_configured); a disabled switch beats test state; an untested
 * connection (lastTestOk null) is treated as connected once enabled.
 */
export function computeConnectionStatus(input: {
  envPresent: boolean;
  enabled: boolean;
  lastTestOk: boolean | null;
}): ConnectionStatus {
  if (!input.envPresent) return "not_configured";
  if (!input.enabled) return "disabled";
  if (input.lastTestOk === false) return "error";
  return "connected";
}

export type ResendEmailInput = {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
};

export type ResendEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
};

/**
 * Pure: validate + normalize an email into a Resend `POST /emails` body. Throws on
 * missing required fields so the executor records a clean failure rather than
 * handing Resend a malformed request.
 */
export function buildResendEmailPayload(input: ResendEmailInput): ResendEmailPayload {
  const from = input.from?.trim();
  if (!from) throw new Error("buildResendEmailPayload: from is required.");

  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((address) => address?.trim())
    .filter((address): address is string => Boolean(address));
  if (recipients.length === 0) throw new Error("buildResendEmailPayload: at least one recipient is required.");

  const subject = input.subject?.trim();
  if (!subject) throw new Error("buildResendEmailPayload: subject is required.");

  const html = input.html?.trim();
  const text = input.text?.trim();
  if (!html && !text) throw new Error("buildResendEmailPayload: an html or text body is required.");

  return {
    from,
    to: recipients,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
  };
}

/** Stable idempotency key for an outbound dispatch — same inputs, same key. */
export function resolveDispatchIdempotencyKey(parts: {
  provider: string;
  channel: string;
  approvalItemId: string;
}): string {
  return `${parts.provider}:${parts.channel}:${parts.approvalItemId}`;
}
