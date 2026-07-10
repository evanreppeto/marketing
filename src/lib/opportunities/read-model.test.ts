import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import {
  countPendingOpportunities,
  getOpportunityForCampaign,
  getOpportunityForDraft,
  listOpenOpportunities,
} from "./read-model";

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

describe("opportunities demo fallback", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("serves a populated, source-backed inbox when Supabase is unconfigured and demo mode is on", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "1");

    const records = await listOpenOpportunities();

    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      expect(rec.title).toBeTruthy();
      expect(rec.summary).toBeTruthy();
      expect(rec.recommended_action).toBeTruthy();
      expect(["low", "medium", "high"]).toContain(rec.urgency);
      expect(rec.confidence).toBeGreaterThan(0);
      expect(["pending", "drafting", "drafted"]).toContain(rec.status);
    }
  });

  it("threads campaign_id onto a drafted opportunity so the inbox can link it", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "1");

    const records = await listOpenOpportunities();
    const drafted = records.find((r) => r.status === "drafted");

    // A drafted opportunity is one that has already been converted, so it must
    // carry the linked campaign id the UI turns into an "Open campaign →" CTA.
    expect(drafted).toBeDefined();
    expect(drafted?.campaign_id).toBeTruthy();
  });

  it("keeps the home hero count and the pending count derived from one source", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "1");

    const records = await listOpenOpportunities();
    const pending = await countPendingOpportunities();

    // The pending count is exactly the pending slice of the same inbox — so the
    // /arc chip can't disagree with the Opportunities screen.
    expect(pending).toBe(records.filter((r) => r.status === "pending").length);
  });

  it("loads a single demo opportunity for the Draft-with-Arc flow", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "1");

    const [first] = await listOpenOpportunities();
    const draft = await getOpportunityForDraft(first.id);

    expect(draft).not.toBeNull();
    expect(draft?.id).toBe(first.id);
    expect(draft?.title).toBe(first.title);
    expect(draft?.persona).toBe(first.evidence?.persona ?? "");
  });

  it("loads a single demo opportunity (campaignId null) for the campaign-conversion flow", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "1");

    const [first] = await listOpenOpportunities();
    const opp = await getOpportunityForCampaign(first.id);

    expect(opp).not.toBeNull();
    expect(opp?.id).toBe(first.id);
    expect(opp?.subjectType).toBe(first.subject_type);
    expect(opp?.subjectId).toBe(first.subject_id);
    // The demo read-model carries no DB link, so conversion always starts fresh.
    expect(opp?.campaignId).toBeNull();
  });

  it("returns empty / null (no crash) when Supabase is unconfigured and demo mode is off", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "0");

    await expect(listOpenOpportunities()).resolves.toEqual([]);
    await expect(countPendingOpportunities()).resolves.toBe(0);
    await expect(getOpportunityForDraft("demo-opp-storm-riverside")).resolves.toBeNull();
    await expect(getOpportunityForCampaign("demo-opp-storm-riverside")).resolves.toBeNull();
  });
});

describe("getOpportunityForCampaign (authoritative, org-scoped read)", () => {
  const ROW = {
    id: "opp-1",
    subject_type: "lead",
    subject_id: "11111111-2222-3333-4444-555555555555",
    title: "Oak Park homeowner comparing water-damage estimates",
    summary: "Visited the water-damage page three times.",
    confidence: 88,
    urgency: "high" as const,
    recommended_action: "Fast-track a same-day estimate with proof-of-work photos",
    recommended_campaign_type: "rapid_response",
    evidence: { persona: "persona_homeowner_emergency", leadScore: 91 },
    status: "pending",
    campaign_id: null,
  };

  it("scopes the read by org_id AND id and maps the row to the conversion shape", async () => {
    const supabase = createSupabaseQueryMock({ opportunities: { data: ROW, error: null } });

    const opp = await getOpportunityForCampaign("opp-1", "org-1", supabase);

    // The org filter is what denies cross-tenant reads — assert it's applied.
    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
    expect(supabase.calls).toContainEqual(["eq", "id", "opp-1"]);

    expect(opp).toMatchObject({
      id: "opp-1",
      subjectType: "lead",
      subjectId: ROW.subject_id,
      urgency: "high",
      recommendedAction: ROW.recommended_action,
      recommendedCampaignType: "rapid_response",
      persona: "persona_homeowner_emergency",
      status: "pending",
      campaignId: null,
    });
    expect(opp?.evidence).toMatchObject({ leadScore: 91 });
  });

  it("surfaces an existing campaign link so the action can stay idempotent", async () => {
    const supabase = createSupabaseQueryMock({
      opportunities: { data: { ...ROW, status: "drafted", campaign_id: "camp-existing" }, error: null },
    });

    const opp = await getOpportunityForCampaign("opp-1", "org-1", supabase);

    expect(opp?.status).toBe("drafted");
    expect(opp?.campaignId).toBe("camp-existing");
  });

  it("returns null when the opportunity is missing or the read errors", async () => {
    const missing = createSupabaseQueryMock({ opportunities: { data: null, error: null } });
    await expect(getOpportunityForCampaign("nope", "org-1", missing)).resolves.toBeNull();

    const errored = createSupabaseQueryMock({ opportunities: { data: null, error: { message: "boom" } } });
    await expect(getOpportunityForCampaign("opp-1", "org-1", errored)).resolves.toBeNull();
  });
});
