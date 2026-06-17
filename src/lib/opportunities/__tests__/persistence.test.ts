import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpportunityCandidate } from "@/domain";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () => mockClient,
}));
vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: async () => "org-1" }));

// Minimal Supabase query-builder stub capturing inserts and returning preset rows.
let openRows: Array<{ subject_id: string }> = [];
let inserted: Array<Record<string, unknown>> = [];
const mockClient = {
  from() {
    return {
      select() {
        return {
          eq() {
            return this;
          },
          in: async () => ({ data: openRows, error: null }),
        };
      },
      insert: async (rows: Array<Record<string, unknown>>) => {
        inserted.push(...rows);
        return { error: null };
      },
    };
  },
} as never;

import { upsertOpportunities } from "../persistence";

function candidate(id: string): OpportunityCandidate {
  return {
    kind: "crm_inactivity",
    subjectType: "lead",
    subjectId: id,
    title: `lead ${id}`,
    summary: "s",
    confidence: 60,
    urgency: "medium",
    evidence: { daysCold: 40, leadScore: 60, persona: "persona_landlord", lastActivityAt: "2026-05-01T00:00:00.000Z" },
    recommendedAction: "Re-engage",
    recommendedCampaignType: "re_engagement",
  };
}

beforeEach(() => {
  openRows = [];
  inserted = [];
});
afterEach(() => vi.clearAllMocks());

describe("upsertOpportunities", () => {
  it("inserts new candidates whose subject has no open opportunity", async () => {
    openRows = [{ subject_id: "lead-A" }]; // already open
    const res = await upsertOpportunities([candidate("lead-A"), candidate("lead-B")]);
    expect(res.ok).toBe(true);
    expect(inserted.map((r) => r.subject_id)).toEqual(["lead-B"]); // A deduped
  });
});
