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
    const base: RecallItem = { label: c.label, summary: c.summary, kind: c.kind };
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
 * A 0–1 confidence that a recalled node is relevant to the operator message.
 * Blends trust tier (a node the operator confirmed counts more) with keyword
 * overlap against the message. Deterministic and pure — used to rank and to show
 * a confidence read on the chat recall chips.
 */
export function recallRelevance(candidate: RecallCandidate, message: string): number {
  const base = TIER_CONFIDENCE_BASE[candidate.trustTier] ?? 0.4;
  const tokens = [...new Set(tokenize(message))];
  if (tokens.length === 0) return base;
  const text = candidateText(candidate);
  const matched = tokens.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
  const overlap = matched / tokens.length; // 0..1
  const bonus = Math.min(0.3, overlap * 0.3);
  return Math.min(1, base + bonus);
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
 * Mirror exactly what Arc pulls into memory for a message — the pure core of
 * getRecallMemory: trusted+observed candidates (trusted-first), selected as
 * core + keyword matches, enriched with relationship lines. Lets an operator see
 * (and stress-test) Arc's recall on a scenario. Pure — no I/O.
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

  const coreIds = new Set(candidates.slice(0, 10).map((c) => c.id));

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
