import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { requireOperator } from "./operator";

function setSupabaseMode() {
  process.env.ARC_AUTH_MODE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
}

function createMembershipQuery(result: { data: { id: string } | null; error: Error | null }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

function mockSupabaseClient(input: {
  membership?: { id: string } | null;
  membershipError?: Error | null;
  user?: { id: string } | null;
  userError?: Error | null;
}) {
  const membershipQuery = createMembershipQuery({
    data: input.membership ?? null,
    error: input.membershipError ?? null,
  });
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: input.user ?? null },
        error: input.userError ?? null,
      })),
    },
    from: vi.fn(() => membershipQuery),
  };
  mocks.createServerClient.mockReturnValue(client);
  return { client, membershipQuery };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.ARC_AUTH_MODE;
  delete process.env.AUTH_MODE;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.OPERATOR_ACCESS_TOKEN;
});

describe("requireOperator", () => {
  it("stays open when interactive auth is disabled", async () => {
    await expect(requireOperator()).resolves.toBeUndefined();

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("allows a Supabase user with an active workspace membership", async () => {
    setSupabaseMode();
    const { client, membershipQuery } = mockSupabaseClient({
      membership: { id: "membership-1" },
      user: { id: "user-1" },
    });

    await expect(requireOperator()).resolves.toBeUndefined();

    expect(client.from).toHaveBeenCalledWith("workspace_memberships");
    expect(membershipQuery.select).toHaveBeenCalledWith("id");
    expect(membershipQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(membershipQuery.eq).toHaveBeenCalledWith("status", "active");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects Supabase users without workspace membership to onboarding", async () => {
    setSupabaseMode();
    mockSupabaseClient({ membership: null, user: { id: "user-1" } });

    await expect(requireOperator()).rejects.toThrow("redirect:/onboarding");

    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("redirects Supabase users to onboarding when membership lookup fails", async () => {
    setSupabaseMode();
    mockSupabaseClient({
      membershipError: new Error("workspace_memberships unavailable"),
      user: { id: "user-1" },
    });

    await expect(requireOperator()).rejects.toThrow("redirect:/onboarding");

    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("redirects anonymous Supabase sessions to login", async () => {
    setSupabaseMode();
    mockSupabaseClient({ user: null });

    await expect(requireOperator()).rejects.toThrow("redirect:/login");

    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
