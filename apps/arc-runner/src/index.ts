import "dotenv/config"; // loads apps/arc-runner/.env before config is read

import { loadConfig } from "./config";
import { createRunnerServer } from "./server";

const config = loadConfig();
const server = createRunnerServer(config);

server.listen(config.port, () => {
  console.log(`[arc-runner] listening on :${config.port}`);
  console.log(`[arc-runner] webhook path: ${config.webhookPath}`);
  console.log(`[arc-runner] app API: ${config.appApiBaseUrl}`);
  console.log(`[arc-runner] model: ${config.model}`);
  console.log(`[arc-runner] auth: ${process.env.CLAUDE_CODE_OAUTH_TOKEN ? "subscription (CLAUDE_CODE_OAUTH_TOKEN)" : "API key"}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
