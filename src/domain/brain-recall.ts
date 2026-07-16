/**
 * Pure ranking for Arc's cross-chat "memory" block. No I/O. Candidates arrive in
 * priority order (trusted before observed, newest-updated first within tier — the
 * caller fetches them that way), each optionally carrying the cosine `similarity`
 * the caller's vector search scored it at. Returns a small always-on core set plus
 * the nodes most relevant to the operator message — ranked by fusing the keyword
 * and semantic orderings — deduped by id and capped.
 */

export type RecallCandidate = {
  id: string;
  kind: string;
  label: string;
  summary: string | null;
  tags: string[];
  trustTier: string;
  /**
   * 0–1 cosine similarity to the operator message, when the caller ran a vector
   * search and this node was among the hits. Undefined means "not scored" (no
   * embeddings, or outside the top-K) — never "scored zero".
   */
  similarity?: number;
};

/** A prompt-ready memory line. */
export type RecallItem = {
  label: string;
  summary: string | null;
  kind: string;
  related?: string[];
  /** 0–1 relevance confidence (set when enrichRecall is given the message). */
  confidence?: number;
  /** Source brain node id, so the UI can link the chip back to the brain. */
  nodeId?: string;
};

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

/**
 * Slots reserved for always-pulled memory: the top trusted nodes in caller order,
 * regardless of the message. Deliberately small — it guarantees Arc always carries
 * some confirmed context, but every slot spent here is a slot that can't respond to
 * what was actually asked.
 */
const DEFAULT_CORE_LIMIT = 4;
/** Slots filled by relevance to the message (keyword ∪ semantic, rank-fused). */
const DEFAULT_MATCH_LIMIT = 11;
const DEFAULT_CAP = 15;

/**
 * Reciprocal-rank-fusion constant. The conventional 60: big enough that the top few
 * ranks score close together (so neither ranker's #1 automatically wins), small
 * enough that deep ranks decay away.
 */
const RRF_K = 60;

/**
 * Fuse ranked lists by reciprocal rank: score(node) = Σ 1/(K + rank) across the
 * lists that found it.
 *
 * Rank-based rather than score-based on purpose. Cosine similarity over text
 * embeddings has a high floor and a narrow spread — unrelated sentences still score
 * ~0.5 — so blending raw similarity against keyword overlap would bury the keyword
 * signal under a near-constant. Fusing *positions* sidesteps the scale mismatch
 * entirely, and a node both rankers like outranks one that only a single ranker found.
 */
function fuseByReciprocalRank(rankings: RecallCandidate[][]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((c, index) => {
      scores.set(c.id, (scores.get(c.id) ?? 0) + 1 / (RRF_K + index + 1));
    });
  }
  return scores;
}

/** Candidates sharing at least one token with the message, most overlap first. */
function keywordRanking(candidates: RecallCandidate[], tokens: string[]): RecallCandidate[] {
  if (tokens.length === 0) return [];
  return candidates
    .map((c) => {
      const text = candidateText(c);
      return { c, score: tokens.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.c);
}

/** Candidates the caller's vector search scored, nearest first. */
function semanticRanking(candidates: RecallCandidate[]): RecallCandidate[] {
  return candidates
    .filter((c): c is RecallCandidate & { similarity: number } => typeof c.similarity === "number")
    .sort((a, b) => b.similarity - a.similarity);
}

export function selectRecall(
  candidates: RecallCandidate[],
  message: string,
  options: RankRecallOptions = {},
): RecallCandidate[] {
  const coreLimit = options.coreLimit ?? DEFAULT_CORE_LIMIT;
  const matchLimit = options.matchLimit ?? DEFAULT_MATCH_LIMIT;
  const cap = options.cap ?? DEFAULT_CAP;

  const core = candidates.slice(0, coreLimit);
  const coreIds = new Set(core.map((c) => c.id));
  const rest = candidates.filter((c) => !coreIds.has(c.id));

  // No message, no query, no relevance — the block is the always-on core only.
  // Enforced here rather than trusted to callers: a blank message can't rank
  // anything, whether or not a caller left similarities on the candidates. Note a
  // message that tokenizes to nothing ("hi") is still a query — semantic order can
  // rank it even when no keyword survives.
  const fused = message.trim()
    ? fuseByReciprocalRank([keywordRanking(rest, [...new Set(tokenize(message))]), semanticRanking(rest)])
    : new Map<string, number>();

  // Only nodes some ranker actually found compete; a node neither matched nor scored
  // stays out rather than padding the block with noise. Sorting `rest` (already
  // trusted-first, newest-first) keeps equal fused scores in the caller's priority
  // order — Array.sort is stable, so selection stays deterministic.
  const matches = rest
    .filter((c) => fused.has(c.id))
    .sort((a, b) => (fused.get(b.id) ?? 0) - (fused.get(a.id) ?? 0))
    .slice(0, matchLimit);

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

// ─── Task 3: enrichRecall ────────────────────────────────────────────────────

/** The node + edge data enrichRecall needs (subset of the bulk brain graph). */
export type RecallGraph = {
  nodes: Array<{ id: string; label: string; kind: string }>;
  edges: GraphEdgeInput[];
};

export type EnrichOptions = {
  enrichLimit?: number;
  relationsPerNode?: number;
  depth?: number;
  maxPerSeed?: number;
  /** When set, each item gets a confidence (recallRelevance) + nodeId. */
  message?: string;
};

/**
 * Map selected candidates to prompt-ready items, attaching `related` connection
 * lines for the top `enrichLimit` (default 5) selected nodes via traverseFrom.
 * Each line: `—relation→ Label (kind)` (outbound) or `←relation— Label (kind)`
 * (inbound), prefixed `(N-hop) ` when more than one hop away. Capped at
 * `relationsPerNode` (default 3). Pure.
 */
export function enrichRecall(
  selected: RecallCandidate[],
  graph: RecallGraph,
  options: EnrichOptions = {},
): RecallItem[] {
  const enrichLimit = options.enrichLimit ?? 5;
  const relationsPerNode = options.relationsPerNode ?? 3;

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const seedIds = selected.slice(0, enrichLimit).map((c) => c.id);
  const traversal = traverseFrom(seedIds, graph.edges, {
    depth: options.depth ?? 2,
    maxPerSeed: options.maxPerSeed ?? 4,
  });

  return selected.map((c) => {
    const base: RecallItem = {
      label: c.label,
      summary: c.summary,
      kind: c.kind,
      ...(options.message !== undefined
        ? { confidence: recallRelevance(c, options.message), nodeId: c.id }
        : {}),
    };
    const conns = traversal.get(c.id);
    if (!conns || conns.length === 0) return base;
    const related = conns
      .map((conn) => {
        const n = nodeById.get(conn.nodeId);
        if (!n) return null;
        const rel = conn.direction === "out" ? `—${conn.relation}→` : `←${conn.relation}—`;
        const prefix = conn.hops > 1 ? `(${conn.hops}-hop) ` : "";
        return `${prefix}${rel} ${n.label} (${n.kind})`;
      })
      .filter((s): s is string => s !== null)
      .slice(0, relationsPerNode);
    return related.length ? { ...base, related } : base;
  });
}

// ─── Task 3: recallRelevance — confidence score for a recalled node ──────────

const TIER_CONFIDENCE_BASE: Record<string, number> = { trusted: 0.7, observed: 0.5 };

/**
 * The zero point for turning a cosine similarity into a displayed confidence.
 *
 * Text embeddings never score near 0 for unrelated text, so a raw similarity badly
 * overstates relevance. Measured against the live brain (395 nodes, gemini-embedding-2,
 * querying a storm-signal node): unrelated nodes ran min 0.44 / median 0.62 / p99 0.69,
 * with the best genuine match at 0.83. So ~0.7 is where real relevance starts, and
 * anything under it is this model's noise band, not evidence.
 *
 * Distribution-dependent, so re-measure if GEMINI_EMBEDDING_MODEL changes. Only the
 * displayed confidence is sensitive to this — selection fuses ranks, not scores, and
 * is immune to the model's similarity scale.
 */
const SEMANTIC_FLOOR = 0.7;
const RELEVANCE_BONUS_CEILING = 0.3;

/**
 * A 0–1 confidence that a recalled node is relevant to the operator message.
 * Blends trust tier (a node the operator confirmed counts more) with the strongest
 * available relevance signal: keyword overlap, or vector similarity when the caller
 * scored one. Taking the max rather than the sum keeps a node that's strong on
 * either axis confident without double-counting when it's strong on both.
 * Deterministic and pure — used to rank and to show a read on the chat recall chips.
 */
export function recallRelevance(candidate: RecallCandidate, message: string): number {
  const base = TIER_CONFIDENCE_BASE[candidate.trustTier] ?? 0.4;

  const tokens = [...new Set(tokenize(message))];
  const text = candidateText(candidate);
  const overlap =
    tokens.length === 0 ? 0 : tokens.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0) / tokens.length;
  const keywordBonus = Math.min(RELEVANCE_BONUS_CEILING, overlap * RELEVANCE_BONUS_CEILING);

  // Rescale similarity above the noise floor, so a node that's genuinely near reads
  // as confident even when it shares no literal wording with the message.
  const semanticBonus =
    typeof candidate.similarity === "number"
      ? Math.min(
          RELEVANCE_BONUS_CEILING,
          Math.max(0, (candidate.similarity - SEMANTIC_FLOOR) / (1 - SEMANTIC_FLOOR)) * RELEVANCE_BONUS_CEILING,
        )
      : 0;

  return Math.min(1, base + Math.max(keywordBonus, semanticBonus));
}

// ─── Task 4: previewRecall — operator-facing "what would Arc recall?" ─────────

export type RecallPreviewNode = {
  id: string;
  kind: string;
  label: string;
  summary: string | null;
  tags: string[];
  trustTier: string;
};

export type RecallPreviewItem = {
  id: string;
  kind: string;
  label: string;
  summary: string | null;
  trustTier: string;
  /** Always-pulled core memory (top trusted/observed) vs. a keyword match. */
  core: boolean;
  related: string[];
};

const RECALL_TIER_PRIORITY: Record<string, number> = { trusted: 0, observed: 1 };

/**
 * Mirror what Arc pulls into memory for a message — the pure core of
 * getRecallMemory: trusted+observed candidates (trusted-first), selected as core +
 * relevance matches, enriched with relationship lines. Lets an operator see (and
 * stress-test) Arc's recall on a scenario. Pure — no I/O.
 *
 * Keyword-only: preview nodes carry no `similarity`, so this shows the ranking Arc
 * would reach without a vector search. Live recall additionally fuses semantic hits,
 * and can surface a node this preview misses.
 */
export function previewRecall(
  nodes: RecallPreviewNode[],
  edges: GraphEdgeInput[],
  message: string,
): RecallPreviewItem[] {
  const candidates: RecallCandidate[] = nodes
    .filter((n) => n.trustTier === "trusted" || n.trustTier === "observed")
    .slice()
    .sort((a, b) => (RECALL_TIER_PRIORITY[a.trustTier] ?? 9) - (RECALL_TIER_PRIORITY[b.trustTier] ?? 9))
    .map((n) => ({ id: n.id, kind: n.kind, label: n.label, summary: n.summary, tags: n.tags, trustTier: n.trustTier }));

  const coreIds = new Set(candidates.slice(0, DEFAULT_CORE_LIMIT).map((c) => c.id));

  const selected = selectRecall(candidates, message);
  const graph: RecallGraph = {
    nodes: nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
    edges,
  };
  const enriched = enrichRecall(selected, graph, { enrichLimit: selected.length, relationsPerNode: 3 });

  return selected.map((c, i) => ({
    id: c.id,
    kind: c.kind,
    label: c.label,
    summary: c.summary,
    trustTier: c.trustTier,
    core: coreIds.has(c.id),
    related: enriched[i]?.related ?? [],
  }));
}
