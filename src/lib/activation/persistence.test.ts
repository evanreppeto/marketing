import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(),
}));

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { dismissActivation, markBrandCaptured } from "./persistence";

const getAdmin = vi.mocked(getSupabaseAdminClient);
const configured = vi.mocked(isSupabaseAdminConfigured);
const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));

beforeEach(() => {
  upsert.mockReset().mockResolvedValue({ error: null });
  from.mockClear();
  getAdmin.mockReset().mockReturnValue({ from } as never);
  configured.mockReset().mockReturnValue(true);
});

describe("activation persistence", () => {
  it("markBrandCaptured upserts brand_captured_at keyed on org_id", async () => {
    await markBrandCaptured("org-1");

    expect(from).toHaveBeenCalledWith("org_onboarding_state");
    const [row, options] = upsert.mock.calls[0];
    expect(row).toMatchObject({ org_id: "org-1" });
    expect(typeof row.brand_captured_at).toBe("string");
    expect(options).toEqual({ onConflict: "org_id" });
  });

  it("dismissActivation upserts dismissed_at keyed on org_id", async () => {
    await dismissActivation("org-1");

    const [row] = upsert.mock.calls[0];
    expect(row).toMatchObject({ org_id: "org-1" });
    expect(typeof row.dismissed_at).toBe("string");
  });

  it("no-ops when Supabase is not configured", async () => {
    configured.mockReturnValue(false);

    await markBrandCaptured("org-1");

    expect(getAdmin).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
