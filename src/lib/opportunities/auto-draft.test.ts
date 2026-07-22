import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runScheduledAutoDraft } from "./auto-draft";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("dry run", () => {
  it("is reported on the summary even when the pass is disabled", async () => {
    delete process.env.OPPORTUNITY_AUTO_DRAFT_ENABLED;
    process.env.OPPORTUNITY_AUTO_DRAFT_DRY_RUN = "1";
    const result = await runScheduledAutoDraft();
    expect(result.dryRun).toBe(true);
    expect(result.wouldDraft).toEqual([]);
  });

  it("can be forced by the caller regardless of the env", async () => {
    delete process.env.OPPORTUNITY_AUTO_DRAFT_DRY_RUN;
    const result = await runScheduledAutoDraft(new Date(), { dryRun: true });
    expect(result.dryRun).toBe(true);
  });

  it("cannot be turned off by the caller once the env requests it", async () => {
    // A dry run is a safety request. `{ dryRun: false }` must not override it,
    // or a caller silently promotes a rehearsal into real campaign writes.
    process.env.OPPORTUNITY_AUTO_DRAFT_DRY_RUN = "1";
    const result = await runScheduledAutoDraft(new Date(), { dryRun: false });
    expect(result.dryRun).toBe(true);
  });
});

describe("runScheduledAutoDraft — safety guards", () => {
  it("does nothing unless the flag is exactly \"1\"", async () => {
    // The whole feature is opt-in. A truthy-looking value must not arm it, or a
    // stray "true" in an env file starts writing campaigns unannounced.
    for (const value of [undefined, "", "0", "true", "yes", "on"]) {
      if (value === undefined) delete process.env.OPPORTUNITY_AUTO_DRAFT_ENABLED;
      else process.env.OPPORTUNITY_AUTO_DRAFT_ENABLED = value;

      const result = await runScheduledAutoDraft();
      expect(result.ran).toBe(false);
      expect(result.skipped).toBe("disabled");
      expect(result.drafted).toBe(0);
      expect(result.campaignIds).toEqual([]);
      expect(result.wouldDraft).toEqual([]);
    }
  });

  it("stops before touching the database when Supabase is not configured", async () => {
    process.env.OPPORTUNITY_AUTO_DRAFT_ENABLED = "1";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const result = await runScheduledAutoDraft();
    expect(result.ran).toBe(false);
    expect(result.skipped).toBe("not_configured");
    expect(result.drafted).toBe(0);
  });

  it("reports nothing drafted in every disabled shape", async () => {
    delete process.env.OPPORTUNITY_AUTO_DRAFT_ENABLED;
    const result = await runScheduledAutoDraft();
    // A caller logging this must never read a skipped pass as a successful one.
    expect(result).toMatchObject({ ran: false, drafted: 0, failed: 0, selected: 0, considered: 0 });
  });
});
