import { query } from "@anthropic-ai/claude-agent-sdk";

import type { ArcClient } from "./arc-client";
import { buildQueryOptions, inferenceForRoute } from "./inference";
import type { ArcHistoryTurn } from "./types";

/**
 * Chat → durable memory promotion. Distills a stretch of conversation into durable,
 * cross-conversation facts and records them in the Brain as `learning` nodes, so
 * what Arc learns in one chat makes it smarter in every future chat. Runs on the
 * Arc Pulse (fast) tier with no tools — cheap text-in / JSON-out. Best-effort and
 * fire-and-forget: never blocks or breaks a reply.
 */

const EXTRACT_SYSTEM = [
  "You extract DURABLE, cross-conversation facts from a marketing-operations chat between an operator and Arc (their marketing agent).",
  "Keep only things worth remembering in FUTURE, unrelated chats: operator preferences and standing constraints, decisions made, and durable facts learned about the business, its customers, campaigns, or market.",
  "Drop anything conversation-specific, transient, or already obvious. If nothing is durable, return an empty array.",
  'Return ONLY a JSON array (no prose) of objects: [{"label": "<short title>", "fact": "<the durable fact, one sentence>"}]. Max 5 items.',
].join("\n");

/** Pure: render the extraction prompt from a stretch of turns (oldest first). */
export function buildExtractionPrompt(turns: ArcHistoryTurn[]): string {
  const lines = turns.map((t) => `${t.role === "arc" ? "Arc" : "Operator"}: ${t.body}`);
  return ["CONVERSATION TURNS:", ...lines, "", "Return the JSON array of durable facts."].join("\n");
}

export type DurableFact = { label: string; fact: string };

/** Pure: parse the model's JSON output into durable facts, tolerantly. */
export function parseDurableFacts(raw: string): DurableFact[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        const label = typeof o.label === "string" ? o.label.trim() : "";
        const fact = typeof o.fact === "string" ? o.fact.trim() : "";
        return { label, fact };
      })
      .filter((f) => f.label && f.fact)
      .slice(0, 5);
  } catch {
    return [];
  }
}

/** Run the extraction model pass over a stretch of turns. */
export async function extractDurableFacts(turns: ArcHistoryTurn[]): Promise<DurableFact[]> {
  if (turns.length === 0) return [];
  const options = buildQueryOptions({
    inference: inferenceForRoute("fast"),
    systemPrompt: EXTRACT_SYSTEM,
    mcpServers: {},
    allowedTools: [],
  });
  let assistantText = "";
  let resultText = "";
  for await (const message of query({ prompt: buildExtractionPrompt(turns), options })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") assistantText += block.text;
      }
    } else if (message.type === "result" && message.subtype === "success") {
      resultText = message.result;
    }
  }
  return parseDurableFacts(resultText || assistantText);
}

/**
 * Distill the given turns into durable facts and record them as Brain `learning`
 * nodes (non-gated observations, so they're recalled going forward). Best-effort —
 * any failure is swallowed so memory promotion never breaks a turn.
 */
export async function promoteConversationMemory(client: ArcClient, turns: ArcHistoryTurn[]): Promise<void> {
  try {
    const facts = await extractDurableFacts(turns);
    for (const fact of facts) {
      await client
        .apiPost("/api/v1/arc/brain/nodes", {
          kind: "learning",
          label: fact.label,
          body: fact.fact,
          summary: fact.fact,
          confidence: 60,
        })
        .catch(() => undefined);
    }
  } catch {
    // swallow — memory promotion is best-effort
  }
}
