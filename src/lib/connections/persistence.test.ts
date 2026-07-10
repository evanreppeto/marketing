import { describe, expect, it } from "vitest";

import { type ConnectionProvider } from "@/domain";
import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import { upsertConnection } from "./persistence";

function upsertArgs(supabase: MockSupabase): { row: Record<string, unknown>; opts: unknown } | null {
  const call = supabase.calls.find(([m]) => m === "upsert");
  return call ? { row: call[1] as Record<string, unknown>, opts: call[2] } : null;
}

describe("upsertConnection", () => {
  it("creates/enables the resend row keyed on provider, with registry-derived kind/label/env_var", async () => {
    const supabase = createSupabaseQueryMock({ connections: { data: null, error: null } });

    await upsertConnection(supabase, "resend", { enabled: true });

    const args = upsertArgs(supabase);
    expect(args).not.toBeNull();
    expect(args!.row).toMatchObject({
      provider: "resend",
      kind: "email",
      label: "Resend",
      env_var: "RESEND_API_KEY",
      enabled: true,
    });
    expect(args!.row).toHaveProperty("updated_at");
    // Conflict target must be the provider UNIQUE constraint so an existing row updates in place.
    expect(args!.opts).toEqual({ onConflict: "provider" });
    // A plain enable/disable must NOT write config — otherwise it would clobber a saved from-address.
    expect(args!.row).not.toHaveProperty("config");
  });

  it("disables without touching config", async () => {
    const supabase = createSupabaseQueryMock({ connections: { data: null, error: null } });

    await upsertConnection(supabase, "resend", { enabled: false });

    expect(upsertArgs(supabase)!.row).toMatchObject({ provider: "resend", enabled: false });
    expect(upsertArgs(supabase)!.row).not.toHaveProperty("config");
  });

  it("writes a trimmed config.fromEmail when a from-address is supplied", async () => {
    const supabase = createSupabaseQueryMock({ connections: { data: null, error: null } });

    await upsertConnection(supabase, "resend", { enabled: true, fromEmail: "  Arc <hi@bsr.com>  " });

    expect(upsertArgs(supabase)!.row.config).toEqual({ fromEmail: "Arc <hi@bsr.com>" });
  });

  it("throws on an unknown provider before hitting the database", async () => {
    const supabase = createSupabaseQueryMock({});

    await expect(
      upsertConnection(supabase, "nope" as unknown as ConnectionProvider, { enabled: true }),
    ).rejects.toThrow(/unknown provider/i);
    expect(supabase.calls).toHaveLength(0);
  });
});
