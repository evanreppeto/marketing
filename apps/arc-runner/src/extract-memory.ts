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
 *
 * Reads the RECENT window each turn, rather than the turns compaction is about to
 * evict. Those are different jobs: compaction only runs once a conversation outgrows
 * the verbatim budget, so hanging promotion off it meant a normal-length chat taught
 * Arc nothing — and what it did eventually mine was the oldest turns, never the
 * exchange that just happened.
 *
 * Windows overlap turn to turn, which is safe: every fact carries a deterministic key
 * and is upserted, so re-extracting the same fact refreshes one node instead of
 * growing a pile of near-duplicates that would crowd real memory out of recall.
 */

/** How many recent turns the extractor reads. Bounds cost per turn at a flat ~N turns
 *  of cheap-tier text however long the conversation runs. Wider than the per-turn
 *  stride on purpose: a fact stays in view for several turns, so a single missed pass
 *  can't lose it. */
const PROMOTION_WINDOW_TURNS = 8;

/** An exchange is the smallest thing worth distilling — a lone operator line with no
 *  reply has no context to read against. */
const MIN_PROMOTION_TURNS = 2;

const EXTRACT_SYSTEM = [
  "You extract DURABLE, cross-conversation facts from a marketing-operations chat between an operator and Arc (their marketing agent).",
  "Keep only things worth remembering in FUTURE, unrelated chats: operator preferences and standing constraints, decisions made, and durable facts learned about the business, its customers, campaigns, or market.",
  "Drop anything conversation-specific, transient, or already obvious. If nothing is durable, return an empty array.",
  "Prefer a stable, canonical label for a given fact — the same fact seen again should get the same label, so it updates one memory instead of creating a second.",
  'Return ONLY a JSON array (no prose) of objects: [{"label": "<short title>", "fact": "<the durable fact, one sentence>"}]. Max 5 items.',
].join("\n");

/** Pure: the recent turns to distil — non-empty, newest-last, bounded. */
export function selectPromotionWindow(turns: ArcHistoryTurn[]): ArcHistoryTurn[] {
  return turns.filter((t) => t.body?.trim()).slice(-PROMOTION_WINDOW_TURNS);
}

/**
 * Pure: the stable Brain key for a learned fact. Same label -> same key -> the write
 * upserts one node. Returns null for a label that slugs to nothing (punctuation-only),
 * which the caller drops rather than keying on an empty string.
 */
export function learningKeyFor(label: string): string | null {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug ? `chat-learning:${slug}` : null;
}

/** Pure: render the extraction prompt from a stretch of turns (oldest first), with the
 *  rolling summary as context so a bounded window still reads against the wider chat. */
export function buildExtractionPrompt(turns: ArcHistoryTurn[], summary?: string | null): string {
  const lines = turns.map((t) => `${t.role === "arc" ? "Arc" : "Operator"}: ${t.body}`);
  return [
    ...(summary?.trim() ? ["EARLIER IN THIS CONVERSATION (summary):", summary.trim(), ""] : []),
    "CONVERSATION TURNS:",
    ...lines,
    "",
    "Return the JSON array of durable facts.",
  ].join("\n");
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
export async function extractDurableFacts(turns: ArcHistoryTurn[], summary?: string | null): Promise<DurableFact[]> {
  if (turns.length === 0) return [];
  const options = buildQueryOptions({
    inference: inferenceForRoute("fast"),
    systemPrompt: EXTRACT_SYSTEM,
    mcpServers: {},
    allowedTools: [],
  });
  let assistantText = "";
  let resultText = "";
  for await (const message of query({ prompt: buildExtractionPrompt(turns, summary), options })) {
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
 * Distill the recent window of a conversation into durable facts and record them as
 * Brain `learning` nodes (non-gated observations, so they're recalled going forward).
 *
 * Each fact is written keyed, through the upserting `/brain/learnings` route — the
 * plain node route inserts blind, which would turn the overlapping windows here into
 * duplicate memory. Best-effort throughout: any failure is swallowed so memory
 * promotion never breaks a turn.
 */
export async function promoteConversationMemory(
  client: ArcClient,
  turns: ArcHistoryTurn[],
  summary?: string | null,
): Promise<void> {
  try {
    const window = selectPromotionWindow(turns);
    if (window.length < MIN_PROMOTION_TURNS) return;
    const facts = await extractDurableFacts(window, summary);
    for (const fact of facts) {
      const key = learningKeyFor(fact.label);
      if (!key) continue;
      await client
        .apiPost("/api/v1/arc/brain/learnings", {
          key,
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
