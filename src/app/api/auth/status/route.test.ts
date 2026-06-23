import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

const ENV_KEYS = [
  "ARC_AUTH_MODE",
  "AUTH_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "OPERATOR_ACCESS_TOKEN",
] as const;

const SAVED: Record<string, string | undefined> = {};

function setEnv(env: Record<string, string>) {
  for (const key of ENV_KEYS) {
    SAVED[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, env);
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (SAVED[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED[key];
  }
});

describe("GET /api/auth/status", () => {
  it("reports resolved supabase mode when configured", async () => {
    setEnv({
      ARC_AUTH_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });

    const body = await (await GET()).json();

    expect(body).toEqual({
      requested: "supabase",
      resolved: "supabase",
      supabaseConfigured: true,
      operatorConfigured: false,
    });
  });

  it("reveals a silent fallback to open when supabase is requested but unconfigured", async () => {
    setEnv({ ARC_AUTH_MODE: "supabase" });

    const body = await (await GET()).json();

    expect(body.requested).toBe("supabase");
    expect(body.resolved).toBe("open");
    expect(body.supabaseConfigured).toBe(false);
  });

  it("reports null requested mode and open resolution for local dev", async () => {
    setEnv({});

    const body = await (await GET()).json();

    expect(body.requested).toBeNull();
    expect(body.resolved).toBe("open");
  });
});
