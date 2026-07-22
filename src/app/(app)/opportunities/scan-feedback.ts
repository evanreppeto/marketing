import type { ScanFeedback } from "./actions";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What the scan actually did, in one line.
 *
 * The `filtered` half is the point. A scan that found candidates but surfaced
 * none used to render as an unchanged inbox, which reads as "there was nothing
 * to find" when the truth is "nothing cleared the confidence bar" — two
 * different answers that shouldn't look the same.
 *
 * The wording says "below the confidence floor" rather than anything vaguer
 * because `filtered` counts exactly that. Candidates skipped by per-subject
 * dedup (already open, snoozed, inside a dismissal cooldown) are NOT counted
 * here, and the copy must not imply they are — that would turn an honest number
 * into a misleading one.
 *
 * Pure, so the copy is locked by tests rather than only by eye.
 */
export function scanMessage(result: ScanFeedback): string {
  if (!result.ok) return result.error;
  const { added, filtered } = result;
  const belowBar = filtered > 0 ? `${plural(filtered, "signal", "signals")} below the confidence floor` : "";
  if (added === 0) {
    return belowBar
      ? `No new opportunities added — ${belowBar}.`
      : "No new opportunities — everything Arc found is already in your inbox.";
  }
  const addedText = `Added ${plural(added, "opportunity", "opportunities")}`;
  return belowBar ? `${addedText} · ${belowBar}.` : `${addedText}.`;
}
