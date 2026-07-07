import { afterEach, describe, expect, it, vi } from "vitest";

import { listApprovalCards } from "@/lib/approvals/read-model";
import { listOpenOpportunities } from "@/lib/opportunities/read-model";

import { getNavBadges, getWorkspaceSummary } from "./read-model";

const SUPABASE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_MARKETING_SUPABASE_URL",
  "MARKETING_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MARKETING_SUPABASE_SERVICE_ROLE_KEY",
];

function unconfigureSupabase() {
  for (const key of SUPABASE_ENV) vi.stubEnv(key, "");
}

describe("workspace summary — nav badges", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("badges the rail with counts that match the screens they point at (demo mode)", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "1");

    const badges = await getNavBadges("demo-org");
    const opportunities = await listOpenOpportunities();
    const approvals = await listApprovalCards({ limit: 5 });

    // The Opportunities badge must equal the "N open" the Opportunities screen
    // shows, and the Campaigns badge must equal the "waiting on you" queue.
    expect(badges["/opportunities"]).toBe(opportunities.length);
    expect(badges["/campaigns"]).toBe(approvals.length);
    expect(badges["/opportunities"]).toBeGreaterThan(0);
    expect(badges["/campaigns"]).toBeGreaterThan(0);
  });

  it("omits zero-count badges so the rail never shows an empty pill", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "0");

    // No Supabase + demo off → every source is empty, so no badges at all.
    const badges = await getNavBadges("empty-org");
    expect(badges).toEqual({});
  });

  it("exposes a consistent summary snapshot the badges derive from", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "1");

    const summary = await getWorkspaceSummary("demo-org-2");
    expect(summary.opportunities.length).toBeGreaterThan(0);
    expect(summary.approvals.length).toBeGreaterThan(0);
    expect(summary.campaignTotals.total).toBeGreaterThan(0);
    expect(summary.crm.leads).toBeGreaterThan(0);
  });
});
