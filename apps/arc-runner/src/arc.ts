import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import { BSR_CONTEXT } from "./business-context";
import { buildSystemPrompt, formatHistory, modelForRoute, type ArcTurnContext } from "./context";
import type { HermesClient } from "./hermes-client";
import { ARC_SYSTEM_PROMPT } from "./prompt";
import type { MarkChatMessagePayload } from "./types";

/**
 * Run one Arc turn via the Claude Agent SDK and return the final reply text.
 *
 * Stateless per call: all scope/context comes from `payload`, nothing is held in
 * module state, so concurrent chats are independent runs. Memory is the bounded
 * `payload.history` injected as a prompt preamble. The model is chosen by
 * `payload.route`; the system prompt is composed from the business context, the
 * operator's mode, behavior hints, conversation scope, and any @-mentions.
 *
 * Tools: Arc gets in-process tools that call the app's API. Each tool reports a
 * running -> done step to the chat bubble, producing the live trace. (Richer
 * tools and action cards arrive in later plans; find_leads is the seed.)
 */
export async function runArcTurn(payload: MarkChatMessagePayload, client: HermesClient): Promise<string> {
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

  const findLeads = tool(
    "find_leads",
    "Search the connected business's CRM leads. Use when the operator asks about leads, opportunities, or who to target. All filters are optional.",
    {
      status: z.string().optional().describe("Lead status, e.g. qualified | new | contacted"),
      persona: z.string().optional().describe("Persona key to filter by"),
      source: z.string().optional().describe("Lead source to filter by"),
      q: z.string().optional().describe("Free-text search across leads"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async (args) => {
      const label = "Searching CRM leads";
      await step(label, "running");
      try {
        const leads = await client.getLeads(args);
        await step(label, "done");
        return { content: [{ type: "text" as const, text: JSON.stringify(leads).slice(0, 8000) }] };
      } catch (error) {
        await step(label, "done");
        const reason = error instanceof Error ? error.message : "unknown error";
        return { content: [{ type: "text" as const, text: `find_leads failed: ${reason}` }] };
      }
    },
  );

  const arcServer = createSdkMcpServer({ name: "arc", version: "1.0.0", tools: [findLeads] });

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
      allowedTools: ["mcp__arc__find_leads"],
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

  return (resultText || assistantText).trim();
}
