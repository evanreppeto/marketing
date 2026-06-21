import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent-tasks/scope", () => ({ getCurrentAgentTaskTenantFields: vi.fn(async () => ({ org_id: "o1", workspace_id: "w1" })) }));
vi.mock("@/lib/supabase/server", async () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () => globalThis.__client,
}));
import { hasRecentOpportunityScan } from "./recent-scan";

// Minimal chainable stub: .from().select().eq().eq().eq().gte().limit() -> { data, error }
function client(rows: unknown[], error: unknown = null) {
  const q: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "gte", "order"]) q[m] = () => q;
  q.limit = async () => ({ data: rows, error });
  return q;
}

describe("hasRecentOpportunityScan", () => {
  it("returns true when a recent scan task exists", async () => {
    (globalThis as Record<string, unknown>).__client = client([{ id: "t1" }]);
    expect(await hasRecentOpportunityScan(20)).toBe(true);
  });
  it("returns false when none exist", async () => {
    (globalThis as Record<string, unknown>).__client = client([]);
    expect(await hasRecentOpportunityScan(20)).toBe(false);
  });
  it("returns false (fail-open) on a query error", async () => {
    (globalThis as Record<string, unknown>).__client = client([], { message: "boom" });
    expect(await hasRecentOpportunityScan(20)).toBe(false);
  });
});
