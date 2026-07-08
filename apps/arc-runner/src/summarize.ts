import { query } from "@anthropic-ai/claude-agent-sdk";

import { buildQueryOptions, inferenceForRoute } from "./inference";
import type { ArcHistoryTurn } from "./types";

/**
 * Compaction summarizer. Folds older overflow turns into the rolling conversation
 * summary so a long chat keeps its thread without re-sending every turn verbatim —
 * the same "summarize, don't truncate" move Claude chat makes. Runs on the Arc
 * Pulse (fast) tier with no tools: it's a cheap, bounded text-in/text-out call.
 */

const SUMMARY_SYSTEM = [
  "You maintain a durable running summary of an ongoing marketing-operations chat between an operator and Arc (their marketing agent).",
  "Fold the new earlier turns into the existing summary and return the UPDATED summary only — no preamble, no meta-commentary.",
  "Preserve what future turns will need: decisions made, open threads and next steps, operator preferences and constraints, and named entities (campaigns, personas, records, assets) and their state.",
  "Drop small talk and anything already superseded. Be concise and factual — a tight brief, not a transcript. Write in plain prose or terse bullets.",
].join("\n");

/** Pure: render the summarization prompt from the prior summary + overflow turns. */
export function buildSummaryPrompt(priorSummary: string | null, turns: ArcHistoryTurn[]): string {
  const lines = turns.map((t) => `${t.role === "arc" ? "Arc" : "Operator"}: ${t.body}`);
  return [
    priorSummary ? `EXISTING SUMMARY:\n${priorSummary}` : "EXISTING SUMMARY: (none yet)",
    "",
    "NEW EARLIER TURNS TO FOLD IN (oldest first):",
    ...lines,
    "",
    "Return the updated running summary only.",
  ].join("\n");
}

/**
 * Produce an updated rolling summary from the prior summary + overflow turns.
 * Returns the prior summary unchanged if there's nothing to fold or the model
 * yields nothing — callers treat a null/unchanged result as "keep what we had".
 */
export async function summarizeConversation(
  priorSummary: string | null,
  turns: ArcHistoryTurn[],
): Promise<string | null> {
  if (turns.length === 0) return priorSummary;
  const options = buildQueryOptions({
    inference: inferenceForRoute("fast"),
    systemPrompt: SUMMARY_SYSTEM,
    mcpServers: {},
    allowedTools: [],
  });
  let assistantText = "";
  let resultText = "";
  for await (const message of query({ prompt: buildSummaryPrompt(priorSummary, turns), options })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") assistantText += block.text;
      }
    } else if (message.type === "result" && message.subtype === "success") {
      resultText = message.result;
    }
  }
  const summary = (resultText || assistantText).trim();
  return summary || priorSummary;
}
