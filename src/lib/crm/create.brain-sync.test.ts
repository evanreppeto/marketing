import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

/**
 * An operator's CRM write must reach the Brain, exactly as Arc's own write already
 * does (lib/arc/record-writes.ts). Before this, the same edit became Arc-recallable
 * memory when Arc made it and vanished when a person made it.
 */

const { syncSpy } = vi.hoisted(() => ({ syncSpy: vi.fn(async () => ({ ok: true as const, id: "node-1" })) }));

let supabase: MockSupabase;

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(() => supabase),
}));
vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: vi.fn(async () => "org-fallback") }));
vi.mock("@/lib/personas/read-model", () => ({ getOrgPersonaKeys: vi.fn(async () => ["persona_landlord"]) }));
vi.mock("@/lib/brain-ingestion/sync", () => ({ syncRecordToBrain: syncSpy }));
vi.mock("./dedupe", () => ({ findExistingContactByEmail: vi.fn(async () => null) }));

import { insertCrmRecord, updateCrmRecordFields } from "./create";

beforeEach(() => {
  syncSpy.mockClear();
  syncSpy.mockResolvedValue({ ok: true as const, id: "node-1" });
});

describe("insertCrmRecord → Brain", () => {
  it("mirrors a newly created record into the Brain, org-scoped", async () => {
    supabase = createSupabaseQueryMock({ companies: { data: { id: "co-1" }, error: null } });

    await expect(insertCrmRecord({ objectKey: "companies", name: "Acme Restoration" }, "org-1")).resolves.toEqual({
      ok: true,
      id: "co-1",
    });
    expect(syncSpy).toHaveBeenCalledWith("companies", "co-1", { orgId: "org-1" });
  });

  it("does not sync a record that failed to insert", async () => {
    supabase = createSupabaseQueryMock({ companies: { data: null, error: { message: "insert exploded" } } });

    await expect(insertCrmRecord({ objectKey: "companies", name: "Acme" }, "org-1")).resolves.toEqual({
      ok: false,
      error: "insert exploded",
    });
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("still reports the write as saved when the Brain sync throws", async () => {
    supabase = createSupabaseQueryMock({ companies: { data: { id: "co-1" }, error: null } });
    syncSpy.mockRejectedValueOnce(new Error("brain unavailable"));

    // The row is committed; a memory hiccup is recoverable from the next backfill,
    // a false "couldn't save" shown to the operator is not.
    await expect(insertCrmRecord({ objectKey: "companies", name: "Acme" }, "org-1")).resolves.toEqual({
      ok: true,
      id: "co-1",
    });
  });
});

describe("updateCrmRecordFields → Brain", () => {
  it("mirrors an edited record into the Brain, so the change is recallable", async () => {
    supabase = createSupabaseQueryMock({ leads: { data: { id: "lead-1" }, error: null } });

    await expect(updateCrmRecordFields("leads", "lead-1", { status: "qualified" }, "org-1")).resolves.toEqual({
      ok: true,
      id: "lead-1",
    });
    expect(syncSpy).toHaveBeenCalledWith("leads", "lead-1", { orgId: "org-1" });
  });

  it("does not sync when there was nothing to update", async () => {
    supabase = createSupabaseQueryMock({ leads: { data: { id: "lead-1" }, error: null } });

    await expect(updateCrmRecordFields("leads", "lead-1", {}, "org-1")).resolves.toEqual({
      ok: false,
      error: "Nothing to update.",
    });
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("still reports the edit as saved when the Brain sync throws", async () => {
    supabase = createSupabaseQueryMock({ leads: { data: { id: "lead-1" }, error: null } });
    syncSpy.mockRejectedValueOnce(new Error("brain unavailable"));

    await expect(updateCrmRecordFields("leads", "lead-1", { status: "qualified" }, "org-1")).resolves.toEqual({
      ok: true,
      id: "lead-1",
    });
  });
});
