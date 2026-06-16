import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkAgentBearer } from "./api-token";

function req(token?: string) {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "authorization" && token ? `Bearer ${token}` : null),
    },
  };
}

describe("checkAgentBearer", () => {
  const originalToken = process.env.ARC_AGENT_API_TOKEN;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    delete process.env.ARC_AGENT_API_TOKEN;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ARC_AGENT_API_TOKEN;
    else process.env.ARC_AGENT_API_TOKEN = originalToken;
    if (originalSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    if (originalSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseKey;
  });

  it("accepts the env token for back-compat", async () => {
    process.env.ARC_AGENT_API_TOKEN = "env-secret";

    const result = await checkAgentBearer(req("env-secret"), { recordSeen: async () => undefined });

    expect(result).toEqual({ ok: true });
  });

  it("accepts a DB token when the env token does not match", async () => {
    process.env.ARC_AGENT_API_TOKEN = "env-secret";
    const verify = vi.fn().mockResolvedValue({ ok: true, workspaceId: "default" });

    const result = await checkAgentBearer(req("sk_live_db"), {
      verify,
      anyConfigured: async () => true,
      recordSeen: async () => undefined,
    });

    expect(result).toEqual({ ok: true });
    expect(verify).toHaveBeenCalledWith("sk_live_db");
  });

  it("401s on a bad token when something is configured", async () => {
    const result = await checkAgentBearer(req("bad"), {
      verify: async () => ({ ok: false }),
      anyConfigured: async () => true,
      recordSeen: async () => undefined,
    });

    expect(result).toEqual({ ok: false, status: 401, reason: "unauthorized" });
  });

  it("503s when nothing is configured", async () => {
    const result = await checkAgentBearer(req("bad"), {
      verify: async () => ({ ok: false }),
      anyConfigured: async () => false,
      recordSeen: async () => undefined,
    });

    expect(result).toEqual({ ok: false, status: 503, reason: "not_configured" });
  });

  it("does not throw while checking DB tokens when Supabase is not configured", async () => {
    await expect(checkAgentBearer(req("sk_live_unknown"), { recordSeen: async () => undefined })).resolves.toEqual({
      ok: false,
      status: 503,
      reason: "not_configured",
    });
  });
});
