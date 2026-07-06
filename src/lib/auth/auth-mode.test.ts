import { afterEach, describe, expect, it } from "vitest";

import {
  getAuthMode,
  getSupabaseAnonKey,
  getSupabaseAuthUrl,
  isInteractiveAuthEnabled,
  isSupabaseAuthConfigured,
} from "./auth-mode";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_MARKETING_SUPABASE_URL;
  delete process.env.MARKETING_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_MARKETING_SUPABASE_ANON_KEY;
  delete process.env.MARKETING_SUPABASE_ANON_KEY;
  delete process.env.OPERATOR_ACCESS_TOKEN;
  delete process.env.ARC_AUTH_MODE;
  delete process.env.AUTH_MODE;
});

describe("Supabase auth configuration", () => {
  it("requires sign-in by default once Supabase Auth is configured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    expect(getSupabaseAuthUrl()).toBe("https://project.supabase.co");
    expect(getSupabaseAnonKey()).toBe("anon-key");
    expect(isSupabaseAuthConfigured()).toBe(true);
    // Secure by default: wiring up a real auth backend turns on the login gate
    // even without an explicit ARC_AUTH_MODE.
    expect(getAuthMode()).toBe("supabase");
    expect(isInteractiveAuthEnabled()).toBe(true);
  });

  it("stays open when ARC_AUTH_MODE=open even if Supabase is configured", () => {
    process.env.ARC_AUTH_MODE = "open";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    // Explicit escape hatch for the public demo / preview (and the instant unlock).
    expect(getAuthMode()).toBe("open");
    expect(isInteractiveAuthEnabled()).toBe(false);
  });

  it("uses Supabase Auth when explicitly requested", () => {
    process.env.ARC_AUTH_MODE = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    expect(getAuthMode()).toBe("supabase");
    expect(isInteractiveAuthEnabled()).toBe(true);
  });

  it("falls back to open when supabase is requested but its config is missing", () => {
    process.env.ARC_AUTH_MODE = "supabase";

    // A misconfigured deploy degrades to open rather than locking everyone out.
    expect(isSupabaseAuthConfigured()).toBe(false);
    expect(getAuthMode()).toBe("open");
    expect(isInteractiveAuthEnabled()).toBe(false);
  });

  it("falls back to MARKETING-prefixed Supabase env vars", () => {
    process.env.NEXT_PUBLIC_MARKETING_SUPABASE_URL = "https://marketing.supabase.co";
    process.env.NEXT_PUBLIC_MARKETING_SUPABASE_ANON_KEY = "marketing-anon";

    expect(getSupabaseAuthUrl()).toBe("https://marketing.supabase.co");
    expect(getSupabaseAnonKey()).toBe("marketing-anon");
    expect(getAuthMode()).toBe("supabase");
  });

  it("uses the legacy operator gate only when explicitly requested", () => {
    process.env.ARC_AUTH_MODE = "operator";
    process.env.OPERATOR_ACCESS_TOKEN = "operator-cookie-secret";

    expect(isSupabaseAuthConfigured()).toBe(false);
    expect(getAuthMode()).toBe("operator");
    expect(isInteractiveAuthEnabled()).toBe(true);
  });

  it("keeps local development open when no auth configuration exists", () => {
    expect(getSupabaseAuthUrl()).toBe("");
    expect(getSupabaseAnonKey()).toBe("");
    expect(getAuthMode()).toBe("open");
    expect(isInteractiveAuthEnabled()).toBe(false);
  });
});
