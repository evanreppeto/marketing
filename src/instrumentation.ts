import * as Sentry from "@sentry/nextjs";

/**
 * Server-side instrumentation (Next 16 file convention). `register` runs once per
 * server instance before it serves traffic; the runtime split is required because
 * the edge bundle can't load the Node SDK.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Report server errors Next catches — Server Components, route handlers, server
 * actions, and proxy (Next 16's renamed middleware). Without this, a thrown
 * server action is a 500 the operator sees and nobody else ever does.
 *
 * Sentry no-ops when disabled, so this stays safe with no DSN configured.
 */
export const onRequestError = Sentry.captureRequestError;
