import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "ARC_AUTH_MODE",
  "AUTH_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_MARKETING_SUPABASE_URL",
  "MARKETING_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_MARKETING_SUPABASE_ANON_KEY",
  "MARKETING_SUPABASE_ANON_KEY",
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
  vi.restoreAllMocks();
});

async function freshGetAuthMode() {
  vi.resetModules();
  return (await import("./auth-mode")).getAuthMode;
}

describe("getAuthMode fail-loud fallback", () => {
  it("warns and falls back to open when supabase is requested but not configured", async () => {
    setEnv({ ARC_AUTH_MODE: "supabase" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getAuthMode = await freshGetAuthMode();

    expect(getAuthMode()).toBe("open");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("supabase");
  });

  it("warns and falls back to open when operator is requested but no token is set", async () => {
    setEnv({ ARC_AUTH_MODE: "operator" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getAuthMode = await freshGetAuthMode();

    expect(getAuthMode()).toBe("open");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("resolves supabase when configured, without warning", async () => {
    setEnv({
      ARC_AUTH_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getAuthMode = await freshGetAuthMode();

    expect(getAuthMode()).toBe("supabase");
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn when no mode is requested", async () => {
    setEnv({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getAuthMode = await freshGetAuthMode();

    expect(getAuthMode()).toBe("open");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns only once across repeated calls", async () => {
    setEnv({ ARC_AUTH_MODE: "supabase" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getAuthMode = await freshGetAuthMode();

    getAuthMode();
    getAuthMode();
    getAuthMode();

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
