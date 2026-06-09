const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Compact relative timestamp for chat rows: now / 30m / 3h / Sun / May 1.
 *  `nowMs` is injectable for deterministic tests; defaults to wall clock. */
export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffMs = nowMs - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const d = new Date(then);
  if (days < 7) return DAY_NAMES[d.getUTCDay()];
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
