import { createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";

import { BSR_CONTEXT } from "./business-context";
import { buildSystemPrompt, formatHistory, modelForRoute, type ArcTurnContext } from "./context";
import type { ArcClient } from "./arc-client";
import { ARC_SYSTEM_PROMPT } from "./prompt";
import { allowedToolNames, toolsForMode, type ArcMode, type ToolContext } from "./tools";
import type {
  ArcActionCard,
  ArcMention,
  ArcOpportunityDraftPayload,
  ArcQuestion,
  MarkChatMessagePayload,
} from "./types";
import type { StepFn, TurnSink } from "./tools/helpers";

/** What one Arc turn produces: the reply text plus what it attached (cards, suggestions, sources, questions). */
export type ArcTurnResult = {
  body: string;
  actions: ArcActionCard[];
  suggestions: string[];
  sources: ArcMention[];
  questions: ArcQuestion[];
};

/**
 * Run one Arc turn via the Claude Agent SDK and return the final reply text.
 *
 * Stateless per call: all scope/context comes from `payload`, nothing is held in
 * module state, so concurrent chats are independent runs. Memory is the bounded
 * `payload.history` injected as a prompt preamble. The model is chosen by
 * `payload.route`; the system prompt is composed from the business context, the
 * operator's mode, behavior hints, conversation scope, and any @-mentions.
 *
 * Tools: the tool surface is gated by `payload.mode` (ask = read-only; act/draft
 * add CRM-interaction + brain writes). Each tool reports a running -> done step
 * to the chat bubble, producing the live trace. Outbound has no tool in any mode.
 */
/** Fresh per-turn collectors plus the sink that feeds them. */
function makeSink() {
  const actions: ArcActionCard[] = [];
  const suggestions: string[] = [];
  const sources: ArcMention[] = [];
  const questions: ArcQuestion[] = [];
  const sink: TurnSink = {
    card: (card) => actions.push(card),
    suggestion: (text) => suggestions.push(text),
    source: (mention) => sources.push(mention),
    question: (question) => questions.push(question),
  };
  return { actions, suggestions, sources, questions, sink };
}

/**
 * Drive one Agent SDK query loop and assemble the ArcTurnResult. Shared by
 * runArcTurn (chat) and runArcOpportunityDraft (opportunity drafting): both
 * build their own ctx/prompt/tools, then hand off the same machinery here.
 */
async function runArcQuery(opts: {
  step: StepFn;
  mode: ArcMode;
  ctx: ArcTurnContext;
  client: ArcClient;
  prompt: string;
  model: string;
  toolContext?: ToolContext;
}): Promise<ArcTurnResult> {
  const { actions, suggestions, sources, questions, sink } = makeSink();

  const tools = toolsForMode(opts.mode, opts.client, opts.step, sink, opts.toolContext ?? {});
  const arcServer = createSdkMcpServer({ name: "arc", version: "1.0.0", tools });
  const system = buildSystemPrompt(ARC_SYSTEM_PROMPT, opts.ctx);

  let assistantText = "";
  let resultText = "";

  for await (const message of query({
    prompt: opts.prompt,
    options: {
      systemPrompt: system,
      model: opts.model,
      mcpServers: { arc: arcServer },
      allowedTools: allowedToolNames(opts.mode),
      permissionMode: "bypassPermissions",
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") assistantText += block.text;
      }
    } else if (message.type === "result" && message.subtype === "success") {
      resultText = message.result;
    }
  }

  return {
    body: (resultText || assistantText).trim(),
    actions,
    suggestions: suggestions.slice(0, 4),
    sources,
    questions: questions.slice(0, 4),
  };
}

export async function runArcTurn(payload: MarkChatMessagePayload, client: ArcClient): Promise<ArcTurnResult> {
  const step = (label: string, status: "running" | "done") => client.postStep(payload.agentTaskId, label, status);

  const ctx: ArcTurnContext = {
    business: BSR_CONTEXT,
    mode: payload.mode,
    scope: {
      conversationId: payload.conversationId,
      projectId: payload.projectId,
      campaignId: payload.campaignId,
      operator: payload.operator,
    },
    mentions: payload.mentions,
    assistantTone: payload.assistantTone,
    assistantResponseStyle: payload.assistantResponseStyle,
    approvalStrictness: payload.approvalStrictness,
  };

  const preamble = formatHistory(payload.history);
  const prompt = preamble ? `${preamble}\n\nCurrent message:\n${payload.message}` : payload.message;

  return runArcQuery({
    step,
    mode: payload.mode,
    ctx,
    client,
    prompt,
    model: modelForRoute(payload.route),
  });
}

/**
 * Run an Arc turn for an `arc_opportunity_draft` wake: DRAFT mode, the briefing
 * `message` used verbatim as the prompt (no history/preamble), and the
 * opportunityId threaded into the draft tool so the created campaign asset links
 * back to the opportunity. Standard route (Opus) — drafting is heavier work.
 */
export async function runArcOpportunityDraft(
  payload: ArcOpportunityDraftPayload,
  client: ArcClient,
): Promise<ArcTurnResult> {
  const step = (label: string, status: "running" | "done") => client.postStep(payload.agentTaskId, label, status);

  const ctx: ArcTurnContext = {
    business: BSR_CONTEXT,
    mode: "draft",
    scope: {
      conversationId: payload.opportunityId,
      projectId: null,
      campaignId: null,
      operator: payload.operator,
    },
    mentions: [],
  };

  return runArcQuery({
    step,
    mode: "draft",
    ctx,
    client,
    prompt: payload.message,
    model: modelForRoute("standard"),
    toolContext: { opportunityId: payload.opportunityId },
  });
}
