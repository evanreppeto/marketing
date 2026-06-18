/**
 * Pure ranking for Arc's cross-chat "memory" block. No I/O. Candidates arrive in
 * priority order (trusted before observed, newest-updated first within tier — the
 * caller fetches them that way). Returns the core set (top by that order) plus
 * keyword top-up matches against the operator message, deduped by id and capped.
 */

export type RecallCandidate = {
  id: string;
  kind: string;
  label: string;
  summary: string | null;
  tags: string[];
  trustTier: string;
};

/** A prompt-ready memory line. */
export type RecallItem = { label: string; summary: string | null; kind: string; related?: string[] };

export type RankRecallOptions = { coreLimit?: number; matchLimit?: number; cap?: number };

const STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "our", "with", "this", "that", "have", "has", "are",
  "was", "can", "will", "what", "when", "how", "why", "who", "does", "did", "from", "into",
  "about", "need", "want", "please", "arc", "let", "get", "got", "make", "made", "just",
  "they", "them", "there", "here", "out", "use", "using", "best",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function candidateText(c: RecallCandidate): string {
  return [c.label, c.summary ?? "", c.tags.join(" ")].join(" ").toLowerCase();
}

export function selectRecall(
  candidates: RecallCandidate[],
  message: string,
  options: RankRecallOptions = {},
): RecallCandidate[] {
  const coreLimit = options.coreLimit ?? 10;
  const matchLimit = options.matchLimit ?? 5;
  const cap = options.cap ?? 15;

  const core = candidates.slice(0, coreLimit);
  const coreIds = new Set(core.map((c) => c.id));

  const tokens = [...new Set(tokenize(message))];
  const matches =
    tokens.length === 0
      ? []
      : candidates
          .filter((c) => !coreIds.has(c.id))
          .map((c) => {
            const text = candidateText(c);
            const score = tokens.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
            return { c, score };
          })
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, matchLimit)
          .map((s) => s.c);

  return [...core, ...matches].slice(0, cap);
}

/** Back-compat: select + map to prompt-ready items (no enrichment). */
export function rankRecall(
  candidates: RecallCandidate[],
  message: string,
  options: RankRecallOptions = {},
): RecallItem[] {
  return selectRecall(candidates, message, options).map((c) => ({ label: c.label, summary: c.summary, kind: c.kind }));
}

// ─── Task 2: traverseFrom ────────────────────────────────────────────────────

/** A directed edge between two nodes (the subset traverseFrom needs). */
export type GraphEdgeInput = { fromNodeId: string; toNodeId: string; relation: string };

/** A connection discovered from a seed: which node, via which relation, the
 *  direction of the discovering edge (out = seed-side was `from`), and hop distance. */
export type Connection = { nodeId: string; relation: string; direction: "out" | "in"; hops: number };

export type TraverseOptions = { depth?: number; maxPerSeed?: number };

/**
 * Breadth-first traversal from each seed over the edge list, undirected
 * reachability (follows an edge either way) with a per-seed visited set
 * (cycle-safe). Each connection records the discovering edge's relation +
 * direction + hop distance. Bounded by `depth` (default 2) and `maxPerSeed`
 * (default 4); closest nodes first. Pure.
 */
export function traverseFrom(
  seedIds: string[],
  edges: GraphEdgeInput[],
  options: TraverseOptions = {},
): Map<string, Connection[]> {
  const depth = options.depth ?? 2;
  const maxPerSeed = options.maxPerSeed ?? 4;

  type Adj = { neighbor: string; relation: string; direction: "out" | "in" };
  const adj = new Map<string, Adj[]>();
  const add = (from: string, a: Adj) => {
    const list = adj.get(from);
    if (list) list.push(a);
    else adj.set(from, [a]);
  };
  for (const e of edges) {
    add(e.fromNodeId, { neighbor: e.toNodeId, relation: e.relation, direction: "out" });
    add(e.toNodeId, { neighbor: e.fromNodeId, relation: e.relation, direction: "in" });
  }

  const result = new Map<string, Connection[]>();
  for (const seed of seedIds) {
    const connections: Connection[] = [];
    const visited = new Set<string>([seed]);
    let frontier: string[] = [seed];
    for (let hop = 1; hop <= depth && connections.length < maxPerSeed; hop++) {
      const nextFrontier: string[] = [];
      for (const current of frontier) {
        for (const a of adj.get(current) ?? []) {
          if (visited.has(a.neighbor)) continue;
          visited.add(a.neighbor);
          connections.push({ nodeId: a.neighbor, relation: a.relation, direction: a.direction, hops: hop });
          nextFrontier.push(a.neighbor);
          if (connections.length >= maxPerSeed) break;
        }
        if (connections.length >= maxPerSeed) break;
      }
      frontier = nextFrontier;
    }
    result.set(seed, connections);
  }
  return result;
}
