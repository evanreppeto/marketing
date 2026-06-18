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
