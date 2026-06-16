import { createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";

import { BSR_CONTEXT } from "./business-context";
import { buildSystemPrompt, formatHistory, modelForRoute, type ArcTurnContext } from "./context";
import type { ArcClient } from "./arc-client";
import { ARC_SYSTEM_PROMPT } from "./prompt";
import { allowedToolNames, toolsForMode } from "./tools";
import type { ArcActionCard, MarkChatMessagePayload } from "./types";

/** What one Arc turn produces: the reply text plus any cards it attached. */
export type ArcTurnResult = { body: string; actions: ArcActionCard[] };

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
export async function runArcTurn(payload: MarkChatMessagePayload, client: ArcClient): Promise<ArcTurnResult> {
  const step = (label: string, status: "running" | "done") => client.postStep(payload.agentTaskId, label, status);

  const actions: ArcActionCard[] = [];
  const collectCard = (card: ArcActionCard) => actions.push(card);

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

  const tools = toolsForMode(payload.mode, client, step, collectCard);
  const arcServer = createSdkMcpServer({ name: "arc", version: "1.0.0", tools });

  const system = buildSystemPrompt(ARC_SYSTEM_PROMPT, ctx);
  const preamble = formatHistory(payload.history);
  const prompt = preamble ? `${preamble}\n\nCurrent message:\n${payload.message}` : payload.message;

  let assistantText = "";
  let resultText = "";

  for await (const message of query({
    prompt,
    options: {
      systemPrompt: system,
      model: modelForRoute(payload.route),
      mcpServers: { arc: arcServer },
      allowedTools: allowedToolNames(payload.mode),
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

  return { body: (resultText || assistantText).trim(), actions };
}
