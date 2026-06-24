import { tool } from "@anthropic-ai/claude-agent-sdk";

import type { ArcClient } from "../arc-client";
import { ARC_APP_MAP } from "../app-map";
import { runTool, type StepFn } from "./helpers";

/**
 * Wayfinding tool: returns Arc's map of the app — every surface, its purpose, its
 * deep-link route, and the tools that read/write it. Available in every mode. The
 * `client` arg is unused (the map is static) but kept for a uniform factory shape.
 */
export function appMapTools(_client: ArcClient, step: StepFn) {
  const getAppMap = tool(
    "get_app_map",
    "Get Arc's map of the app: every operator-facing surface (CRM, Campaigns, Library, Brand, Personas, Brain, Opportunities, Performance, Settings), what each is for, its deep-link route, and which tools read or write it. Use for wayfinding — to know where a capability lives, pick the right tool, or send the operator to the right page via its route (cite the route in an emit_card result row).",
    {},
    async () => runTool(step, "Reading app map", async () => ARC_APP_MAP),
  );
  return [getAppMap];
}
