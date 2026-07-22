import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpportunityCandidate } from "@/domain";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () => mockClient,
}));
vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: async () => "org-1" }));

// Minimal Supabase query-builder stub capturing inserts and returning preset rows.
type ExistingRow = {
  subject_id: string;
  status: string;
  dismissed_at?: string | null;
  snoozed_until?: string | null;
};
let openRows: ExistingRow[] = [];
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

import { markOpportunityDrafted, upsertOpportunities } from "../persistence";

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

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
    openRows = [{ subject_id: "lead-A", status: "pending" }]; // already open
    const res = await upsertOpportunities([candidate("lead-A"), candidate("lead-B")]);
    expect(res.ok).toBe(true);
    expect(inserted.map((r) => r.subject_id)).toEqual(["lead-B"]); // A deduped
  });

  // Dedup used to consider only OPEN statuses, so dismissing a card did nothing
  // to the detector: the next scan re-inserted an identical one and the operator
  // could never actually clear the queue.
  it("does not resurrect a recently dismissed subject on the next scan", async () => {
    openRows = [{ subject_id: "lead-A", status: "dismissed", dismissed_at: daysFromNow(-2) }];
    const res = await upsertOpportunities([candidate("lead-A")]);
    expect(res.ok).toBe(true);
    expect(inserted).toEqual([]);
  });

  it("re-raises a subject once the dismissal cooldown has elapsed", async () => {
    openRows = [{ subject_id: "lead-A", status: "dismissed", dismissed_at: daysFromNow(-45) }];
    const res = await upsertOpportunities([candidate("lead-A")]);
    expect(res.ok).toBe(true);
    expect(inserted.map((r) => r.subject_id)).toEqual(["lead-A"]);
  });

  it("suppresses a snoozed subject whether or not the snooze has expired", async () => {
    openRows = [
      { subject_id: "lead-A", status: "snoozed", snoozed_until: daysFromNow(5) },
      { subject_id: "lead-B", status: "snoozed", snoozed_until: daysFromNow(-1) },
    ];
    const res = await upsertOpportunities([candidate("lead-A"), candidate("lead-B")]);
    expect(res.ok).toBe(true);
    // lead-A is still snoozed. lead-B's snooze expired — but the read model wakes
    // the ORIGINAL card, so re-inserting would show the operator two of it.
    expect(inserted).toEqual([]);
  });

  it("drops below-floor candidates and reports how many, rather than silently", async () => {
    const res = await upsertOpportunities([
      { ...candidate("lead-weak"), confidence: 45 },
      { ...candidate("lead-strong"), confidence: 85 },
    ]);
    expect(res).toEqual({ ok: true, count: 1, filtered: 1 });
    expect(inserted.map((r) => r.subject_id)).toEqual(["lead-strong"]);
  });

  it("skips the dedup round-trip entirely when nothing clears the floor", async () => {
    const res = await upsertOpportunities([{ ...candidate("lead-weak"), confidence: 10 }]);
    expect(res).toEqual({ ok: true, count: 0, filtered: 1 });
    expect(inserted).toEqual([]);
  });

  it("omits `filtered` when the floor rejected nothing", async () => {
    const res = await upsertOpportunities([{ ...candidate("lead-A"), confidence: 90 }]);
    expect(res).toEqual({ ok: true, count: 1 });
  });

  it("honours ARC_OPPORTUNITY_CONFIDENCE_FLOOR so a noisy workspace can tighten without a deploy", async () => {
    vi.stubEnv("ARC_OPPORTUNITY_CONFIDENCE_FLOOR", "95");
    const res = await upsertOpportunities([{ ...candidate("lead-A"), confidence: 90 }]);
    expect(res).toEqual({ ok: true, count: 0, filtered: 1 });
    vi.unstubAllEnvs();
  });

  it("scopes inserts to the explicit token org when provided (not the cookie/default org)", async () => {
    const res = await upsertOpportunities([candidate("lead-Z")], undefined as never, { orgId: "org-2" });
    expect(res.ok).toBe(true);
    expect(inserted[0]?.org_id).toBe("org-2"); // token scope wins over getCurrentOrgId() "org-1"
  });
});

describe("markOpportunityDrafted", () => {
  it("applies explicit org scope when provided", async () => {
    const supabase = createSupabaseQueryMock({ opportunities: { data: [], error: null } });

    await markOpportunityDrafted("opp-1", "camp-1", supabase, { orgId: "org-2" });

    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-2"]);
    expect(supabase.calls).toContainEqual(["eq", "id", "opp-1"]);
    expect(supabase.calls).toContainEqual(["update", { status: "drafted", campaign_id: "camp-1" }]);
  });
});
