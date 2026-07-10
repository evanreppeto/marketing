import { afterEach, describe, expect, it, vi } from "vitest";

import { countPendingOpportunities, getOpportunityForDraft, listOpenOpportunities } from "./read-model";

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

  it("returns empty / null (no crash) when Supabase is unconfigured and demo mode is off", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "0");

    await expect(listOpenOpportunities()).resolves.toEqual([]);
    await expect(countPendingOpportunities()).resolves.toBe(0);
    await expect(getOpportunityForDraft("demo-opp-storm-riverside")).resolves.toBeNull();
  });
});
