import * as Sentry from "@sentry/node";

/**
 * Error tracking for the runner.
 *
 * This is the service where a silent failure hurts most: when a run throws, the
 * operator sees "Arc hit an error generating a reply. Check the runner logs." and
 * the actual cause goes to console.error — i.e. Cloud Logging, which nobody is
 * watching. Arc stops working and nothing tells you.
 *
 * Same posture as the app (src/lib/observability/sentry-options.ts):
 *  - inert without a DSN, so local dev and tests are untouched;
 *  - sendDefaultPii: false — runs carry CRM content (contacts, leads, drafts) and
 *    the reply text itself. We want the stack trace, not the customer's data.
 */

export type RunnerSentryOptions = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  tracesSampleRate: number;
  sendDefaultPii: false;
  release: string | undefined;
};

function readTracesSampleRate(raw: string | undefined): number {
  // Empty must mean "unset", not 0: Number("") is 0 — finite and in range — so a
  // blank-but-present var would silently switch tracing off while looking set.
  const trimmed = raw?.trim();
  if (!trimmed) return 0.1;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.1;
}

/** Pure: env → options, so the gating is testable without stubbing module state. */
export function buildRunnerSentryOptions(env: NodeJS.ProcessEnv = process.env): RunnerSentryOptions {
  const dsn = env.SENTRY_DSN?.trim() || undefined;
  return {
    dsn,
    enabled: Boolean(dsn),
    // Cloud Run injects K_SERVICE/K_REVISION; use them rather than guessing.
    environment: env.SENTRY_ENVIRONMENT?.trim() || (env.K_SERVICE ? "production" : "development"),
    tracesSampleRate: readTracesSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
    sendDefaultPii: false,
    release: env.SENTRY_RELEASE?.trim() || env.K_REVISION || undefined,
  };
}

let initialized = false;

/** Call once, before the server starts. No DSN ⇒ Sentry initializes disabled. */
export function initObservability(env: NodeJS.ProcessEnv = process.env): RunnerSentryOptions {
  const options = buildRunnerSentryOptions(env);
  Sentry.init(options);
  initialized = options.enabled;
  return options;
}

/**
 * Report a run failure. The existing console.error stays — Cloud Logging is still
 * the place you tail a live run; this adds the thing that pages you.
 * `context` is deliberately limited to identifiers (task/workspace ids), never
 * the payload or reply body.
 */
export function captureRunnerError(error: unknown, context: Record<string, string | null | undefined> = {}): void {
  if (!initialized) return;
  Sentry.captureException(error, { tags: pruneTags(context) });
}

function pruneTags(context: Record<string, string | null | undefined>): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === "string" && value.length > 0) tags[key] = value;
  }
  return tags;
}

/**
 * Flush pending events before the process exits. Cloud Run SIGTERMs the container
 * on scale-down/redeploy — without this, the very errors that preceded a crash are
 * the ones most likely to be lost.
 */
export async function flushObservability(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.close(timeoutMs).catch(() => undefined);
}
