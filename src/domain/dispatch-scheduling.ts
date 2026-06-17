/** Operator-supplied deploy schedule time was missing or invalid. */
export class ScheduledForError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduledForError";
  }
}

/**
 * Validate an operator-supplied deploy schedule time. Returns the normalized ISO
 * (UTC) string. `now` is injected for testability. Throws ScheduledForError when the
 * value is absent/blank, not a string, unparseable, or not strictly in the future.
 * Deploy-now does not call this — there is no value to validate.
 */
export function validateScheduledFor(value: unknown, now: Date): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ScheduledForError("Pick a date and time to schedule the deploy.");
  }
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) {
    throw new ScheduledForError("That date and time isn't valid.");
  }
  if (when.getTime() <= now.getTime()) {
    throw new ScheduledForError("Pick a time in the future.");
  }
  return when.toISOString();
}
