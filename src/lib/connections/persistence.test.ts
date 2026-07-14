import { describe, expect, it } from "vitest";

import { type ConnectionProvider } from "@/domain";
import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import { clearConnectionCredentialRef, setConnectionCredentialRef, upsertConnection } from "./persistence";

function upsertArgs(supabase: MockSupabase): { row: Record<string, unknown>; opts: unknown } | null {
  const call = supabase.calls.find(([m]) => m === "upsert");
  return call ? { row: call[1] as Record<string, unknown>, opts: call[2] } : null;
}

function updateArg(supabase: MockSupabase): Record<string, unknown> | null {
  const call = supabase.calls.find(([m]) => m === "update");
  return call ? (call[1] as Record<string, unknown>) : null;
}

describe("upsertConnection", () => {
  it("creates/enables the resend row keyed on (org_id, provider), with registry-derived kind/label/env_var", async () => {
    const supabase = createSupabaseQueryMock({ connections: { data: null, error: null } });

    await upsertConnection(supabase, "org-1", "resend", { enabled: true });

    const args = upsertArgs(supabase);
    expect(args).not.toBeNull();
    expect(args!.row).toMatchObject({
      org_id: "org-1",
      provider: "resend",
      kind: "email",
      label: "Resend",
      env_var: "RESEND_API_KEY",
      enabled: true,
    });
    expect(args!.row).toHaveProperty("updated_at");
    // Conflict target is the per-org UNIQUE (org_id, provider) so an existing row updates in place.
    expect(args!.opts).toEqual({ onConflict: "org_id,provider" });
    // A plain enable/disable must NOT write config — otherwise it would clobber a saved from-address.
    expect(args!.row).not.toHaveProperty("config");
  });

  it("disables without touching config", async () => {
    const supabase = createSupabaseQueryMock({ connections: { data: null, error: null } });

    await upsertConnection(supabase, "org-1", "resend", { enabled: false });

    expect(upsertArgs(supabase)!.row).toMatchObject({ org_id: "org-1", provider: "resend", enabled: false });
    expect(upsertArgs(supabase)!.row).not.toHaveProperty("config");
  });

  it("writes a trimmed config.fromEmail when a from-address is supplied", async () => {
    const supabase = createSupabaseQueryMock({ connections: { data: null, error: null } });

    await upsertConnection(supabase, "org-1", "resend", { enabled: true, fromEmail: "  Arc <hi@bsr.com>  " });

    expect(upsertArgs(supabase)!.row.config).toEqual({ fromEmail: "Arc <hi@bsr.com>" });
  });

  it("throws on an unknown provider before hitting the database", async () => {
    const supabase = createSupabaseQueryMock({});

    await expect(
      upsertConnection(supabase, "org-1", "nope" as unknown as ConnectionProvider, { enabled: true }),
    ).rejects.toThrow(/unknown provider/i);
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("setConnectionCredentialRef", () => {
  it("upserts the credential_ref keyed on (org_id, provider) without touching the enable switch", async () => {
    const supabase = createSupabaseQueryMock({ connections: { data: null, error: null } });

    await setConnectionCredentialRef(supabase, "org-1", "resend", "vault-ref-1");

    const args = upsertArgs(supabase);
    expect(args).not.toBeNull();
    expect(args!.row).toMatchObject({
      org_id: "org-1",
      provider: "resend",
      kind: "email",
      label: "Resend",
      env_var: "RESEND_API_KEY",
      credential_ref: "vault-ref-1",
    });
    // Never in the payload — saving/rotating a key must not flip sending on or off.
    expect(args!.row).not.toHaveProperty("enabled");
    expect(args!.opts).toEqual({ onConflict: "org_id,provider" });
  });

  it("throws on an unknown provider before hitting the database", async () => {
    const supabase = createSupabaseQueryMock({});

    await expect(
      setConnectionCredentialRef(supabase, "org-1", "nope" as unknown as ConnectionProvider, "ref"),
    ).rejects.toThrow(/unknown provider/i);
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("clearConnectionCredentialRef", () => {
  it("nulls credential_ref for the org's row without disabling sending", async () => {
    const supabase = createSupabaseQueryMock({ connections: { data: null, error: null } });

    await clearConnectionCredentialRef(supabase, "org-1", "resend");

    expect(updateArg(supabase)).toEqual({ credential_ref: null });
    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
    expect(supabase.calls).toContainEqual(["eq", "provider", "resend"]);
  });
});
