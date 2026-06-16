import { describe, expect, it } from "vitest";

import { relativeTime } from "./relative-time";

const NOW = Date.parse("2026-06-09T12:00:00Z");

describe("relativeTime", () => {
  it("shows 'now' under a minute", () => {
    expect(relativeTime("2026-06-09T11:59:30Z", NOW)).toBe("now");
  });
  it("shows minutes under an hour", () => {
    expect(relativeTime("2026-06-09T11:30:00Z", NOW)).toBe("30m");
  });
  it("shows hours under a day", () => {
    expect(relativeTime("2026-06-09T09:00:00Z", NOW)).toBe("3h");
  });
  it("shows a weekday under a week", () => {
    // 2026-06-07 is a Sunday.
    expect(relativeTime("2026-06-07T12:00:00Z", NOW)).toBe("Sun");
  });
  it("shows a short date beyond a week", () => {
    expect(relativeTime("2026-05-01T12:00:00Z", NOW)).toBe("May 1");
  });
  it("returns empty string for an unparseable value", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("");
  });
});
