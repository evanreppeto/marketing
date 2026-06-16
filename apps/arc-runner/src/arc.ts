import { query } from "@anthropic-ai/claude-agent-sdk";

import { ARC_SYSTEM_PROMPT } from "./prompt";

/**
 * Run Arc once via the Claude Agent SDK and return the final reply text.
 *
 * Auth comes from CLAUDE_CODE_OAUTH_TOKEN in the environment (subscription) — the
 * SDK reads it automatically. No API key in this code path.
 *
 * Phase note: tools are disabled here (fast, pure-reasoning chat replies). Next
 * step is to add tools (find_leads, draft_campaign, …) that call the app's API,
 * turning Arc's chat answers into real records.
 */
export async function runArc(opts: { userMessage: string; model: string }): Promise<string> {
  let finalText = "";

  for await (const message of query({
    prompt: opts.userMessage,
    options: {
      systemPrompt: ARC_SYSTEM_PROMPT,
      model: opts.model,
      allowedTools: [],
      permissionMode: "bypassPermissions",
    },
  })) {
    // The final assistant turn carries the text we send back to the chat.
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") finalText += block.text;
      }
    }
  }

  return finalText.trim();
}
