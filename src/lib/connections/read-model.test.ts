import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getConnections } from "./read-model";

function row(overrides: Record<string, unknown> = {}) {
  return {
    provider: "resend",
    kind: "email",
    label: "Resend",
    enabled: true,
    env_var: "RESEND_API_KEY",
    config: { fromEmail: "Mark <mark@bsg.com>" },
    last_tested_at: "2026-06-09T00:00:00Z",
    last_test_ok: true,
    last_test_error: null,
    last_used_at: null,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("getConnections", () => {
  it("reports connected when the env secret is present, enabled, and last test passed", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const supabase = createSupabaseQueryMock({ connections: { data: [row()], error: null } });

    const [resend] = await getConnections(supabase);

    expect(resend).toMatchObject({ provider: "resend", status: "connected", enabled: true, fromEmail: "Mark <mark@bsg.com>" });
  });

  it("reports not_configured when the env secret is absent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const supabase = createSupabaseQueryMock({ connections: { data: [row()], error: null } });

    const [resend] = await getConnections(supabase);

    expect(resend.status).toBe("not_configured");
  });

  it("reports disabled when configured but the operator switch is off", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const supabase = createSupabaseQueryMock({ connections: { data: [row({ enabled: false })], error: null } });

    const [resend] = await getConnections(supabase);

    expect(resend.status).toBe("disabled");
  });

  it("reports error when enabled but the last test failed", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const supabase = createSupabaseQueryMock({
      connections: { data: [row({ last_test_ok: false, last_test_error: "Resend 401" })], error: null },
    });

    const [resend] = await getConnections(supabase);

    expect(resend).toMatchObject({ status: "error", lastTestError: "Resend 401" });
  });

  it("falls back to registry views when the query errors (e.g. table not migrated yet)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const supabase = createSupabaseQueryMock({
      connections: { data: null, error: { message: "Could not find the table 'public.connections'" } },
    });

    const views = await getConnections(supabase);

    // Registry-derived: every provider present, resend computed from env, none enabled.
    expect(views.map((view) => view.provider).sort()).toEqual(["facebook", "instagram", "linkedin", "resend", "x"]);
    const resend = views.find((view) => view.provider === "resend");
    expect(resend).toMatchObject({ enabled: false, status: "disabled" });
  });

  it("treats social providers (no env var) as not_configured", async () => {
    const supabase = createSupabaseQueryMock({
      connections: { data: [row({ provider: "instagram", kind: "social", label: "Instagram", env_var: null, enabled: false })], error: null },
    });

    const [ig] = await getConnections(supabase);

    expect(ig).toMatchObject({ provider: "instagram", kind: "social", status: "not_configured" });
  });
});
