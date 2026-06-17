import { describe, expect, it } from "vitest";

import { ScheduledForError, validateScheduledFor } from "../dispatch-scheduling";

const now = new Date("2026-06-17T12:00:00Z");

describe("validateScheduledFor", () => {
  it("accepts a future time and returns a normalized ISO string", () => {
    expect(validateScheduledFor("2026-06-18T09:00:00Z", now)).toBe("2026-06-18T09:00:00.000Z");
  });

  it("normalizes a datetime-local (no zone) value to ISO", () => {
    const out = validateScheduledFor("2026-12-01T08:30", now);
    expect(out).toMatch(/^2026-12-01T\d{2}:30:00\.000Z$/);
  });

  it("rejects a past time", () => {
    expect(() => validateScheduledFor("2026-06-16T09:00:00Z", now)).toThrow(ScheduledForError);
  });

  it("rejects exactly now", () => {
    expect(() => validateScheduledFor("2026-06-17T12:00:00Z", now)).toThrow(ScheduledForError);
  });

  it("rejects blank / non-string / unparseable values", () => {
    expect(() => validateScheduledFor("", now)).toThrow(ScheduledForError);
    expect(() => validateScheduledFor("   ", now)).toThrow(ScheduledForError);
    expect(() => validateScheduledFor(undefined, now)).toThrow(ScheduledForError);
    expect(() => validateScheduledFor(42, now)).toThrow(ScheduledForError);
    expect(() => validateScheduledFor("not a date", now)).toThrow(ScheduledForError);
  });
});
