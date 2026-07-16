// Sentry init for the Edge runtime — which is where src/proxy.ts (Next 16's
// renamed middleware, and the operator auth gate) runs, so this is the one that
// reports a broken login wall. Loaded by src/instrumentation.ts's register()
// when NEXT_RUNTIME === "edge". Inert without a DSN.
import * as Sentry from "@sentry/nextjs";

import { sentryBaseOptions } from "@/lib/observability/sentry-options";

Sentry.init({ ...sentryBaseOptions });
