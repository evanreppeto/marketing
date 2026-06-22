import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(),
}));

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { provisionAuthenticatedUser, redeemWorkspaceInviteCodeForUser } from "./user-provisioning";

const getSupabaseAdminClientMock = vi.mocked(getSupabaseAdminClient);
const isSupabaseAdminConfiguredMock = vi.mocked(isSupabaseAdminConfigured);

type QueryCall = [method: string, ...args: unknown[]];

class QueryBuilder {
  calls: QueryCall[] = [];

  constructor(
    readonly table: string,
    private readonly responses: Map<string, unknown[]>,
  ) {}

  private responseKey(kind: string) {
    return `${this.table}:${kind}`;
  }

  private shiftResponse<T>(kind: string, fallback: T): T {
    const key = this.responseKey(kind);
    const queue = this.responses.get(key);
    if (!queue?.length) return fallback;
    return queue.shift() as T;
  }

  select(...args: unknown[]) {
    this.calls.push(["select", ...args]);
    return this;
  }

  upsert(...args: unknown[]) {
    this.calls.push(["upsert", ...args]);
    return Promise.resolve(this.shiftResponse("upsert", { data: null, error: null }));
  }

  insert(...args: unknown[]) {
    this.calls.push(["insert", ...args]);
    const response = this.shiftResponse("insert", { data: null, error: null });
    return Object.assign(this, {
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve(resolve(response));
      },
    });
  }

  update(...args: unknown[]) {
    this.calls.push(["update", ...args]);
    return this;
  }

  eq(...args: unknown[]) {
    this.calls.push(["eq", ...args]);
    return this;
  }

  is(...args: unknown[]) {
    this.calls.push(["is", ...args]);
    return this;
  }

  ilike(...args: unknown[]) {
    this.calls.push(["ilike", ...args]);
    return this;
  }

  order(...args: unknown[]) {
    this.calls.push(["order", ...args]);
    return this;
  }

  limit(...args: unknown[]) {
    this.calls.push(["limit", ...args]);
    return this;
  }

  maybeSingle<T>() {
    this.calls.push(["maybeSingle"]);
    return Promise.resolve(this.shiftResponse<{ data: T | null; error: unknown | null }>("maybeSingle", { data: null, error: null }));
  }

  single<T>() {
    this.calls.push(["single"]);
    return Promise.resolve(this.shiftResponse<{ data: T | null; error: unknown | null }>("single", { data: null, error: null }));
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

function user(metadata: Record<string, unknown> = {}): User {
  return {
    id: "user-1",
    email: "new.operator@example.com",
    user_metadata: { full_name: "New Operator", ...metadata },
  } as unknown as User;
}

beforeEach(() => {
  getSupabaseAdminClientMock.mockReset();
  isSupabaseAdminConfiguredMock.mockReset();
  isSupabaseAdminConfiguredMock.mockReturnValue(true);
});

describe("provisionAuthenticatedUser", () => {
  it("creates an owner workspace when signup metadata requests a new organization", async () => {
    const responses = new Map<string, unknown[]>();
    queue(responses, "workspace_memberships", "maybeSingle", { data: null, error: null });
    queue(responses, "workspace_invites", "maybeSingle", { data: null, error: null });
    queue(responses, "workspace_memberships", "maybeSingle", { data: null, error: null });
    queue(responses, "organizations", "maybeSingle", { data: null, error: null });
    queue(responses, "organizations", "single", {
      data: { id: "org-1", name: "Big Shoulders Restoration", slug: "big-shoulders-restoration" },
      error: null,
    });
    queue(responses, "workspaces", "maybeSingle", { data: null, error: null });
    queue(responses, "workspaces", "single", {
      data: { id: "workspace-1", org_id: "org-1", key: "default", slug: "big-shoulders-restoration", name: "Big Shoulders Restoration" },
      error: null,
    });
    queue(responses, "organization_memberships", "maybeSingle", { data: null, error: null });
    queue(responses, "workspace_memberships", "maybeSingle", { data: null, error: null });
    const client = createClient(responses);
    getSupabaseAdminClientMock.mockReturnValue(client as never);

    const result = await provisionAuthenticatedUser(user({
      pending_organization_name: "Big Shoulders Restoration",
      pending_workspace_intent: "create",
      pending_workspace_type: "company",
    }));

    expect(result).toEqual({ ok: true, status: "created_owner", orgId: "org-1", workspaceId: "workspace-1" });
    expect(client.builders.some((builder) => builder.table === "organizations" && builder.calls.some((call) => call[0] === "insert"))).toBe(true);
    expect(client.builders.some((builder) => builder.table === "workspaces" && builder.calls.some((call) => call[0] === "insert"))).toBe(true);
    expect(client.builders.some((builder) => builder.table === "organization_memberships" && builder.calls.some((call) => call[0] === "insert" && (call[1] as { role?: string }).role === "owner"))).toBe(true);
    expect(client.builders.some((builder) => builder.table === "arc_instances" && builder.calls.some((call) => call[0] === "upsert"))).toBe(true);
  });

  it("redeems a valid pending invite code into active organization and workspace memberships", async () => {
    const responses = new Map<string, unknown[]>();
    queue(responses, "workspace_memberships", "maybeSingle", { data: null, error: null });
    queue(responses, "workspace_invites", "maybeSingle", {
      data: {
        id: "invite-1",
        org_id: "org-1",
        workspace_id: "workspace-1",
        role: "marketer",
        invited_email: null,
      },
      error: null,
    });
    queue(responses, "organization_memberships", "maybeSingle", { data: null, error: null });
    const client = createClient(responses);
    getSupabaseAdminClientMock.mockReturnValue(client as never);

    const result = await provisionAuthenticatedUser(user({ pending_invite_code: " bsr 7k2m " }));

    expect(result).toEqual({ ok: true, status: "invited_member", orgId: "org-1", workspaceId: "workspace-1" });
    expect(client.builders.some((builder) => builder.table === "workspace_invites" && builder.calls.some((call) => call[0] === "eq" && call[1] === "code_hash"))).toBe(true);
    expect(client.builders.some((builder) => builder.table === "workspace_invites" && builder.calls.some((call) => call[0] === "update" && (call[1] as { status?: string }).status === "used"))).toBe(true);
    expect(client.builders.some((builder) => builder.table === "organization_memberships" && builder.calls.some((call) => call[0] === "insert"))).toBe(true);
    expect(client.builders.some((builder) => builder.table === "workspace_memberships" && builder.calls.some((call) => call[0] === "insert"))).toBe(true);
  });

  it("redeems an onboarding invite code into active workspace access", async () => {
    const responses = new Map<string, unknown[]>();
    queue(responses, "workspace_invites", "maybeSingle", {
      data: {
        id: "invite-1",
        org_id: "org-1",
        workspace_id: "workspace-1",
        role: "reviewer",
        invited_email: "new.operator@example.com",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      error: null,
    });
    queue(responses, "organization_memberships", "maybeSingle", { data: null, error: null });
    queue(responses, "workspace_memberships", "maybeSingle", { data: null, error: null });
    const client = createClient(responses);

    const result = await redeemWorkspaceInviteCodeForUser(client as never, user(), " bsr 7k2m ");

    expect(result).toEqual({ ok: true, status: "invited_member", orgId: "org-1", workspaceId: "workspace-1" });
    expect(client.builders.some((builder) => builder.table === "workspace_invites" && builder.calls.some((call) => call[0] === "eq" && call[1] === "code_hash"))).toBe(true);
    expect(client.builders.some((builder) => builder.table === "workspace_invites" && builder.calls.some((call) => call[0] === "update" && (call[1] as { status?: string }).status === "used"))).toBe(true);
    expect(client.builders.some((builder) => builder.table === "workspace_memberships" && builder.calls.some((call) => call[0] === "insert" && (call[1] as { role?: string }).role === "reviewer"))).toBe(true);
  });

  it("rejects an onboarding invite code tied to a different email", async () => {
    const responses = new Map<string, unknown[]>();
    queue(responses, "workspace_invites", "maybeSingle", {
      data: {
        id: "invite-1",
        org_id: "org-1",
        workspace_id: "workspace-1",
        role: "member",
        invited_email: "someone.else@example.com",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      error: null,
    });
    const client = createClient(responses);

    const result = await redeemWorkspaceInviteCodeForUser(client as never, user(), "BSR-7K2M");

    expect(result).toEqual({
      ok: false,
      status: "email_mismatch",
      message: "That invite code is tied to a different email address.",
    });
    expect(client.builders.some((builder) => builder.table === "workspace_memberships" && builder.calls.some((call) => call[0] === "insert"))).toBe(false);
  });
});
