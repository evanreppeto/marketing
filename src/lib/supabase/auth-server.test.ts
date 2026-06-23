import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/auth/auth-mode", () => ({
  getSupabaseAuthUrl: () => "https://example.supabase.co",
  getSupabaseAnonKey: () => "anon-key",
}));

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { createSupabaseAuthServerClient } from "./auth-server";

const createServerClientMock = vi.mocked(createServerClient);
const cookiesMock = vi.mocked(cookies);

type SetCall = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Build the client, capture the cookie adapter handed to `createServerClient`,
 * run its `setAll` over a representative Supabase auth cookie plus an unrelated
 * cookie, and return what the adapter forwarded to the cookie store.
 */
async function runSetAll(
  options: { rememberMe?: boolean } | undefined,
  storeCookies: Record<string, string> = {},
) {
  const setCalls: SetCall[] = [];
  const store = {
    getAll: () => Object.entries(storeCookies).map(([name, value]) => ({ name, value })),
    get: (name: string) => (name in storeCookies ? { name, value: storeCookies[name] } : undefined),
    set: (name: string, value: string, opts?: Record<string, unknown>) =>
      setCalls.push({ name, value, options: opts }),
  };
  cookiesMock.mockResolvedValue(store as unknown as Awaited<ReturnType<typeof cookies>>);

  await createSupabaseAuthServerClient(options);
  const adapter = createServerClientMock.mock.calls[0][2] as unknown as {
    cookies: { setAll: (c: SetCall[]) => void };
  };
  adapter.cookies.setAll([
    { name: "sb-example-auth-token", value: "token", options: { maxAge: 3600, path: "/" } },
    { name: "unrelated", value: "x", options: { maxAge: 3600, path: "/" } },
  ]);
  return setCalls;
}

beforeEach(() => {
  createServerClientMock.mockReset();
  cookiesMock.mockReset();
  createServerClientMock.mockReturnValue({} as ReturnType<typeof createServerClient>);
});

describe("createSupabaseAuthServerClient cookie persistence", () => {
  it("keeps the auth cookie persistent when rememberMe is true", async () => {
    const calls = await runSetAll({ rememberMe: true });
    const auth = calls.find((c) => c.name === "sb-example-auth-token");
    expect(auth?.options?.maxAge).toBe(3600);
  });

  it("strips the expiry from the auth cookie when rememberMe is false", async () => {
    const calls = await runSetAll({ rememberMe: false });
    const auth = calls.find((c) => c.name === "sb-example-auth-token");
    expect(auth?.options?.maxAge).toBeUndefined();
    expect(auth?.options?.expires).toBeUndefined();
    // path and other options survive
    expect(auth?.options?.path).toBe("/");
  });

  it("never touches non-auth cookies", async () => {
    const calls = await runSetAll({ rememberMe: false });
    const other = calls.find((c) => c.name === "unrelated");
    expect(other?.options?.maxAge).toBe(3600);
  });

  it("falls back to the persisted preference cookie for background refreshes", async () => {
    const calls = await runSetAll(undefined, { "arc-remember": "0" });
    const auth = calls.find((c) => c.name === "sb-example-auth-token");
    expect(auth?.options?.maxAge).toBeUndefined();
  });

  it("defaults to persistent when no option and no preference cookie are present", async () => {
    const calls = await runSetAll(undefined, {});
    const auth = calls.find((c) => c.name === "sb-example-auth-token");
    expect(auth?.options?.maxAge).toBe(3600);
  });
});
