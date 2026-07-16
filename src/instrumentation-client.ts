// Client-side instrumentation (Next 16 file convention): runs before the app
// becomes interactive. Inert without a DSN — the SDK is still bundled, but it
// initializes disabled and sends nothing.
import * as Sentry from "@sentry/nextjs";

import { sentryBaseOptions } from "@/lib/observability/sentry-options";

Sentry.init({
  ...sentryBaseOptions,
  // Replay/session recording is deliberately NOT enabled: it would record the
  // operator's screen — real contacts, leads, and revenue — into a third party.
  integrations: [],
});

/** Lets Sentry tie an error to the navigation that caused it. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
