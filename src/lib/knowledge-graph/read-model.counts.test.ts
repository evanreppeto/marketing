import { describe, expect, it, vi } from "vitest";

import { countNodesByTier } from "./read-model";

/**
 * The Brain's tiles must count the brain, not the page.
 *
 * They were derived from listNodes, which caps at 200 rows ordered by updated_at.
 * On prod's 422-node brain that rendered:
 *
 *   Knowledge nodes 200 (of 422) · Trusted 0 (of 37) · Observed 200 (of 384)
 *   · Awaiting review 0 (of 1)
 *
 * Not merely truncated — the cap is a recency window, so the 37 trusted nodes fell
 * outside it and the tile claimed Arc had NO knowledge approved for outbound, on a
 * page whose entire subject is what Arc knows.
 *
 * These assert the query CONTRACT: exact counts, per tier, archived excluded,
 * never a page of rows counted in memory. A fixture can't reproduce a 200-row cap
 * against a mock, so the thing worth pinning is that we ask the database to count.
 */

type Call = { table: string; head?: boolean; count?: string; filters: Array<[string, string, string]> };

/** Minimal PostgREST double that records how the count was asked for. */
function mockClient(counts: Record<string, number>, calls: Call[] = []) {
  return {
    calls,
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      q.select = (_cols: string, opts?: { count?: string; head?: boolean }) => {
        call.count = opts?.count;
        call.head = opts?.head;
        return q;
      };
      const add = (op: string) => (col: string, val: string) => {
        call.filters.push([op, col, val]);
        return q;
      };
      q.eq = add("eq");
      q.neq = add("neq");
      // Awaiting the builder resolves it, as PostgREST's does.
      q.then = (resolve: (v: unknown) => unknown) => {
        const tier = call.filters.find((f) => f[1] === "trust_tier");
        const key = tier ? `${tier[0]}:${tier[2]}` : "all";
        return resolve({ count: counts[key] ?? 0, error: null });
      };
      return q;
    },
  } as never;
}

// Prod's real shape: 422 total, 37 trusted, 384 observed, 1 proposed.
const PROD_COUNTS = {
  "neq:archived": 422,
  "eq:trusted": 37,
  "eq:observed": 384,
  "eq:proposed": 1,
};

describe("countNodesByTier", () => {
  it("reports the whole brain, not a page of it", async () => {
    const result = await countNodesByTier(mockClient(PROD_COUNTS), "org-1");
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.counts).toEqual({ total: 422, trusted: 37, observed: 384, proposed: 1 });
  });

  it("asks the database to count rather than counting rows it fetched", async () => {
    // The bug in one line: a page of rows counted in memory. Every query must be a
    // head request with an exact count, so no row limit can ever skew a tile.
    const calls: Call[] = [];
    await countNodesByTier(mockClient(PROD_COUNTS, calls), "org-1");
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.table).toBe("knowledge_nodes");
      expect(call.count, "must be an exact count").toBe("exact");
      expect(call.head, "must not fetch rows").toBe(true);
    }
  });

  it("scopes every count to the org", async () => {
    const calls: Call[] = [];
    await countNodesByTier(mockClient(PROD_COUNTS, calls), "org-1");
    for (const call of calls) {
      expect(call.filters).toContainEqual(["eq", "org_id", "org-1"]);
    }
  });

  it("excludes archived from the total, matching what the list shows", async () => {
    const calls: Call[] = [];
    await countNodesByTier(mockClient(PROD_COUNTS, calls), "org-1");
    const totalCall = calls.find((c) => c.filters.some((f) => f[0] === "neq" && f[1] === "trust_tier"));
    expect(totalCall?.filters).toContainEqual(["neq", "trust_tier", "archived"]);
  });

  it("never queries a tier the enum doesn't have", async () => {
    // knowledge_trust_tier is observed|proposed|trusted|rejected|archived. The page
    // used to add tier("core") — always 0, and an .in([...,"core"]) would throw
    // 22P02 against the real enum.
    const calls: Call[] = [];
    await countNodesByTier(mockClient(PROD_COUNTS, calls), "org-1");
    const tiers = calls.flatMap((c) => c.filters.filter((f) => f[1] === "trust_tier").map((f) => f[2]));
    const VALID = ["observed", "proposed", "trusted", "rejected", "archived"];
    for (const tier of tiers) expect(VALID, `tier "${tier}"`).toContain(tier);
  });

  it("surfaces a query error instead of reporting zero facts", async () => {
    // "Arc knows nothing" and "the count failed" must not look the same.
    const broken = {
      from() {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.neq = () => q;
        q.then = (resolve: (v: unknown) => unknown) => resolve({ count: null, error: { message: "boom" } });
        return q;
      },
    } as never;
    const result = await countNodesByTier(broken, "org-1");
    expect(result.status).toBe("unavailable");
  });
});

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () => {
    throw new Error("test must inject a client");
  },
}));
