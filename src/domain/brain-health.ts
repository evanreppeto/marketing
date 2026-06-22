/**
 * Brain health analysis (pure, no I/O). Surfaces the things that quietly degrade
 * Arc's memory: facts disconnected from the web (invisible to recall traversal),
 * stale facts, low-confidence facts trusted anyway, and personas Arc has little to
 * say to. A human uses this to sharpen the brain; the result is a memory Arc reasons
 * over more reliably.
 */

export type HealthNodeInput = {
  id: string;
  kind: string;
  label: string;
  trustTier: string;
  confidence: number | null;
  createdAt: string | null;
};

export type HealthEdgeInput = { fromNodeId: string; toNodeId: string };

export type HealthIssue = { id: string; label: string; kind: string; detail: string };

export type BrainHealth = {
  /** 0–100 composite — 100 is a clean, well-connected, fresh, confident brain. */
  score: number;
  total: number;
  orphans: HealthIssue[];
  stale: HealthIssue[];
  lowConfidence: HealthIssue[];
  coverageGaps: HealthIssue[];
  proposedCount: number;
};

const isHub = (kind: string) => kind === "arc" || kind === "hub";
const LOW_CONFIDENCE = 60;

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 86_400_000);
}

export function analyzeBrainHealth(
  nodes: HealthNodeInput[],
  edges: HealthEdgeInput[],
  now: number,
  staleDays = 90,
): BrainHealth {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.fromNodeId, (degree.get(e.fromNodeId) ?? 0) + 1);
    degree.set(e.toNodeId, (degree.get(e.toNodeId) ?? 0) + 1);
  }

  const orphans: HealthIssue[] = [];
  const stale: HealthIssue[] = [];
  const lowConfidence: HealthIssue[] = [];
  const coverageGaps: HealthIssue[] = [];
  let proposedCount = 0;

  for (const n of nodes) {
    if (n.trustTier === "proposed") {
      proposedCount += 1;
      continue;
    }
    const deg = degree.get(n.id) ?? 0;

    if (!isHub(n.kind) && deg === 0) {
      orphans.push({ id: n.id, label: n.label, kind: n.kind, detail: "No connections — Arc can't recall it" });
    }

    const age = daysSince(n.createdAt, now);
    if (!isHub(n.kind) && age != null && age > staleDays) {
      stale.push({ id: n.id, label: n.label, kind: n.kind, detail: `${age}d since learned` });
    }

    if (n.confidence != null && n.confidence < LOW_CONFIDENCE) {
      lowConfidence.push({ id: n.id, label: n.label, kind: n.kind, detail: `${Math.round(n.confidence)}% confidence` });
    }

    if (n.kind === "persona" && deg < 2) {
      coverageGaps.push({
        id: n.id,
        label: n.label,
        kind: n.kind,
        detail: deg === 0 ? "No supporting facts" : "Only 1 connection",
      });
    }
  }

  const total = nodes.length;
  const penalty = orphans.length * 3 + stale.length * 1 + lowConfidence.length * 2 + coverageGaps.length * 2;
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return { score, total, orphans, stale, lowConfidence, coverageGaps, proposedCount };
}
