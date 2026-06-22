import { afterEach, describe, expect, it, vi } from "vitest";

import { recordUsageEvent } from "./persistence";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("recordUsageEvent", () => {
  it("no-ops and returns recorded:false when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_MARKETING_SUPABASE_URL;
    delete process.env.MARKETING_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY;

    const result = await recordUsageEvent({
      orgId: "org-1",
      workspaceId: "ws-1",
      service: "gemini_image",
      model: "gemini-2.5-flash-image",
      units: 1,
    });

    expect(result).toEqual({ recorded: false, reason: "not_configured" });
  });
});
