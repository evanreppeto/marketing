/**
 * Money at the Arc boundary.
 *
 * The DB stores cents; the app's own screens divide by 100 on the way to the
 * operator. Arc's routes handed the raw `*Cents` fields straight to the agent —
 * and since Arc's output IS prose for the operator, the cents came back out. A
 * live opportunity card on prod reads:
 *
 *   "outcome f17d059a (won, 1,240,000¢), c1721777 (won, 760,000¢) — $24,800 combined"
 *
 * Note what that shows: Arc's arithmetic was right ($24,800 is the correct total)
 * and only the unit was wrong. It was never confused — it was handed cents and
 * had nothing else to quote. So this is a boundary bug, not a prompting problem,
 * and no instruction to "remember these are cents" fixes it as reliably as simply
 * not handing the agent a unit humans don't speak.
 *
 * A number rather than a formatted string: Arc sums and compares these (it summed
 * three wins into $24,800), and it renders `grossRevenueUsd: 12400` as "$12,400"
 * without being asked. The `Usd` suffix is what carries the unit.
 */

/** Cents → dollars. Null/absent/non-finite stays null: a missing amount must not become $0. */
export function usdFromCents(cents: number | null | undefined): number | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  // Two decimals — cents are integers, but guard against a fractional value
  // upstream turning into a long float tail in the JSON Arc reads.
  return Math.round(cents) / 100;
}

/**
 * Swap a record's `<name>Cents` field for `<name>Usd`, dropping the cents so the
 * agent cannot quote them. Returns a new object; the input is untouched.
 */
export function centsToUsd<T extends Record<string, unknown>>(row: T, ...fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const field of fields) {
    if (!field.endsWith("Cents")) continue;
    if (!(field in out)) continue;
    const usdKey = `${field.slice(0, -"Cents".length)}Usd`;
    out[usdKey] = usdFromCents(out[field] as number | null | undefined);
    delete out[field];
  }
  return out;
}
