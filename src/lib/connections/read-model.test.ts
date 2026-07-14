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
    config: { fromEmail: "Arc <mark@bsg.com>" },
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

    expect(resend).toMatchObject({ provider: "resend", status: "connected", enabled: true, fromEmail: "Arc <mark@bsg.com>" });
  });

  it("reports not_configured when the env secret is absent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const supabase = createSupabaseQueryMock({ connections: { data: [row()], error: null } });

    const [resend] = await getConnections(supabase);

    expect(resend.status).toBe("not_configured");
  });

  it("counts a stored workspace key as configured even when the env var is absent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const supabase = createSupabaseQueryMock({
      connections: { data: [row({ credential_ref: "vault-ref-1" })], error: null },
    });

    const [resend] = await getConnections(supabase);

    expect(resend).toMatchObject({ provider: "resend", status: "connected", credentialPresent: true });
  });

  it("marks credentialPresent false when only the env var backs the connection", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    const supabase = createSupabaseQueryMock({ connections: { data: [row()], error: null } });

    const [resend] = await getConnections(supabase);

    expect(resend).toMatchObject({ status: "connected", credentialPresent: false });
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
    expect(views.map((view) => view.provider).sort()).toEqual([
      "facebook",
      "google_drive",
      "instagram",
      "linkedin",
      "resend",
      "x",
    ]);
    const resend = views.find((view) => view.provider === "resend");
    expect(resend).toMatchObject({ enabled: false, status: "disabled" });
  });

  it("adds registry providers missing from an older connections table", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_live");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "secret");
    const supabase = createSupabaseQueryMock({ connections: { data: [row()], error: null } });

    const views = await getConnections(supabase);

    expect(views.some((view) => view.provider === "google_drive")).toBe(true);
    expect(views.find((view) => view.provider === "google_drive")).toMatchObject({
      enabled: false,
      status: "disabled",
      requiredEnvVars: ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET"],
    });
  });

  it("uses the user-scoped Google Drive row as the connected source of truth", async () => {
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "secret");
    const supabase = createSupabaseQueryMock({
      connections: {
        data: [
          row({
            provider: "google_drive",
            kind: "storage",
            label: "Google Drive",
            env_var: "GOOGLE_DRIVE_CLIENT_ID",
            enabled: true,
            last_test_ok: false,
            last_test_error: "old token error",
          }),
        ],
        error: null,
      },
      google_drive_connections: {
        data: {
          connected_by: "user@example.com",
          connected_email: "user@gmail.com",
          connected_at: "2026-06-19T17:59:57.226Z",
          last_import_at: "2026-06-19T18:09:38.120Z",
          last_error: null,
        },
        error: null,
      },
    });

    const [drive] = await getConnections(supabase, { orgId: "org-1", connectedBy: "user@example.com" });

    expect(drive).toMatchObject({
      provider: "google_drive",
      status: "connected",
      lastTestOk: true,
      lastTestError: null,
      fromEmail: "user@gmail.com",
      lastUsedAt: "2026-06-19T18:09:38.120Z",
    });
  });

  it("falls back to legacy Drive connection keys for existing production rows", async () => {
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "secret");
    const supabase = createSupabaseQueryMock({
      connections: {
        data: [
          row({
            provider: "google_drive",
            kind: "storage",
            label: "Google Drive",
            env_var: "GOOGLE_DRIVE_CLIENT_ID",
            enabled: true,
          }),
        ],
        error: null,
      },
      google_drive_connections: [
        { data: null, error: null },
        {
          data: {
            connected_by: "Operator",
            connected_email: null,
            connected_at: "2026-06-19T17:59:57.226Z",
            last_import_at: null,
            last_error: null,
          },
          error: null,
        },
      ],
    });

    const [drive] = await getConnections(supabase, { orgId: "org-1", connectedBy: "user@example.com" });

    expect(drive).toMatchObject({
      provider: "google_drive",
      status: "connected",
      fromEmail: "Operator",
    });
  });

  it("treats social providers (no env var) as not_configured", async () => {
    const supabase = createSupabaseQueryMock({
      connections: { data: [row({ provider: "instagram", kind: "social", label: "Instagram", env_var: null, enabled: false })], error: null },
    });

    const [ig] = await getConnections(supabase);

    expect(ig).toMatchObject({ provider: "instagram", kind: "social", status: "not_configured" });
  });

  it("reports connected for instagram only when the full Meta block is present and enabled", async () => {
    vi.stubEnv("META_APP_ID", "a");
    vi.stubEnv("META_APP_SECRET", "b");
    vi.stubEnv("META_IG_USER_ID", "ig-1");
    vi.stubEnv("META_PAGE_ACCESS_TOKEN", "tok");
    const supabase = createSupabaseQueryMock({
      connections: { data: [row({ provider: "instagram", kind: "social", label: "Instagram", env_var: "META_PAGE_ACCESS_TOKEN", enabled: true })], error: null },
    });

    const [ig] = await getConnections(supabase);

    expect(ig).toMatchObject({ provider: "instagram", status: "connected" });
  });

  it("reports not_configured for instagram when one Meta var is missing", async () => {
    vi.stubEnv("META_APP_ID", "a");
    vi.stubEnv("META_APP_SECRET", "b");
    vi.stubEnv("META_IG_USER_ID", "ig-1");
    // META_PAGE_ACCESS_TOKEN intentionally unset.
    const supabase = createSupabaseQueryMock({
      connections: { data: [row({ provider: "instagram", kind: "social", label: "Instagram", env_var: "META_PAGE_ACCESS_TOKEN", enabled: true })], error: null },
    });

    const [ig] = await getConnections(supabase);

    expect(ig.status).toBe("not_configured");
  });

  it("surfaces the provider's requiredEnvVars on the view", async () => {
    const supabase = createSupabaseQueryMock({
      connections: { data: [row({ provider: "x", kind: "social", label: "X", env_var: "X_API_KEY", enabled: false })], error: null },
    });

    const [x] = await getConnections(supabase);

    expect(x.requiredEnvVars).toEqual(["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]);
  });
});
