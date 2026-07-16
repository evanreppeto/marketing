import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: mocks.getSupabaseAdminClient,
  isSupabaseAdminConfigured: mocks.isSupabaseAdminConfigured,
}));

import { checkWorkspaceBearer } from "./api-token";
import { TOKEN_SCOPE_ARC_FULL, TOKEN_SCOPE_LEADS_INGEST, tokenAllows } from "@/lib/agent/tokens";

function req(token?: string) {
  return { headers: { get: (n: string) => (n.toLowerCase() === "authorization" && token ? `Bearer ${token}` : null) } };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  delete process.env.LEADS_INGEST_API_TOKEN;
});

describe("tokenAllows", () => {
  it("treats a legacy token (null/empty scopes) as unrestricted", () => {
    expect(tokenAllows(null, TOKEN_SCOPE_LEADS_INGEST)).toBe(true);
    expect(tokenAllows([], TOKEN_SCOPE_LEADS_INGEST)).toBe(true);
  });

  it("allows an explicitly scoped token only for its scope", () => {
    expect(tokenAllows([TOKEN_SCOPE_LEADS_INGEST], TOKEN_SCOPE_LEADS_INGEST)).toBe(true);
    expect(tokenAllows([TOKEN_SCOPE_LEADS_INGEST], "arc:run")).toBe(false);
  });

  it("treats arc:full as a superset", () => {
    expect(tokenAllows([TOKEN_SCOPE_ARC_FULL], TOKEN_SCOPE_LEADS_INGEST)).toBe(true);
  });
});

/**
 * The point of this gate: a per-workspace token resolves the CALLER's org, so the
 * route stops guessing via the session. That's what makes lead ingest multi-tenant.
 */
describe("checkWorkspaceBearer", () => {
  const opts = { scope: TOKEN_SCOPE_LEADS_INGEST, required: true };

  it("resolves the org from a per-workspace token", async () => {
    const verify = vi.fn().mockResolvedValue({ ok: true, workspaceId: "ws-b", orgId: "org-b", scopes: [TOKEN_SCOPE_LEADS_INGEST] });
    const res = await checkWorkspaceBearer(req("sk_live_tenantB"), "LEADS_INGEST_API_TOKEN", { ...opts, verify });
    expect(res).toEqual({ ok: true, tokenSource: "database", orgId: "org-b", workspaceId: "ws-b" });
  });

  it("refuses a token that lacks the scope (a website key can't reach Arc)", async () => {
    const verify = vi.fn().mockResolvedValue({ ok: true, workspaceId: "ws-b", orgId: "org-b", scopes: ["arc:run"] });
    const res = await checkWorkspaceBearer(req("sk_live_narrow"), "LEADS_INGEST_API_TOKEN", { ...opts, verify });
    expect(res).toEqual({ ok: false, status: 401, reason: "unauthorized" });
  });

  it("accepts a legacy unscoped token (back-compat)", async () => {
    const verify = vi.fn().mockResolvedValue({ ok: true, workspaceId: "ws-a", orgId: "org-a", scopes: null });
    const res = await checkWorkspaceBearer(req("sk_live_legacy"), "LEADS_INGEST_API_TOKEN", { ...opts, verify });
    expect(res).toMatchObject({ ok: true, orgId: "org-a" });
  });

  it("still honours the shared env token, but resolves NO org (that's the single-tenant path)", async () => {
    process.env.LEADS_INGEST_API_TOKEN = "shared-env-token";
    const verify = vi.fn();
    const res = await checkWorkspaceBearer(req("shared-env-token"), "LEADS_INGEST_API_TOKEN", { ...opts, verify });
    expect(res).toEqual({ ok: true, tokenSource: "env" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects an unknown token", async () => {
    const verify = vi.fn().mockResolvedValue({ ok: false });
    const res = await checkWorkspaceBearer(req("sk_live_bogus"), "LEADS_INGEST_API_TOKEN", { ...opts, verify });
    expect(res).toEqual({ ok: false, status: 401, reason: "unauthorized" });
  });

  it("stays open when nothing is configured and the endpoint isn't required (dev)", async () => {
    const res = await checkWorkspaceBearer(req(), "LEADS_INGEST_API_TOKEN", { scope: TOKEN_SCOPE_LEADS_INGEST, required: false });
    expect(res).toEqual({ ok: true, tokenSource: "env" });
  });

  it("refuses with 503 when required and nothing is configured", async () => {
    const res = await checkWorkspaceBearer(req(), "LEADS_INGEST_API_TOKEN", opts);
    expect(res).toEqual({ ok: false, status: 503, reason: "not_configured" });
  });
});
