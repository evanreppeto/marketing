import { describe, expect, it } from "vitest";

import { formatScheduleLabel, resolveScheduledFor } from "../task-schedule";

const NOW = new Date("2026-06-11T12:00:00.000Z"); // Thursday

describe("resolveScheduledFor", () => {
  it("returns null for now", () => {
    expect(resolveScheduledFor("now", NOW)).toBeNull();
  });
  it("adds three hours for few_hours", () => {
    expect(resolveScheduledFor("few_hours", NOW)).toBe("2026-06-11T15:00:00.000Z");
  });
  it("uses next day at 09:00 UTC for tomorrow_am", () => {
    expect(resolveScheduledFor("tomorrow_am", NOW)).toBe("2026-06-12T09:00:00.000Z");
  });
  it("uses the upcoming Saturday 09:00 UTC for weekend", () => {
    expect(resolveScheduledFor("weekend", NOW)).toBe("2026-06-13T09:00:00.000Z");
  });
  it("rolls weekend forward when already past Saturday 9am", () => {
    const satNoon = new Date("2026-06-13T12:00:00.000Z");
    expect(resolveScheduledFor("weekend", satNoon)).toBe("2026-06-20T09:00:00.000Z");
  });
  it("accepts a future custom ISO", () => {
    expect(resolveScheduledFor("custom", NOW, "2026-07-01T14:30:00.000Z")).toBe("2026-07-01T14:30:00.000Z");
  });
  it("treats past / invalid / empty custom as now (null)", () => {
    expect(resolveScheduledFor("custom", NOW, "2020-01-01T00:00:00.000Z")).toBeNull();
    expect(resolveScheduledFor("custom", NOW, "not-a-date")).toBeNull();
    expect(resolveScheduledFor("custom", NOW, "")).toBeNull();
  });
});

describe("formatScheduleLabel", () => {
  it("labels null as Now", () => {
    expect(formatScheduleLabel(null, NOW)).toBe("Now");
  });
  it("labels same-day as Today", () => {
    expect(formatScheduleLabel("2026-06-11T15:00:00.000Z", NOW)).toBe("Today, 3:00 PM");
  });
  it("labels next day as Tomorrow", () => {
    expect(formatScheduleLabel("2026-06-12T09:00:00.000Z", NOW)).toBe("Tomorrow, 9:00 AM");
  });
  it("labels within a week as weekday", () => {
    expect(formatScheduleLabel("2026-06-13T09:00:00.000Z", NOW)).toBe("Sat, 9:00 AM");
  });
  it("labels beyond a week as month/day", () => {
    expect(formatScheduleLabel("2026-07-01T14:30:00.000Z", NOW)).toBe("Jul 1, 2:30 PM");
  });
});
