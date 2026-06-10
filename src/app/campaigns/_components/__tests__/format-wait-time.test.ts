import { describe, expect, it } from "vitest";

import { formatWaitTime } from "../format-wait-time";

const NOW = Date.parse("2026-06-10T12:00:00Z");

describe("formatWaitTime", () => {
  it("returns 'just now' under a minute", () => {
    expect(formatWaitTime("2026-06-10T11:59:30Z", NOW)).toBe("just now");
  });
  it("returns minutes under an hour", () => {
    expect(formatWaitTime("2026-06-10T11:30:00Z", NOW)).toBe("30m");
  });
  it("returns hours under a day", () => {
    expect(formatWaitTime("2026-06-10T08:00:00Z", NOW)).toBe("4h");
  });
  it("stays a day-count past a week (not a calendar date)", () => {
    expect(formatWaitTime("2026-06-01T12:00:00Z", NOW)).toBe("9d");
  });
  it("clamps future timestamps to 'just now'", () => {
    expect(formatWaitTime("2026-06-10T12:05:00Z", NOW)).toBe("just now");
  });
  it("returns empty string for unparseable input", () => {
    expect(formatWaitTime("not-a-date", NOW)).toBe("");
  });
});
