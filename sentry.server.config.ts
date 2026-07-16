// Sentry init for the Node.js server runtime. Loaded by src/instrumentation.ts's
// register() when NEXT_RUNTIME === "nodejs". Inert without a DSN — see
// src/lib/observability/sentry-options.ts for why that's the default posture.
import * as Sentry from "@sentry/nextjs";

import { sentryBaseOptions } from "@/lib/observability/sentry-options";

Sentry.init({ ...sentryBaseOptions });
