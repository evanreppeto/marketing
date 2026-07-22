import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  describeBookingWindow,
  formatLocalTime,
  isWithinBookingWindow,
  localPartsFor,
  MAX_WINDOW_HORIZON_DAYS,
  parseLocalTime,
  resolveBookingWindow,
  toBookingWindowParams,
  weekdayFor,
  windowHasBookableDay,
  type BookingWindow,
} from "../booking-windows";

/** 2026-07-22 is a Wednesday. 14:00Z = 09:00 America/Chicago (CDT). */
const NOW = new Date("2026-07-22T14:00:00.000Z");

function resolved(spec: Parameters<typeof resolveBookingWindow>[0], now = NOW): BookingWindow {
  const result = resolveBookingWindow(spec, now);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.window;
}

describe("time helpers", () => {
  it("parses and formats HH:MM", () => {
    expect(parseLocalTime("09:30")).toBe(570);
    expect(parseLocalTime("9:05")).toBe(545);
    expect(formatLocalTime(570)).toBe("09:30");
    expect(formatLocalTime(0)).toBe("00:00");
  });

  it("rejects malformed or out-of-range times", () => {
    for (const bad of ["", "noon", "24:00", "12:60", "-1:00", "12", "12:5"]) {
      expect(parseLocalTime(bad)).toBeNull();
    }
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-07-22", 10)).toBe("2026-08-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days between dates in both directions", () => {
    expect(daysBetween("2026-07-22", "2026-08-01")).toBe(10);
    expect(daysBetween("2026-08-01", "2026-07-22")).toBe(-10);
    expect(daysBetween("2026-07-22", "2026-07-22")).toBe(0);
  });

  it("maps dates to weekdays", () => {
    expect(weekdayFor("2026-07-22")).toBe("wed");
    expect(weekdayFor("2026-07-25")).toBe("sat");
  });
});

describe("localPartsFor", () => {
  it("reads calendar parts in the workspace timezone, not UTC", () => {
    // 02:00Z on the 23rd is still 21:00 on the 22nd in Chicago.
    const parts = localPartsFor(new Date("2026-07-23T02:00:00.000Z"), "America/Chicago");
    expect(parts.date).toBe("2026-07-22");
    expect(parts.minute).toBe(21 * 60);
    expect(parts.weekday).toBe("wed");
  });

  it("handles midnight without rolling to hour 24", () => {
    const parts = localPartsFor(new Date("2026-07-22T05:00:00.000Z"), "America/Chicago");
    expect(parts.minute).toBe(0);
    expect(parts.date).toBe("2026-07-22");
  });

  it("keeps local wall-clock time stable across a DST transition", () => {
    // US DST ends 2026-11-01. 15:00Z is 10:00 CDT before and 09:00 CST after —
    // the same instant shifts, which is exactly why windows are stored local.
    const before = localPartsFor(new Date("2026-10-30T15:00:00.000Z"), "America/Chicago");
    const after = localPartsFor(new Date("2026-11-03T15:00:00.000Z"), "America/Chicago");
    expect(before.minute).toBe(10 * 60);
    expect(after.minute).toBe(9 * 60);
  });
});

describe("resolveBookingWindow", () => {
  it("resolves a relative window from the workspace's today", () => {
    const window = resolved({ withinDays: 10 });
    expect(window.startDate).toBe("2026-07-22");
    expect(window.endDate).toBe("2026-08-01");
    expect(window.weekdays).toHaveLength(7);
    expect(window.startMinute).toBe(9 * 60);
    expect(window.endMinute).toBe(17 * 60);
  });

  it("resolves an explicit range with weekday and hour constraints", () => {
    const window = resolved({
      startDate: "2026-09-01",
      endDate: "2026-10-31",
      weekdays: ["tue", "thu"],
      startTime: "12:00",
      endTime: "17:00",
    });
    expect(window.weekdays).toEqual(["tue", "thu"]);
    expect(window.startMinute).toBe(720);
  });

  it("normalizes weekday order and drops unknown values", () => {
    const window = resolved({ withinDays: 30, weekdays: ["thu", "tue", "nope" as never, "tue"] });
    expect(window.weekdays).toEqual(["tue", "thu"]);
  });

  it("uses the workspace's today, not the server's, for a relative window", () => {
    // 03:00Z on the 23rd is still the 22nd in Chicago — the window must start
    // on the operator's date, or a same-day offer silently loses a day.
    const window = resolved({ withinDays: 0 }, new Date("2026-07-23T03:00:00.000Z"));
    expect(window.startDate).toBe("2026-07-22");
    expect(window.endDate).toBe("2026-07-22");
  });

  it("requires some form of range", () => {
    const result = resolveBookingWindow({}, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("date range");
  });

  it("rejects a backwards range", () => {
    const result = resolveBookingWindow({ startDate: "2026-10-01", endDate: "2026-09-01" }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("ends before it starts");
  });

  it("rejects a window entirely in the past", () => {
    const result = resolveBookingWindow({ startDate: "2026-01-01", endDate: "2026-02-01" }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("in the past");
  });

  it("rejects a horizon that would leave the link bookable indefinitely", () => {
    const result = resolveBookingWindow({ withinDays: MAX_WINDOW_HORIZON_DAYS + 1 }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(String(MAX_WINDOW_HORIZON_DAYS));
  });

  it("accepts a horizon exactly at the limit", () => {
    expect(resolveBookingWindow({ withinDays: MAX_WINDOW_HORIZON_DAYS }, NOW).ok).toBe(true);
  });

  it("rejects impossible calendar dates the regex would accept", () => {
    const result = resolveBookingWindow({ startDate: "2026-02-31", endDate: "2026-03-05" }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not a valid date");
  });

  it("rejects daily hours that are inverted or too short to book", () => {
    for (const [startTime, endTime] of [["17:00", "09:00"], ["09:00", "09:05"]]) {
      const result = resolveBookingWindow({ withinDays: 7, startTime, endTime }, NOW);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects an unknown time zone rather than silently using UTC", () => {
    const result = resolveBookingWindow({ withinDays: 7, timeZone: "Mars/Olympus" }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("time zone");
  });

  it("rejects a weekday rule with no matching day in the range", () => {
    // 2026-07-24 is a Friday, 07-25 a Saturday — no Tuesday or Thursday falls in
    // the range, so every field validates but the link is unbookable.
    const result = resolveBookingWindow(
      { startDate: "2026-07-24", endDate: "2026-07-25", weekdays: ["tue", "thu"] },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("No bookable days");
  });
});

describe("windowHasBookableDay", () => {
  const base = { weekdays: ["tue" as const], startMinute: 540, endMinute: 1020, timeZone: "America/Chicago" };

  it("finds a match inside a long range without walking every day", () => {
    expect(windowHasBookableDay({ ...base, startDate: "2026-07-22", endDate: "2027-01-01" })).toBe(true);
  });

  it("is false when a short range misses the allowed weekday", () => {
    expect(windowHasBookableDay({ ...base, startDate: "2026-07-24", endDate: "2026-07-25" })).toBe(false);
  });
});

describe("isWithinBookingWindow", () => {
  const window = resolved({
    startDate: "2026-09-01",
    endDate: "2026-10-31",
    weekdays: ["tue", "thu"],
    startTime: "12:00",
    endTime: "17:00",
  });

  it("accepts a booking on an allowed weekday inside the hours", () => {
    // 2026-09-01 is a Tuesday. 18:00Z = 13:00 CDT.
    expect(isWithinBookingWindow(new Date("2026-09-01T18:00:00.000Z"), window)).toBe(true);
  });

  it("rejects a booking before the range or after it", () => {
    expect(isWithinBookingWindow(new Date("2026-08-25T18:00:00.000Z"), window)).toBe(false);
    expect(isWithinBookingWindow(new Date("2026-11-03T18:00:00.000Z"), window)).toBe(false);
  });

  it("rejects a booking on a disallowed weekday", () => {
    // 2026-09-02 is a Wednesday.
    expect(isWithinBookingWindow(new Date("2026-09-02T18:00:00.000Z"), window)).toBe(false);
  });

  it("rejects a booking outside the daily hours", () => {
    // 15:00Z = 10:00 CDT, before the noon opening.
    expect(isWithinBookingWindow(new Date("2026-09-01T15:00:00.000Z"), window)).toBe(false);
    // 22:00Z = 17:00 CDT — end is exclusive, so a slot may not start on it.
    expect(isWithinBookingWindow(new Date("2026-09-01T22:00:00.000Z"), window)).toBe(false);
  });

  it("judges the boundary in workspace-local time, not UTC", () => {
    // 2026-09-02T02:00Z is Wednesday in UTC but 21:00 Tuesday in Chicago. It must
    // be rejected on hours, not accidentally accepted by a UTC weekday check.
    expect(isWithinBookingWindow(new Date("2026-09-02T02:00:00.000Z"), window)).toBe(false);
  });
});

describe("describeBookingWindow", () => {
  it("reads as a sentence an operator can approve without opening the provider", () => {
    const window = resolved({
      startDate: "2026-09-01",
      endDate: "2026-10-31",
      weekdays: ["tue", "thu"],
      startTime: "12:00",
      endTime: "17:00",
    });
    expect(describeBookingWindow(window)).toBe(
      "Tuesdays and Thursdays, 12:00–17:00 (America/Chicago) · Sep 1, 2026 – Oct 31, 2026",
    );
  });

  it("collapses an all-days window and a single-day range", () => {
    const window = resolved({ startDate: "2026-09-01", endDate: "2026-09-01" });
    expect(describeBookingWindow(window)).toContain("Any day");
    expect(describeBookingWindow(window)).toContain("Sep 1, 2026");
    expect(describeBookingWindow(window)).not.toContain("–  ");
  });

  it("names a single weekday in the plural", () => {
    const window = resolved({ withinDays: 30, weekdays: ["tue"] });
    expect(describeBookingWindow(window)).toContain("Tuesdays,");
  });
});

describe("toBookingWindowParams", () => {
  it("exposes only the fields every scheduler understands", () => {
    const window = resolved({
      startDate: "2026-09-01",
      endDate: "2026-10-31",
      weekdays: ["tue", "thu"],
      startTime: "12:00",
      endTime: "17:00",
    });
    expect(toBookingWindowParams(window)).toEqual({
      startDate: "2026-09-01",
      endDate: "2026-10-31",
      weekdays: ["tue", "thu"],
      startTime: "12:00",
      endTime: "17:00",
      timeZone: "America/Chicago",
    });
  });
});
