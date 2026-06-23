import type { ArcClient } from "../arc-client";
import { crmReadTools } from "./crm";
import { brainReadTools, brainWriteTools } from "./brain";
import { campaignReadTools } from "./campaigns";
import { performanceReadTools } from "./performance";
import { intelligenceTools } from "./intelligence";
import { interactionWriteTools } from "./interactions";
import { crmWriteTools } from "./crm-write";
import { emitCardTool } from "./cards";
import { draftWorkProductTools } from "./drafts";
import { mediaTools } from "./media";
import { libraryReadTools, libraryDraftTools, libraryWriteTools } from "./library";
import { suggestFollowupsTool, citeSourcesTool, askOperatorTool } from "./reply-meta";
import { brandTools } from "./brand";
import { proposeOpportunityTool } from "./opportunities";
import type { StepFn, TurnSink } from "./helpers";
import type { ArcSkill } from "../skills";

export type ArcMode = "ask" | "act" | "draft" | "scan";

/** Extra per-turn context threaded into work-product tools (e.g. the active campaign/opportunity a draft links back to, the Arc level driving media models). */
export type ToolContext = {
  opportunityId?: string;
  level?: "fast" | "standard";
  conversationId?: string | null;
  campaignId?: string | null;
  skill?: ArcSkill | null;
};

/** Read app state + reply-shaping tools (cards, suggestions, sources). Available in every mode. */
function readTools(client: ArcClient, step: StepFn, sink: TurnSink) {
  return [
    ...crmReadTools(client, step),
    ...brainReadTools(client, step),
    ...campaignReadTools(client, step),
    ...performanceReadTools(client, step),
    ...intelligenceTools(client, step),
    ...libraryReadTools(client, step),
    emitCardTool(sink.card),
    suggestFollowupsTool(sink.suggestion),
    citeSourcesTool(sink.source),
    askOperatorTool(sink.question),
  ];
}

/** Direct CRM writes + interactions + brain observations + library organization. act/draft only. */
function writeTools(client: ArcClient, step: StepFn) {
  return [
    ...crmWriteTools(client, step),
    ...brainWriteTools(client, step),
    ...interactionWriteTools(client, step),
    ...libraryWriteTools(client, step),
  ];
}

/** Draft work products: create approval-gated campaign assets + brand learning. act + draft modes (they share capabilities). */
function draftTools(client: ArcClient, step: StepFn, sink: TurnSink, ctx: ToolContext) {
  return [
    ...draftWorkProductTools(client, step, sink.card, ctx),
    ...mediaTools(client, step, sink.card, ctx),
    ...libraryDraftTools(client, step, sink.card),
    ...brandTools(client, step, sink.card),
  ];
}

function filterToolsForSkill<T extends { name: string }>(tools: T[], skill: ArcSkill | null | undefined): T[] {
  if (!skill) return tools;
  const allowed = new Set(skill.allowedTools);
  return tools.filter((tool) => allowed.has(tool.name));
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
export function toolsForMode(
  mode: ArcMode,
  client: ArcClient,
  step: StepFn,
  sink: TurnSink,
  ctx: ToolContext = {},
) {
  // Fresh arrays via spread (not push) so the element type widens to the union of
  // tool definitions — the SDK tool types are invariant in their Zod schema, so
  // pushing differently-typed tools into a narrowed array won't compile.
  const read = readTools(client, step, sink);
  if (mode === "ask") return filterToolsForSkill([...read], ctx.skill);
  if (mode === "scan") return filterToolsForSkill([...read, proposeOpportunityTool(client, step)], ctx.skill);
  const write = writeTools(client, step);
  return filterToolsForSkill([...read, ...write, ...draftTools(client, step, sink, ctx)], ctx.skill);
}

/** The `allowedTools` list the SDK expects — each tool namespaced under the `arc` MCP server. */
export function allowedToolNames(mode: ArcMode, skill?: ArcSkill | null): string[] {
  // Build from the same source of truth; dummies are fine — we only read names.
  const noop = (async () => {}) as StepFn;
  const placeholder = {} as ArcClient;
  const sink: TurnSink = { card: () => {}, suggestion: () => {}, source: () => {}, question: () => {} };
  return toolsForMode(mode, placeholder, noop, sink, { skill }).map((t) => `mcp__arc__${t.name}`);
}
