import { describe, expect, it } from "vitest";

import { resolveWorkspaceContextForUser, WorkspaceUnavailableError } from "./workspace";

type TableRows = Record<string, Record<string, unknown>[]>;

function fakeClient(tables: TableRows) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((row) => row[column] === value);
          return builder;
        },
        order: () => builder,
        limit: (count: number) => {
          rows = rows.slice(0, count);
          return builder;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      };
      return builder;
    },
  } as never;
}

describe("resolveWorkspaceContextForUser", () => {
  it("uses an active workspace membership when a Supabase user is available", async () => {
    const context = await resolveWorkspaceContextForUser(
      fakeClient({
        workspace_memberships: [
          {
            org_id: "org-1",
            workspace_id: "workspace-1",
            user_id: "user-1",
            role: "admin",
            status: "active",
            created_at: "2026-06-18T12:00:00.000Z",
          },
        ],
        workspaces: [
          {
            id: "workspace-1",
            org_id: "org-1",
            key: "bsr-marketing",
            slug: "big-shoulders-restoration",
            name: "Big Shoulders Restoration Marketing",
            status: "active",
          },
        ],
        organizations: [{ id: "org-1", slug: "big-shoulders-restoration", name: "Big Shoulders Restoration" }],
      }),
      "user-1",
    );

    expect(context).toMatchObject({
      orgId: "org-1",
      workspaceId: "workspace-1",
      workspaceKey: "bsr-marketing",
      role: "admin",
      userId: "user-1",
      source: "membership",
    });
  });

  it("falls back to the seeded default workspace before users are assigned", async () => {
    const context = await resolveWorkspaceContextForUser(
      fakeClient({
        organizations: [{ id: "org-1", slug: "big-shoulders-restoration", name: "Big Shoulders Restoration" }],
        workspaces: [
          {
            id: "workspace-1",
            org_id: "org-1",
            key: "default",
            slug: "big-shoulders-restoration",
            name: "Big Shoulders Restoration",
            status: "active",
          },
        ],
      }),
      null,
    );

    expect(context).toMatchObject({
      orgId: "org-1",
      workspaceId: "workspace-1",
      workspaceKey: "default",
      role: null,
      userId: null,
      source: "default-org",
    });
  });

  it("does not fall back to the seeded workspace for signed-in users without access", async () => {
    await expect(
      resolveWorkspaceContextForUser(
        fakeClient({
          organizations: [{ id: "org-1", slug: "big-shoulders-restoration", name: "Big Shoulders Restoration" }],
          workspaces: [
            {
              id: "workspace-1",
              org_id: "org-1",
              key: "default",
              slug: "big-shoulders-restoration",
              name: "Big Shoulders Restoration",
              status: "active",
            },
          ],
        }),
        "user-without-membership",
      ),
    ).rejects.toBeInstanceOf(WorkspaceUnavailableError);
  });
});
