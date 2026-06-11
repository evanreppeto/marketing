/** Pure scheduling math for the board's "When should Mark start?" control.
 *  `now` is injected so the logic stays deterministic and unit-tested. Times are
 *  computed in UTC for determinism; the external runner only gates on the value
 *  — it never authorizes outbound. */

export const SCHEDULE_PRESETS = ["now", "few_hours", "tomorrow_am", "weekend", "custom"] as const;

export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number];

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Resolve a preset (+ optional custom ISO) to an ISO start time, or null = "now". */
export function resolveScheduledFor(preset: SchedulePreset, now: Date, customIso?: string | null): string | null {
  switch (preset) {
    case "now":
      return null;
    case "few_hours":
      return new Date(now.getTime() + 3 * HOUR_MS).toISOString();
    case "tomorrow_am": {
      const d = new Date(now.getTime() + DAY_MS);
      d.setUTCHours(9, 0, 0, 0);
      return d.toISOString();
    }
    case "weekend": {
      const daysUntilSat = (6 - now.getUTCDay() + 7) % 7;
      const d = new Date(now.getTime() + daysUntilSat * DAY_MS);
      d.setUTCHours(9, 0, 0, 0);
      if (d.getTime() <= now.getTime()) d.setTime(d.getTime() + 7 * DAY_MS);
      return d.toISOString();
    }
    case "custom": {
      if (!customIso) return null;
      const t = new Date(customIso);
      if (Number.isNaN(t.getTime())) return null;
      if (t.getTime() <= now.getTime()) return null; // past = run now
      return t.toISOString();
    }
    default:
      return null;
  }
}

/** Friendly label for a scheduled ISO (or null) relative to `now`. */
export function formatScheduleLabel(iso: string | null, now: Date): string {
  if (!iso) return "Now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Now";
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(d);
  const startOfDay = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
  if (dayDiff <= 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  if (dayDiff < 7) {
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);
    return `${weekday}, ${time}`;
  }
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
  return `${monthDay}, ${time}`;
}
