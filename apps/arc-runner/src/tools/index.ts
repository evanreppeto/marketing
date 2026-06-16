import type { ArcClient } from "../arc-client";
import { crmReadTools } from "./crm";
import { brainReadTools, brainWriteTools } from "./brain";
import { campaignReadTools } from "./campaigns";
import { interactionWriteTools } from "./interactions";
import { emitCardTool } from "./cards";
import type { StepFn } from "./helpers";
import type { ArcActionCard } from "../types";

export type ArcMode = "ask" | "act" | "draft";

/** Anything Arc may call to read app state, plus emit_card. Available in every mode. */
function readTools(client: ArcClient, step: StepFn, collectCard: (card: ArcActionCard) => void) {
  return [
    ...crmReadTools(client, step),
    ...brainReadTools(client, step),
    ...campaignReadTools(client, step),
    emitCardTool(collectCard),
  ];
}

/** Append-only writes: CRM interactions + brain observations. act/draft only. */
function writeTools(client: ArcClient, step: StepFn) {
  return [...brainWriteTools(client, step), ...interactionWriteTools(client, step)];
}

/**
 * The tool set for a turn, gated by operator mode:
 *   ask   → read only (+ emit_card)
 *   act   → read + writes (CRM interactions, brain observations)
 *   draft → same as act in this plan (draft work products arrive in Plan 4)
 * Outbound has no tool in any mode.
 */
export function toolsForMode(
  mode: ArcMode,
  client: ArcClient,
  step: StepFn,
  collectCard: (card: ArcActionCard) => void,
) {
  const read = readTools(client, step, collectCard);
  // Fresh array via spread (not push) so the element type widens to the union of
  // read+write tool definitions — the SDK tool types are invariant in their
  // Zod schema, so pushing write tools into a read-typed array won't compile.
  return mode === "ask" ? [...read] : [...read, ...writeTools(client, step)];
}

/** The `allowedTools` list the SDK expects — each tool namespaced under the `arc` MCP server. */
export function allowedToolNames(mode: ArcMode): string[] {
  // Build from the same source of truth; dummies are fine — we only read names.
  const noop = (async () => {}) as StepFn;
  const placeholder = {} as ArcClient;
  const noCollect = () => {};
  return toolsForMode(mode, placeholder, noop, noCollect).map((t) => `mcp__arc__${t.name}`);
}
