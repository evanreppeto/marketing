import { createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";

import { resolveBusinessContext } from "./business-context";
import { buildTurnContentAsync } from "./attachments";
import { resolveRecallMemory } from "./recall";
import { buildSystemPrompt, formatHistory, modelForRoute, type ArcTurnContext } from "./context";
import type { ArcClient } from "./arc-client";
import { ARC_SYSTEM_PROMPT } from "./prompt";
import { allowedToolNames, toolsForMode, type ArcMode, type ToolContext } from "./tools";
import { resolveArcSkill, type ArcSkill } from "./skills";
import type {
  ArcActionCard,
  ArcCampaignTaskPayload,
  ArcMention,
  ArcOpportunityDraftPayload,
  ArcOpportunityScanPayload,
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
  usage: { model: string; inputTokens: number | null; outputTokens: number | null };
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
/** Min gap between live partial-body posts, so streaming doesn't hammer the app
 *  endpoint. ~180ms reads as continuous typing once the client typewriter
 *  smooths between chunks. */
const STREAM_THROTTLE_MS = 180;

/** The model input for a turn: a plain string, or content blocks for multimodal. */
type TurnContent = Awaited<ReturnType<typeof buildTurnContentAsync>>;

/** Adapt our turn content into the SDK's prompt input. A plain string stays a
 *  string (unchanged path); content blocks are wrapped in a single streamed
 *  user message so images/documents/text reach the model. */
function promptInput(content: TurnContent, sessionId: string) {
  if (typeof content === "string") return content;
  async function* once() {
    yield {
      type: "user" as const,
      session_id: sessionId,
      parent_tool_use_id: null,
      message: { role: "user" as const, content },
    };
  }
  return once();
}

async function runArcQuery(opts: {
  step: StepFn;
  mode: ArcMode;
  ctx: ArcTurnContext;
  client: ArcClient;
  content: TurnContent;
  model: string;
  toolContext?: ToolContext;
  skill?: ArcSkill | null;
  /** Live partial reply text, posted as the model streams (chat-turn only). */
  onPartial?: (text: string) => void | Promise<void>;
}): Promise<ArcTurnResult> {
  const { actions, suggestions, sources, questions, sink } = makeSink();

  const tools = toolsForMode(opts.mode, opts.client, opts.step, sink, { ...(opts.toolContext ?? {}), skill: opts.skill });
  const arcServer = createSdkMcpServer({ name: "arc", version: "1.0.0", tools });
  const system = buildSystemPrompt(ARC_SYSTEM_PROMPT, opts.ctx);

  let assistantText = "";
  let resultText = "";
  // Live-streaming buffer, accumulated from token deltas purely for the typing
  // effect. The final body is still (resultText || assistantText) below, so if
  // partial events are unavailable the reply is unchanged — streaming is additive.
  let streamBuf = "";
  let lastEmit = 0;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  for await (const message of query({
    prompt: promptInput(opts.content, opts.ctx.scope.conversationId ?? "arc-turn"),
    options: {
      systemPrompt: system,
      model: opts.model,
      mcpServers: { arc: arcServer },
      allowedTools: allowedToolNames(opts.mode, opts.skill),
      permissionMode: "bypassPermissions",
      // Emit SDKPartialAssistantMessage ('stream_event') token deltas so we can
      // type the reply out live; the final assistant/result messages still land.
      includePartialMessages: true,
    },
  })) {
    if (message.type === "stream_event") {
      const event = message.event;
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        streamBuf += event.delta.text;
        const now = Date.now();
        if (opts.onPartial && now - lastEmit >= STREAM_THROTTLE_MS) {
          lastEmit = now;
          // Awaited (not fire-and-forget) so the throttled posts stay ordered;
          // postChatChunk swallows its own errors, so this never breaks the run.
          await opts.onPartial(streamBuf);
        }
      }
    } else if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") assistantText += block.text;
      }
    } else if (message.type === "result" && message.subtype === "success") {
      resultText = message.result;
      const usage = (message as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      if (usage) {
        inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : inputTokens;
        outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : outputTokens;
      }
    }
  }

  return {
    body: (resultText || assistantText).trim(),
    actions,
    suggestions: suggestions.slice(0, 4),
    sources,
    questions: questions.slice(0, 4),
    usage: { model: opts.model, inputTokens, outputTokens },
  };
}

export async function runArcTurn(payload: MarkChatMessagePayload, client: ArcClient): Promise<ArcTurnResult> {
  const step = (label: string, status: "running" | "done") => client.postStep(payload.agentTaskId, label, status);

  const business = await resolveBusinessContext(client);
  const memory = await resolveRecallMemory(client, payload.message);
  const skill = resolveArcSkill(payload.skillId);
  const ctx: ArcTurnContext = {
    business,
    mode: payload.mode,
    scope: {
      conversationId: payload.conversationId,
      projectId: payload.projectId,
      campaignId: payload.campaignId,
      operator: payload.operator,
    },
    mentions: payload.mentions,
    memory,
    assistantTone: payload.assistantTone,
    assistantResponseStyle: payload.assistantResponseStyle,
    approvalStrictness: payload.approvalStrictness,
    skill,
  };

  const preamble = formatHistory(payload.history);
  const text = preamble ? `${preamble}\n\nCurrent message:\n${payload.message}` : payload.message;
  const content = await buildTurnContentAsync(text, payload.attachments);

  return runArcQuery({
    step,
    mode: payload.mode,
    ctx,
    client,
    content,
    model: modelForRoute(payload.route),
    // Thread the turn's level so media tools tell the generate endpoints which
    // tier (Swift=fast / Studio=standard) to resolve image/video models from.
    // Also thread conversationId so draft tools can link the chat to the campaign.
    toolContext: { level: payload.route, conversationId: payload.conversationId },
    skill,
    // Type the reply out live into the pending bubble as the model streams.
    onPartial: (text) => client.postChatChunk(payload.agentTaskId, text),
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

  const business = await resolveBusinessContext(client);
  const memory = await resolveRecallMemory(client, payload.message);
  const skill = resolveArcSkill(payload.skillId);
  const ctx: ArcTurnContext = {
    business,
    mode: "draft",
    scope: {
      conversationId: payload.opportunityId,
      projectId: null,
      campaignId: null,
      operator: payload.operator,
    },
    mentions: [],
    memory,
    skill,
  };

  return runArcQuery({
    step,
    mode: "draft",
    ctx,
    client,
    content: payload.message,
    model: modelForRoute("standard"),
    toolContext: { opportunityId: payload.opportunityId },
    skill,
  });
}

/**
 * Run an Arc turn for an `arc_opportunity_scan` wake: scan tool set (read tools +
 * propose_opportunity only), the scan briefing used verbatim as the prompt. Arc
 * proposes pending opportunities; nothing drafts or goes outbound.
 */
export async function runArcOpportunityScan(
  payload: ArcOpportunityScanPayload,
  client: ArcClient,
): Promise<ArcTurnResult> {
  const step = (label: string, status: "running" | "done") => client.postStep(payload.agentTaskId, label, status);

  const business = await resolveBusinessContext(client);
  const memory = await resolveRecallMemory(client, payload.message);
  const skill = resolveArcSkill(payload.skillId);
  const ctx: ArcTurnContext = {
    business,
    mode: "scan",
    scope: {
      conversationId: payload.agentTaskId,
      projectId: null,
      campaignId: null,
      operator: payload.operator,
    },
    mentions: [],
    memory,
    skill,
  };

  return runArcQuery({
    step,
    mode: "scan",
    ctx,
    client,
    content: payload.message,
    model: modelForRoute("standard"),
    skill,
  });
}

/**
 * Run an Arc turn for a campaign task wake. This is the production path for
 * "Ask Arc to build" and "Hand to Arc": DRAFT mode, fixed campaign scope, and
 * a prompt that keeps all work approval-gated.
 */
export async function runArcCampaignTask(
  payload: ArcCampaignTaskPayload,
  client: ArcClient,
): Promise<ArcTurnResult> {
  const step = (label: string, status: "running" | "done") => client.postStep(payload.agentTaskId, label, status);

  const business = await resolveBusinessContext(client);
  const memory = await resolveRecallMemory(client, payload.message);
  const skill = resolveArcSkill(payload.skillId);
  const ctx: ArcTurnContext = {
    business,
    mode: "draft",
    scope: {
      conversationId: payload.conversationId ?? payload.agentTaskId,
      projectId: null,
      campaignId: payload.campaignId,
      operator: payload.operator,
    },
    mentions: [],
    memory,
    skill,
  };

  const prompt = [
    `Campaign task: ${payload.taskType}.`,
    `Work only on campaign_id "${payload.campaignId}". When creating campaign drafts, attach them to that campaign_id.`,
    "Create approval-gated draft assets only. Do not send, publish, launch, approve, unlock dispatch, or spend.",
    "",
    payload.message,
  ].join("\n");

  return runArcQuery({
    step,
    mode: "draft",
    ctx,
    client,
    content: prompt,
    model: modelForRoute("standard"),
    toolContext: { campaignId: payload.campaignId, conversationId: payload.conversationId },
    skill,
  });
}
