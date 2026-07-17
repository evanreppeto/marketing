import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the Arc CRM routes are allowed to say.
 *
 * Arc's output IS prose for the operator, so whatever these routes hand it can end
 * up quoted verbatim on a card. A live prod opportunity read:
 *
 *   "outcome f17d059a (won, 1,240,000¢) ... their companies 08b76650, 5ddcc386,
 *    27333a56 are all tagged plumbing_partner"
 *
 * — cents and uuids, because cents and uuids were all these routes gave it.
 *
 * This asserts the response, not the helpers. The helpers had their own green unit
 * tests while #484 rewrote these routes from a branch cut before #485 landed and
 * silently dropped centsToUsd: money.ts stayed, its tests stayed green, and nothing
 * imported it. A test that only exercises a helper cannot see that it was unplugged.
 */

vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({ orgId: "org-1", workspaceId: "workspace-1" })),
}));

const OUTCOME = {
  id: "f17d059a-1111-2222-3333-444444444444",
  companyId: "co_1",
  contactId: "ct_1",
  persona: "unassigned_persona",
  status: "won",
  grossRevenueCents: 1_240_000,
  grossMarginCents: 437_200,
};
const JOB = {
  id: "j1",
  companyId: "co_1",
  contactId: null,
  status: "scheduled",
  estimatedRevenueCents: 760_000,
};
const LEAD = { id: "c1aa307a-0000-0000-0000-000000000000", companyId: "co_1", contactId: "ct_1", status: "qualified" };

vi.mock("@/lib/repos", () => ({
  listCompaniesPage: vi.fn(async () => ({ companies: [], total: 0 })),
  listContactsPage: vi.fn(async () => ({ contacts: [], total: 0 })),
  listPropertiesPage: vi.fn(async () => ({ properties: [], total: 0 })),
  listLeadsPage: vi.fn(async () => ({ leads: [LEAD], total: 1 })),
  listJobsPage: vi.fn(async () => ({ jobs: [JOB], total: 1 })),
  listOutcomesPage: vi.fn(async () => ({ outcomes: [OUTCOME], total: 1 })),
}));

// The name lookup is the only thing these routes touch Supabase for.
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () => {
    const rows: Record<string, unknown[]> = {
      companies: [{ id: "co_1", name: "North Shore Property Group" }],
      contacts: [{ id: "ct_1", full_name: "Dana Whitfield" }],
    };
    const chain = (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) q[m] = () => q;
      // Awaiting the builder resolves it, as PostgREST's does.
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null });
      return q;
    };
    return { from: (table: string) => chain(table) };
  },
}));

import { GET as getJobs } from "./jobs/route";
import { GET as getLeads } from "./leads/route";
import { GET as getOutcomes } from "./outcomes/route";

const env = { ...process.env };
beforeEach(() => {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});
afterEach(() => {
  process.env = { ...env };
});

const call = async (handler: (r: Request) => Promise<Response>, path: string) => {
  const res = await handler(
    new Request(`http://localhost/api/v1/arc/crm/${path}`, { headers: { authorization: "Bearer secret" } }),
  );
  return res.json();
};

describe("what the Arc CRM routes hand the agent", () => {
  it("gives outcomes money in dollars and never in cents", async () => {
    const body = await call(getOutcomes, "outcomes?status=won");
    const [outcome] = body.outcomes;
    expect(outcome.grossRevenueUsd).toBe(12_400);
    expect(outcome.grossMarginUsd).toBe(4_372);
    expect(outcome).not.toHaveProperty("grossRevenueCents");
    expect(outcome).not.toHaveProperty("grossMarginCents");
  });

  it("gives jobs money in dollars and never in cents", async () => {
    const body = await call(getJobs, "jobs?status=scheduled");
    expect(body.jobs[0].estimatedRevenueUsd).toBe(7_600);
    expect(body.jobs[0]).not.toHaveProperty("estimatedRevenueCents");
  });

  it("never mentions cents anywhere in a CRM response", async () => {
    // The blunt version of the contract, and the one that survives a refactor
    // rewriting these routes: whatever else changes, no cents may reach Arc.
    for (const [handler, path] of [
      [getOutcomes, "outcomes"],
      [getJobs, "jobs"],
      [getLeads, "leads"],
    ] as const) {
      const body = await call(handler, path);
      expect(JSON.stringify(body), path).not.toMatch(/Cents/);
    }
  });

  it("names the company and contact so Arc has something besides a uuid to quote", async () => {
    for (const [handler, path, key] of [
      [getOutcomes, "outcomes", "outcomes"],
      [getJobs, "jobs", "jobs"],
      [getLeads, "leads", "leads"],
    ] as const) {
      const body = await call(handler, path);
      expect(body[key][0].companyName, path).toBe("North Shore Property Group");
    }
    const outcomes = await call(getOutcomes, "outcomes");
    expect(outcomes.outcomes[0].contactName).toBe("Dana Whitfield");
  });

  it("keeps the ids — Arc still needs them to fetch and link records", async () => {
    const body = await call(getOutcomes, "outcomes");
    expect(body.outcomes[0].companyId).toBe("co_1");
    expect(body.outcomes[0].id).toBe(OUTCOME.id);
  });

  it("leaves a name null rather than falling back to the uuid", async () => {
    // A job with no contact link must not report contactName: "j1"-ish nonsense.
    const body = await call(getJobs, "jobs");
    expect(body.jobs[0].contactName).toBeNull();
  });

  it("still returns the paging contract #484 added", async () => {
    // These routes carry two contracts now; neither may quietly drop the other.
    const body = await call(getOutcomes, "outcomes?limit=10");
    expect(body.total).toBe(1);
  });
});
