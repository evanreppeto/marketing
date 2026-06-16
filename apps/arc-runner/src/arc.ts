import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "./arc-client";
import { ARC_SYSTEM_PROMPT } from "./prompt";

/**
 * Run Arc once via the Claude Agent SDK and return the final reply text.
 *
 * Auth: CLAUDE_CODE_OAUTH_TOKEN (subscription) — read by the SDK automatically.
 *
 * Tools: Arc gets in-process tools that call the app's API. As Arc works, each
 * tool reports a running -> done step to the chat bubble, producing the live
 * chain-of-thought trace. Add more tools to the `tools` array below; each new
 * tool automatically shows up as a step when Arc uses it.
 */
export async function runArc(
  opts: { agentTaskId: string; userMessage: string; model: string },
  client: ArcClient,
): Promise<string> {
  const step = (label: string, status: "running" | "done") =>
    client.postStep(opts.agentTaskId, label, status);

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

  let assistantText = "";
  let resultText = "";

  for await (const message of query({
    prompt: opts.userMessage,
    options: {
      systemPrompt: ARC_SYSTEM_PROMPT,
      model: opts.model,
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
      // The final synthesized answer — preferred over concatenated chunks.
      resultText = message.result;
    }
  }

  return (resultText || assistantText).trim();
}
