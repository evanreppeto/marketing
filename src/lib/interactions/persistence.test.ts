import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: vi.fn(async () => "fallback-org") }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(() => true),
}));

import { getSupabaseAdminClient } from "@/lib/supabase/server";

import { insertNote } from "./persistence";

const getSupabaseMock = vi.mocked(getSupabaseAdminClient);

beforeEach(() => {
  getSupabaseMock.mockReset();
});

describe("interaction persistence", () => {
  it("stamps notes and companion activities with explicit org scope when provided", async () => {
    const supabase = createSupabaseQueryMock({
      crm_notes: { data: { id: "note-1" }, error: null },
      crm_activities: { data: { id: "activity-1" }, error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const result = await insertNote(
      {
        entityType: "lead",
        entityId: "lead-1",
        body: "Customer asked for a call back.",
        isPinned: false,
        isInternal: false,
        authorKind: "agent",
        authorName: "Arc",
      },
      { orgId: "org-1" },
    );

    expect(result).toEqual({ ok: true, id: "note-1" });
    expect(supabase.calls.filter((call) => call[0] === "insert").map((call) => call[1])).toEqual([
      expect.objectContaining({ org_id: "org-1", entity_id: "lead-1" }),
      expect.objectContaining({ org_id: "org-1", entity_id: "lead-1", metadata: { note_id: "note-1" } }),
    ]);
  });
});
