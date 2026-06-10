/**
 * Compact elapsed-wait label for the approval queue: just now / 30m / 4h / 9d.
 * Unlike relative-time.ts it stays a duration past a week so the queue reads as
 * urgency, not a calendar date. `nowMs` is injectable for deterministic tests.
 */
export function formatWaitTime(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffMs = Math.max(0, nowMs - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
