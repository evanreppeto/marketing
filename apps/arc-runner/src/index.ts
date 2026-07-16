import "dotenv/config"; // loads apps/arc-runner/.env before config is read

// Initialized before the code it instruments, and before loadConfig() — a bad env
// is exactly the kind of boot failure worth reporting. Inert without SENTRY_DSN.
import { captureRunnerError, flushObservability, initObservability } from "./observability";

const sentry = initObservability();

import { loadConfig } from "./config";
import { createRunnerServer } from "./server";
import { inferenceForRoute } from "./inference";

// A crash in a long-running service is the loudest signal there is — report it,
// and flush, rather than let the container vanish with the reason only in Cloud
// Logging. An unhandled rejection doesn't kill the process, so it isn't fatal here.
process.on("uncaughtException", (error) => {
  console.error("[arc-runner] uncaught exception:", error);
  captureRunnerError(error, { kind: "uncaughtException" });
  void flushObservability().finally(() => process.exit(1));
});
process.on("unhandledRejection", (reason) => {
  console.error("[arc-runner] unhandled rejection:", reason);
  captureRunnerError(reason, { kind: "unhandledRejection" });
});

const config = loadConfig();
const server = createRunnerServer(config);

server.listen(config.port, () => {
  console.log(`[arc-runner] listening on :${config.port}`);
  console.log(`[arc-runner] webhook path: ${config.webhookPath}`);
  console.log(`[arc-runner] app API: ${config.appApiBaseUrl}`);
  console.log(
    `[arc-runner] models: fast=${inferenceForRoute("fast").model}, standard=${inferenceForRoute("standard").model}`,
  );
  console.log(`[arc-runner] auth: ${process.env.CLAUDE_CODE_OAUTH_TOKEN ? "subscription (CLAUDE_CODE_OAUTH_TOKEN)" : "API key"}`);
  console.log(`[arc-runner] error tracking: ${sentry.enabled ? `on (${sentry.environment})` : "off (set SENTRY_DSN)"}`);
});

process.on("SIGTERM", () => {
  // Cloud Run SIGTERMs on scale-down/redeploy; flush queued events before exit,
  // or the errors leading up to a shutdown are exactly the ones lost.
  server.close(() => {
    void flushObservability().finally(() => process.exit(0));
  });
});
