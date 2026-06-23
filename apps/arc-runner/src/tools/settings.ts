import { tool } from "@anthropic-ai/claude-agent-sdk";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Read-only workspace settings. Closes Arc's Settings blind spot: connectors and
 * their status, Brand Kit status + identity, the compliance / restricted-claims
 * list, and configured personas. Available in every mode. Changing settings is
 * human-only — there is no write tool here by design.
 */
export function settingsReadTools(client: ArcClient, step: StepFn) {
  const getWorkspaceSettings = tool(
    "get_workspace_settings",
    "Read the workspace's settings detail: connectors and their connection status, Brand Kit status + identity, the compliance / restricted-claims list, and the configured personas. Use to answer 'what's connected?', 'is my Brand Kit active?', or 'what can't I claim?' before drafting or recommending. Read-only — changing settings is human-only.",
    {},
    async () =>
      runTool(step, "Reading workspace settings", () =>
        client.apiGet("/api/v1/arc/workspace", { detail: "full" }),
      ),
  );
  return [getWorkspaceSettings];
}
