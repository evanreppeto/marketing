/**
 * Secret redaction for agent-supplied content before it is stored or logged.
 *
 * The Mark Operations API accepts free text + metadata from the agent (run-log
 * messages, recommendations, block reasons). Per the security requirement,
 * anything that looks like a credential is scrubbed before it touches the DB or
 * logs. Pure + deterministic so it can be unit-tested.
 */

export const REDACTED = "[REDACTED]";

// Standalone credential shapes -> whole match replaced.
const STANDALONE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-]{6,}/gi, // Authorization: Bearer xxx
  /\beyJ[A-Za-z0-9_\-]{4,}\.[A-Za-z0-9_\-]{4,}\.[A-Za-z0-9_\-]{4,}/g, // JWT
  /\b(?:sk|pk|rk)-[A-Za-z0-9]{12,}/g, // OpenAI/Stripe-style keys
  /\bghp_[A-Za-z0-9]{20,}/g, // GitHub PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
];

// key: value / key=value where the key name implies a secret -> keep the key,
// redact the value (friendlier in logs than nuking the whole line).
const KEYED_PATTERN =
  /\b(api[_-]?key|secret|token|password|passwd|pwd|access[_-]?token|refresh[_-]?token|service[_-]?role[_-]?key|authorization)\b(\s*[:=]\s*)(["']?)[A-Za-z0-9._\-]{4,}\3/gi;

// Object keys that imply the value is a secret -> value redacted wholesale.
const SENSITIVE_KEY =
  /(secret|token|password|passwd|pwd|api[_-]?key|authorization|service[_-]?role|credential)/i;

export function redactSecrets(input: string): string {
  if (!input) return input;
  // Standalone shapes first (so "Bearer <token>" is caught whole before the
  // keyed pass below could nibble just the word "Bearer").
  let out = input;
  for (const pattern of STANDALONE_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  out = out.replace(KEYED_PATTERN, (_match, key: string, sep: string) => `${key}${sep}${REDACTED}`);
  return out;
}

/** Recursively redact strings in a value; redact values under secret-looking keys. */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") {
    return redactSecrets(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactDeep(val);
    }
    return out as unknown as T;
  }
  return value;
}
