/**
 * Shared Sentry options for every runtime (server, edge, client).
 *
 * Two deliberate choices, both about this app's data:
 *
 * 1. `enabled` is driven by the DSN. No DSN ⇒ Sentry is inert — the same posture
 *    as every other integration here (no Supabase env ⇒ degrade, don't throw), so
 *    local dev, the demo preview, and the env-less CI build are untouched by it.
 *
 * 2. `sendDefaultPii: false`. This is a CRM: request headers carry the operator's
 *    session cookie and URLs carry contact/lead ids. Sentry's default-PII mode
 *    would ship IPs, cookies, and headers to a third party on every error. We want
 *    the stack trace, not the customer data.
 */

export type SentryBaseOptions = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  tracesSampleRate: number;
  sendDefaultPii: false;
  release: string | undefined;
};

/** Already-read env values. The builder takes these rather than `process.env`
 *  itself — see readEnv() for why that distinction is load-bearing. */
export type SentryEnvInput = {
  dsn?: string;
  environment?: string;
  tracesSampleRate?: string;
  release?: string;
  vercelEnv?: string;
  vercelSha?: string;
};

/**
 * Read the env. Every `NEXT_PUBLIC_*` MUST be a literal `process.env.X` member
 * expression, exactly as written here.
 *
 * Next inlines these by find-and-replacing that literal text at build time —
 * `process.env` is not a real object in the browser. Reaching them through a
 * variable (`const env = process.env; env.NEXT_PUBLIC_SENTRY_DSN`, or a function
 * parameter defaulted to `process.env`) leaves nothing to replace, so the client
 * silently gets `undefined` and Sentry stays off no matter what Vercel is set to.
 * Next's own env-vars guide calls this out as explicitly NOT inlined.
 *
 * This is not hypothetical: it shipped that way in #463 and cost a real debugging
 * round. Unit tests can't catch it — Node has a real `process.env`, so it only
 * shows up in the browser bundle. Do not "simplify" this back into a dynamic
 * lookup; sentry-options.inlining.test.ts pins it.
 */
function readEnv(): SentryEnvInput {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    vercelEnv: process.env.VERCEL_ENV,
    vercelSha: process.env.VERCEL_GIT_COMMIT_SHA,
  };
}

/** Traces are sampled low by default — errors are the point; tracing is a bonus
 *  that bills per event. Override per environment without a code change. */
function readTracesSampleRate(raw: string | undefined): number {
  // Empty must mean "unset", not 0: Number("") is 0 — finite and in range — so a
  // blank-but-present env var (easy to create in Vercel) would silently switch
  // tracing off while looking configured.
  const trimmed = raw?.trim();
  if (!trimmed) return 0.1;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.1;
}

/** Pure: already-read env values → options. */
export function buildSentryOptions(input: SentryEnvInput = readEnv()): SentryBaseOptions {
  const dsn = input.dsn?.trim() || undefined;
  return {
    dsn,
    // Explicit rather than implied by a missing DSN: makes the "off" state
    // readable, and keeps a stray DSN from quietly going live somewhere it shouldn't.
    enabled: Boolean(dsn),
    environment: input.environment?.trim() || input.vercelEnv?.trim() || "development",
    tracesSampleRate: readTracesSampleRate(input.tracesSampleRate),
    sendDefaultPii: false,
    // Vercel exposes the deploy SHA; tying events to a release is what makes a
    // stack trace point at a specific line rather than "somewhere in main".
    release: input.release?.trim() || input.vercelSha?.trim() || undefined,
  };
}

export const sentryBaseOptions = buildSentryOptions();
export const isSentryEnabled = sentryBaseOptions.enabled;
