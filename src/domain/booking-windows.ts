/**
 * Constrained booking availability — the "send them a link that only opens the
 * days I actually want" half of campaign scheduling.
 *
 * Arc already knows how to make a link attributable (`buildCampaignLink`) and
 * already understands a `booking` touch (`TOUCH_KINDS.Booking`). What it has no
 * model for is *when* a recipient may book: a storm-response offer should open
 * the next ten days, a podcast or partner intro might deliberately open only two
 * months out. This module is that model.
 *
 * Pure — no I/O, no provider calls. A scheduling adapter (Cal.com, Calendly, or
 * an Arc-native page) translates the resolved window into whatever query params
 * or API payload it needs; nothing here is provider-shaped.
 *
 * A window is expressed in the workspace's OWN timezone, not UTC and not the
 * server's. "Tuesdays noon to five" means noon where the operator books work,
 * and an offer that opens "the next ten days" must not quietly shift by a day
 * for a workspace on the other side of a date line. Local parts are extracted
 * with `Intl.DateTimeFormat`, which handles DST correctly — a 9am-5pm window
 * stays 9am-5pm across a transition rather than sliding an hour.
 */

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** A resolved, validated availability window. All fields are workspace-local. */
export type BookingWindow = {
  /** Inclusive ISO date (YYYY-MM-DD), workspace-local. */
  startDate: string;
  /** Inclusive ISO date (YYYY-MM-DD), workspace-local. */
  endDate: string;
  /** Bookable weekdays. Never empty — an all-days window lists all seven. */
  weekdays: WeekdayKey[];
  /** Minutes from local midnight, inclusive. */
  startMinute: number;
  /** Minutes from local midnight, exclusive — a slot must *start* before this. */
  endMinute: number;
  /** IANA timezone the window is expressed in. */
  timeZone: string;
};

/**
 * How the operator (or Arc) asked for the window. Relative forms exist because
 * "the next two weeks" is what a storm-response campaign actually means, and
 * resolving it at generation time bakes in a date that ages badly.
 */
export type BookingWindowSpec = {
  /** Explicit inclusive date range. Wins over `withinDays` when both are given. */
  startDate?: string;
  endDate?: string;
  /** Relative range: today through today + N days. */
  withinDays?: number;
  /** Restrict to these weekdays. Omitted or empty = every day. */
  weekdays?: WeekdayKey[];
  /** Local time-of-day bounds as "HH:MM". Defaults to business hours. */
  startTime?: string;
  endTime?: string;
  timeZone?: string;
};

export type BookingWindowResult =
  | { ok: true; window: BookingWindow }
  | { ok: false; error: string };

export const DEFAULT_BOOKING_TIME_ZONE = "America/Chicago";
export const DEFAULT_START_TIME = "09:00";
export const DEFAULT_END_TIME = "17:00";

/**
 * Refuse to mint a link bookable further out than this. A calendar link is a
 * standing commitment: one generated with a five-year horizon keeps accepting
 * bookings long after the campaign, the offer, and possibly the pricing are
 * dead, and nobody goes back to revoke it.
 */
export const MAX_WINDOW_HORIZON_DAYS = 365;

/** A window shorter than one slot can't be booked at all — reject, don't ship it. */
export const MIN_WINDOW_MINUTES = 15;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

const WEEKDAY_SET = new Set<string>(WEEKDAY_KEYS);

/** Parse "HH:MM" to minutes from midnight. Null when malformed or out of range. */
export function parseLocalTime(value: string): number | null {
  const match = TIME_RE.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Format minutes-from-midnight back to "HH:MM". */
export function formatLocalTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The workspace-local calendar parts of an instant. Uses Intl rather than
 * hand-rolled offset math so DST is handled by the platform's tz database.
 */
export function localPartsFor(instant: Date, timeZone: string): { date: string; minute: number; weekday: WeekdayKey } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = new Map(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  const hour = Number(parts.get("hour") ?? "0") % 24;
  const minute = Number(parts.get("minute") ?? "0");
  return {
    date: `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`,
    minute: hour * 60 + minute,
    weekday: (parts.get("weekday") ?? "Sun").slice(0, 3).toLowerCase() as WeekdayKey,
  };
}

/** Add whole days to an ISO date string without touching timezones. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const base = Date.UTC(y!, m! - 1, d!);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / 86_400_000);
}

function isRealDate(isoDate: string): boolean {
  if (!ISO_DATE_RE.test(isoDate)) return false;
  // Round-trip catches 2026-02-31 and friends, which the regex happily accepts.
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d;
}

/**
 * Resolve a spec into a validated window, refusing anything that would produce a
 * link nobody can book (or one bookable forever). `now` is injected so the result
 * is deterministic in tests and so a relative window resolves against the
 * workspace's today, not the server's.
 */
export function resolveBookingWindow(spec: BookingWindowSpec, now: Date): BookingWindowResult {
  const timeZone = spec.timeZone?.trim() || DEFAULT_BOOKING_TIME_ZONE;
  if (!isValidTimeZone(timeZone)) return { ok: false, error: `"${timeZone}" is not a recognized time zone.` };

  const today = localPartsFor(now, timeZone).date;

  let startDate: string;
  let endDate: string;
  if (spec.startDate || spec.endDate) {
    startDate = spec.startDate?.trim() || today;
    endDate = spec.endDate?.trim() || startDate;
    if (!isRealDate(startDate)) return { ok: false, error: `"${startDate}" is not a valid date (use YYYY-MM-DD).` };
    if (!isRealDate(endDate)) return { ok: false, error: `"${endDate}" is not a valid date (use YYYY-MM-DD).` };
  } else if (spec.withinDays !== undefined) {
    if (!Number.isInteger(spec.withinDays) || spec.withinDays < 0) {
      return { ok: false, error: "A relative window needs a whole number of days." };
    }
    startDate = today;
    endDate = addDays(today, spec.withinDays);
  } else {
    return { ok: false, error: "Give the window a date range or a number of days." };
  }

  if (daysBetween(startDate, endDate) < 0) return { ok: false, error: "The window ends before it starts." };
  if (daysBetween(today, endDate) < 0) return { ok: false, error: "That window is entirely in the past." };

  const horizon = daysBetween(today, endDate);
  if (horizon > MAX_WINDOW_HORIZON_DAYS) {
    return {
      ok: false,
      error: `That link would stay bookable for ${horizon} days. Keep it within ${MAX_WINDOW_HORIZON_DAYS}.`,
    };
  }

  const startMinute = parseLocalTime(spec.startTime ?? DEFAULT_START_TIME);
  const endMinute = parseLocalTime(spec.endTime ?? DEFAULT_END_TIME);
  if (startMinute === null) return { ok: false, error: `"${spec.startTime}" is not a valid time (use HH:MM).` };
  if (endMinute === null) return { ok: false, error: `"${spec.endTime}" is not a valid time (use HH:MM).` };
  if (endMinute - startMinute < MIN_WINDOW_MINUTES) {
    return { ok: false, error: `Daily hours must span at least ${MIN_WINDOW_MINUTES} minutes.` };
  }

  const requested = spec.weekdays?.filter((day) => WEEKDAY_SET.has(day)) ?? [];
  const weekdays = requested.length > 0
    ? WEEKDAY_KEYS.filter((day) => requested.includes(day))
    : [...WEEKDAY_KEYS];

  // A Tuesday/Thursday rule over a Friday-to-Saturday range yields a link with
  // no bookable day at all — valid on every field, useless in practice.
  if (!windowHasBookableDay({ startDate, endDate, weekdays, startMinute, endMinute, timeZone })) {
    return { ok: false, error: "No bookable days fall in that range — widen the dates or the weekdays." };
  }

  return { ok: true, window: { startDate, endDate, weekdays, startMinute, endMinute, timeZone } };
}

/** Weekday key for an ISO date, computed in UTC to stay timezone-independent. */
export function weekdayFor(isoDate: string): WeekdayKey {
  const [y, m, d] = isoDate.split("-").map(Number);
  return WEEKDAY_KEYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

/** True when at least one date in the range falls on an allowed weekday. */
export function windowHasBookableDay(window: BookingWindow): boolean {
  const span = daysBetween(window.startDate, window.endDate);
  // A full week always contains every weekday; no need to walk a long range.
  const limit = Math.min(span, 6);
  for (let offset = 0; offset <= limit; offset += 1) {
    if (window.weekdays.includes(weekdayFor(addDays(window.startDate, offset)))) return true;
  }
  return false;
}

/**
 * Whether a proposed booking instant actually falls inside the window. The
 * provider enforces this too, but a returning webhook is untrusted input — a
 * booking outside the window must be rejected rather than recorded.
 */
export function isWithinBookingWindow(instant: Date, window: BookingWindow): boolean {
  const local = localPartsFor(instant, window.timeZone);
  if (daysBetween(window.startDate, local.date) < 0) return false;
  if (daysBetween(local.date, window.endDate) < 0) return false;
  if (!window.weekdays.includes(local.weekday)) return false;
  return local.minute >= window.startMinute && local.minute < window.endMinute;
}

const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y!, m! - 1, d!)));
}

function formatWeekdays(weekdays: WeekdayKey[]): string {
  if (weekdays.length === 7) return "Any day";
  const labels = weekdays.map((day) => WEEKDAY_LABEL[day]);
  if (labels.length === 1) return `${labels[0]}s`;
  const plural = labels.map((label) => `${label}s`);
  return `${plural.slice(0, -1).join(", ")} and ${plural.at(-1)}`;
}

/**
 * One-line description for an approval card. The operator approves the *link*,
 * so what they approve has to be legible without opening the provider — an
 * opaque URL is not a reviewable decision.
 */
export function describeBookingWindow(window: BookingWindow): string {
  const days = formatWeekdays(window.weekdays);
  const hours = `${formatLocalTime(window.startMinute)}–${formatLocalTime(window.endMinute)}`;
  const range = window.startDate === window.endDate
    ? formatDateLabel(window.startDate)
    : `${formatDateLabel(window.startDate)} – ${formatDateLabel(window.endDate)}`;
  return `${days}, ${hours} (${window.timeZone}) · ${range}`;
}

/**
 * Provider-agnostic parameters an adapter maps onto its own booking API. Kept
 * deliberately small: every scheduler expresses a date range and business hours,
 * so this is the intersection rather than any one vendor's shape.
 */
export type BookingWindowParams = {
  startDate: string;
  endDate: string;
  weekdays: WeekdayKey[];
  startTime: string;
  endTime: string;
  timeZone: string;
};

export function toBookingWindowParams(window: BookingWindow): BookingWindowParams {
  return {
    startDate: window.startDate,
    endDate: window.endDate,
    weekdays: window.weekdays,
    startTime: formatLocalTime(window.startMinute),
    endTime: formatLocalTime(window.endMinute),
    timeZone: window.timeZone,
  };
}
