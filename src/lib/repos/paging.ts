import { type SupabaseClient } from "@supabase/supabase-js";

/**
 * One query path for "a page of rows, plus the exact total it came from".
 *
 * Every repo list goes through here so the row query and the count query cannot
 * drift apart — a count that honours different filters than the list it
 * accompanies is worse than no count, because it's confidently wrong. (This is
 * not hypothetical: `countLeads` used to accept `q`/`minScore`/`maxScore` and
 * silently ignore all three.)
 *
 * `limit: 0` is count-only: Postgres reports the count and no body is fetched.
 */

export type RepoPage<T> = { rows: T[]; total: number };

/** Structural view of the Supabase filter builder — just what repos chain onto. */
export type FilterChain = {
  eq(column: string, value: unknown): FilterChain;
  gte(column: string, value: unknown): FilterChain;
  lte(column: string, value: unknown): FilterChain;
  ilike(column: string, pattern: string): FilterChain;
  or(filters: string): FilterChain;
};

type PageableQuery = {
  limit(count: number): PageableQuery;
  order(
    column: string,
    options: { ascending: boolean },
  ): PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>;
};

export type QueryPageOptions<T> = {
  client: SupabaseClient;
  table: string;
  /** Column to sort by, descending. */
  orderBy: string;
  /** Page size. `0` counts without fetching rows; omitted means unbounded. */
  limit?: number;
  /** Prefix for the thrown error, e.g. `listLeadsPage`. */
  label: string;
  parse: (row: unknown) => T;
  applyFilters: (query: FilterChain) => FilterChain;
};

export async function queryPage<T>(options: QueryPageOptions<T>): Promise<RepoPage<T>> {
  const countOnly = options.limit === 0;
  const selected = options.client
    .from(options.table)
    .select("*", { count: "exact", head: countOnly });

  // The builder is one object at runtime; the casts just narrow it to the
  // methods each stage uses.
  let query = options.applyFilters(selected as unknown as FilterChain) as unknown as PageableQuery;

  if (typeof options.limit === "number" && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error, count } = await query.order(options.orderBy, { ascending: false });

  if (error) {
    throw new Error(`${options.label} failed: ${error.message}`);
  }

  const rows = countOnly ? [] : ((data ?? []) as unknown[]).map(options.parse);
  // `count` is authoritative — it ignores `limit`, so it stays exact for a
  // capped page. It's only absent if the count was never requested, in which
  // case the rows we hold are the whole result.
  return { rows, total: count ?? rows.length };
}
