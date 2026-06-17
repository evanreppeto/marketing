import type { ArcClient } from "../arc-client";
import { crmReadTools } from "./crm";
import { brainReadTools, brainWriteTools } from "./brain";
import { campaignReadTools } from "./campaigns";
import { interactionWriteTools } from "./interactions";
import { emitCardTool } from "./cards";
import { draftWorkProductTools } from "./drafts";
import { mediaTools } from "./media";
import { suggestFollowupsTool, citeSourcesTool } from "./reply-meta";
import type { StepFn, TurnSink } from "./helpers";

export type ArcMode = "ask" | "act" | "draft";

/** Read app state + reply-shaping tools (cards, suggestions, sources). Available in every mode. */
function readTools(client: ArcClient, step: StepFn, sink: TurnSink) {
  return [
    ...crmReadTools(client, step),
    ...brainReadTools(client, step),
    ...campaignReadTools(client, step),
    emitCardTool(sink.card),
    suggestFollowupsTool(sink.suggestion),
    citeSourcesTool(sink.source),
  ];
}

/** Append-only writes: CRM interactions + brain observations. act/draft only. */
function writeTools(client: ArcClient, step: StepFn) {
  return [...brainWriteTools(client, step), ...interactionWriteTools(client, step)];
}

/** Draft work products: create approval-gated campaign assets. draft mode only. */
function draftTools(client: ArcClient, step: StepFn, sink: TurnSink) {
  return [...draftWorkProductTools(client, step, sink.card), ...mediaTools(client, step, sink.card)];
}

/**
 * The tool set for a turn, gated by operator mode:
 *   ask         → read + reply-shaping (emit_card, suggest_followups, cite_sources) only
 *   act / draft → + writes (CRM interactions, brain observations)
 *                 + draft work products (create approval-gated campaign assets, generate images)
 * Act and draft share the same capabilities — both "create approval-ready records"
 * (matching the Act mode label); they differ only in how Arc is framed to work.
 * Outbound has no tool in any mode; every work product stays approval-gated.
 */
export function toolsForMode(mode: ArcMode, client: ArcClient, step: StepFn, sink: TurnSink) {
  // Fresh arrays via spread (not push) so the element type widens to the union of
  // tool definitions — the SDK tool types are invariant in their Zod schema, so
  // pushing differently-typed tools into a narrowed array won't compile.
  const read = readTools(client, step, sink);
  if (mode === "ask") return [...read];
  const write = writeTools(client, step);
  return [...read, ...write, ...draftTools(client, step, sink)];
}

/** The `allowedTools` list the SDK expects — each tool namespaced under the `arc` MCP server. */
export function allowedToolNames(mode: ArcMode): string[] {
  // Build from the same source of truth; dummies are fine — we only read names.
  const noop = (async () => {}) as StepFn;
  const placeholder = {} as ArcClient;
  const sink: TurnSink = { card: () => {}, suggestion: () => {}, source: () => {} };
  return toolsForMode(mode, placeholder, noop, sink).map((t) => `mcp__arc__${t.name}`);
}
