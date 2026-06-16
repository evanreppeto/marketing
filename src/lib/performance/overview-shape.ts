export type TrendPoint = { week: string; leads: number; bookings: number };
export type KpiDelta = { pct: number; dir: "up" | "down" | "flat" };
// Structural shape of a portfolio split (defined locally so this lib module does not depend on the app layer).
type SplitLike = { approved: number; pending: number; changes: number; draft: number; total: number; readiness: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Percent change of current vs prior. Null when there's no prior baseline (can't honestly compute). */
export function computeDelta(current: number, prior: number): KpiDelta | null {
  if (prior <= 0) return null;
  const change = (current - prior) / prior;
  const pct = Math.round(Math.abs(change) * 100);
  const dir = current > prior ? "up" : current < prior ? "down" : "flat";
  return { pct, dir };
}

/** Sum weights for items in the last `days` (current) vs the `days` before that (prior). Unparseable timestamps are skipped. */
export function sumTwoPeriods(items: Array<{ at: string | null; weight: number }>, nowMs: number, days: number): { current: number; prior: number } {
  const currentStart = nowMs - days * DAY_MS;
  const priorStart = nowMs - 2 * days * DAY_MS;
  let current = 0;
  let prior = 0;
  for (const item of items) {
    if (!item.at) continue;
    const t = Date.parse(item.at);
    if (Number.isNaN(t)) continue;
    if (t >= currentStart && t <= nowMs) current += item.weight;
    else if (t >= priorStart && t < currentStart) prior += item.weight;
  }
  return { current, prior };
}

/** Bucket leads/jobs into `weeks` 7-day buckets ending at nowMs, oldest first. Label is the bucket's start date (M/D). */
export function buildTrendBuckets(
  leads: Array<{ created_at: string | null }>,
  jobs: Array<{ created_at: string | null }>,
  nowMs: number,
  weeks: number,
): TrendPoint[] {
  const buckets: TrendPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = nowMs - i * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const label = new Date(start + DAY_MS).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    buckets.push({ week: label, leads: 0, bookings: 0 });
  }
  const place = (at: string | null, key: "leads" | "bookings") => {
    if (!at) return;
    const t = Date.parse(at);
    if (Number.isNaN(t)) return;
    const weeksAgo = Math.floor((nowMs - t) / (7 * DAY_MS));
    if (weeksAgo < 0 || weeksAgo >= weeks) return;
    buckets[weeks - 1 - weeksAgo][key] += 1;
  };
  for (const lead of leads) place(lead.created_at, "leads");
  for (const job of jobs) place(job.created_at, "bookings");
  return buckets;
}

/** One plain-language sentence summarizing portfolio state for a non-technical reader. */
export function buildTakeaway(split: SplitLike, waitingOnYou: number): string {
  if (split.total === 0) return "No campaigns yet. When Mark drafts one or you create one, its progress shows up here.";
  if (waitingOnYou === 0 && split.changes === 0) {
    return `You're all caught up — ${split.readiness}% of your campaign work is approved and nothing needs your attention right now.`;
  }
  const parts: string[] = [];
  if (waitingOnYou > 0) parts.push(`${waitingOnYou} ${waitingOnYou === 1 ? "piece is" : "pieces are"} waiting on your approval`);
  if (split.changes > 0) parts.push(`${split.changes} ${split.changes === 1 ? "was" : "were"} sent back for changes`);
  return `${split.readiness}% of your campaign work is approved. ${parts.join(", and ")}.`;
}
