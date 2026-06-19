import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/auth-server", () => ({ getSupabaseAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(),
}));

import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { cancelWorkspaceInvite, issueWorkspaceInviteCode, listWorkspaceTeamAccess } from "./workspace-invites";

const getSupabaseAuthenticatedUserMock = vi.mocked(getSupabaseAuthenticatedUser);
const getSupabaseAdminClientMock = vi.mocked(getSupabaseAdminClient);
const isSupabaseAdminConfiguredMock = vi.mocked(isSupabaseAdminConfigured);

class QueryBuilder {
  calls: [method: string, ...args: unknown[]][] = [];

  constructor(
    readonly table: string,
    private readonly responses: Map<string, unknown[]>,
  ) {}

  private shiftResponse<T>(kind: string, fallback: T): T {
    const key = `${this.table}:${kind}`;
    const queue = this.responses.get(key);
    if (!queue?.length) return fallback;
    return queue.shift() as T;
  }

  select(...args: unknown[]) {
    this.calls.push(["select", ...args]);
    return this;
  }

  insert(...args: unknown[]) {
    this.calls.push(["insert", ...args]);
    return Promise.resolve(this.shiftResponse("insert", { data: null, error: null }));
  }

  update(...args: unknown[]) {
    this.calls.push(["update", ...args]);
    return this;
  }

  eq(...args: unknown[]) {
    this.calls.push(["eq", ...args]);
    return this;
  }

  in(...args: unknown[]) {
    this.calls.push(["in", ...args]);
    return this;
  }

  order(...args: unknown[]) {
    this.calls.push(["order", ...args]);
    return this;
  }

  maybeSingle<T>() {
    this.calls.push(["maybeSingle"]);
    return Promise.resolve(this.shiftResponse<{ data: T | null; error: unknown | null }>("maybeSingle", { data: null, error: null }));
  }

  then(resolve: (value: unknown) => unknown) {
    return Promise.resolve(resolve(this.shiftResponse("then", { data: [], error: null })));
  }
}

function createClient(responses: Map<string, unknown[]>) {
  const builders: QueryBuilder[] = [];
  return {
    builders,
    from(table: string) {
      const builder = new QueryBuilder(table, responses);
      builders.push(builder);
      return builder;
    },
  };
}

function queue(responses: Map<string, unknown[]>, table: string, kind: string, response: unknown) {
  const key = `${table}:${kind}`;
  responses.set(key, [...(responses.get(key) ?? []), response]);
}

beforeEach(() => {
  getSupabaseAuthenticatedUserMock.mockReset();
  getSupabaseAdminClientMock.mockReset();
  isSupabaseAdminConfiguredMock.mockReset();
  isSupabaseAdminConfiguredMock.mockReturnValue(true);
  getSupabaseAuthenticatedUserMock.mockResolvedValue({ id: "admin-user" } as unknown as User);
});

describe("issueWorkspaceInviteCode", () => {
  it("creates a hashed workspace invite when the current user is an org admin", async () => {
    const responses = new Map<string, unknown[]>();
    queue(responses, "workspace_memberships", "maybeSingle", {
      data: { org_id: "org-1", role: "admin", status: "active" },
      error: null,
    });
    const client = createClient(responses);
    getSupabaseAdminClientMock.mockReturnValue(client as never);

    const result = await issueWorkspaceInviteCode({
      invitedEmail: " teammate@example.com ",
      role: "marketer",
      workspaceId: "workspace-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const insertCall = client.builders.find((builder) => builder.table === "workspace_invites")?.calls.find((call) => call[0] === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toEqual(
      expect.objectContaining({
        org_id: "org-1",
        workspace_id: "workspace-1",
        invited_email: "teammate@example.com",
        role: "marketer",
        status: "active",
      }),
    );
    expect((insertCall?.[1] as { code_hash: string }).code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect((insertCall?.[1] as { code_hash: string }).code_hash).not.toContain(result.code);
  });
});

describe("listWorkspaceTeamAccess", () => {
  it("returns active workspace members and unused invites for a workspace member", async () => {
    const responses = new Map<string, unknown[]>();
    queue(responses, "workspace_memberships", "maybeSingle", {
      data: { org_id: "org-1", role: "member", status: "active" },
      error: null,
    });
    queue(responses, "workspace_memberships", "then", {
      data: [
        {
          id: "member-1",
          invited_email: "owner@example.com",
          joined_at: "2026-06-18T12:00:00.000Z",
          role: "owner",
          status: "active",
          user_id: "owner-user",
        },
      ],
      error: null,
    });
    queue(responses, "workspace_invites", "then", {
      data: [
        {
          id: "invite-1",
          created_at: "2026-06-18T12:00:00.000Z",
          expires_at: "2026-07-02T00:00:00.000Z",
          invited_email: "teammate@example.com",
          role: "marketer",
          status: "active",
        },
      ],
      error: null,
    });
    const client = createClient(responses);
    getSupabaseAdminClientMock.mockReturnValue(client as never);

    const result = await listWorkspaceTeamAccess("workspace-1");

    expect(result).toEqual({
      invites: [
        {
          createdAt: "2026-06-18T12:00:00.000Z",
          expiresAt: "2026-07-02T00:00:00.000Z",
          id: "invite-1",
          invitedEmail: "teammate@example.com",
          role: "marketer",
          status: "active",
        },
      ],
      members: [
        {
          email: "owner@example.com",
          id: "member-1",
          joinedAt: "2026-06-18T12:00:00.000Z",
          role: "owner",
          status: "active",
          userId: "owner-user",
        },
      ],
      ok: true,
    });
  });
});

describe("cancelWorkspaceInvite", () => {
  it("revokes an active invite when the current user is a workspace admin", async () => {
    const responses = new Map<string, unknown[]>();
    queue(responses, "workspace_memberships", "maybeSingle", {
      data: { org_id: "org-1", role: "admin", status: "active" },
      error: null,
    });
    queue(responses, "workspace_invites", "then", { data: null, error: null });
    const client = createClient(responses);
    getSupabaseAdminClientMock.mockReturnValue(client as never);

    const result = await cancelWorkspaceInvite({ inviteId: "invite-1", workspaceId: "workspace-1" });

    expect(result).toEqual({ ok: true });
    const updateCall = client.builders.find((builder) => builder.table === "workspace_invites")?.calls.find((call) => call[0] === "update");
    expect(updateCall?.[1]).toEqual(expect.objectContaining({ status: "revoked" }));
  });
});
