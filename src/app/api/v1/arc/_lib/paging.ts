/**
 * Shared paging contract for the Arc CRM read routes (/api/v1/arc/crm/*).
 *
 * Every list route returns a BOUNDED page plus the exact `total` it was drawn
 * from. The two halves matter for different reasons:
 *
 *  - `total` means a counting question ("how many leads do we have?") costs one
 *    call and no rows. Without it the only way to count was to fetch everything,
 *    which overflowed the runner's 8000-char tool budget and got sliced
 *    mid-JSON — so Arc answered "at least 64" against a CRM holding 200.
 *  - the cap means an unbounded read can't be requested by accident. `limit=0`
 *    is the count-only mode; there is deliberately no "give me everything".
 */

/** Rows returned when the caller doesn't ask for a page size. */
export const DEFAULT_LIST_LIMIT = 25;

/** Hard ceiling on a single page. */
export const MAX_LIST_LIMIT = 100;

/**
 * Read an integer query param, or undefined when it's absent or not an integer.
 *
 * Read the raw param FIRST. `Number(null)` is 0 and `Number.isInteger(0)` is
 * true, so coercing before the presence check turns an absent filter into a
 * real one — which is how an omitted `max_score` became `lead_score <= 0` and
 * silently hid every lead from Arc.
 */
export function intParam(url: URL, key: string): number | undefined {
  const raw = url.searchParams.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

/**
 * Page size for a list route: absent or invalid -> `DEFAULT_LIST_LIMIT`,
 * `0` -> count-only (no rows), anything above `MAX_LIST_LIMIT` is clamped.
 *
 * Invalid input falls back to the default rather than to "unbounded", so a typo
 * can never widen a read.
 */
export function readLimit(url: URL): number {
  const value = intParam(url, "limit");
  if (value === undefined || value < 0) return DEFAULT_LIST_LIMIT;
  return Math.min(value, MAX_LIST_LIMIT);
}

export type PageMeta = {
  /** Exact count of ALL rows matching the filters, ignoring `limit`. */
  total: number;
  /** How many rows are actually in this response. */
  returned: number;
  limit: number;
  /** True when the filters match more rows than this page carries. */
  has_more: boolean;
};

/** Envelope fields that travel with every capped list response. */
export function pageMeta(total: number, returned: number, limit: number): PageMeta {
  return { total, returned, limit, has_more: returned < total };
}
