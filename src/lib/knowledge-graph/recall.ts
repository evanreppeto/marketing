import { rankRecall, type RecallCandidate, type RecallItem } from "@/domain";
import { type TypedSupabaseClient } from "@/lib/supabase/server";

import { listNodes } from "./read-model";

/**
 * Assemble the bounded "memory" Arc recalls each turn: the org's trusted +
 * observed brain nodes, ranked (core + keyword top-up vs `message`). Uses
 * per-tier filtered reads — never the unfiltered listNodes({}) (which would fall
 * back to demo nodes on an empty brain) and never proposed/rejected/archived
 * (proposed is unapproved and must not steer Arc). Empty on any unavailable read.
 */
export async function getRecallMemory(
  orgId: string,
  message: string,
  client?: TypedSupabaseClient,
): Promise<RecallItem[]> {
  const [trusted, observed] = await Promise.all([
    listNodes({ trustTier: "trusted" }, client, orgId),
    listNodes({ trustTier: "observed" }, client, orgId),
  ]);
  if (trusted.status !== "live" || observed.status !== "live") return [];

  const candidates: RecallCandidate[] = [...trusted.nodes, ...observed.nodes].map((n) => ({
    id: n.id,
    kind: n.kind,
    label: n.label,
    summary: n.summary,
    tags: n.tags,
    trustTier: n.trustTier,
  }));
  return rankRecall(candidates, message);
}
