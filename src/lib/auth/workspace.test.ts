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
        returns: async () => ({ data: rows, error: null }),
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

  it("resolves the sole org when there is no session, since it is the only possible answer", async () => {
    const context = await resolveWorkspaceContextForUser(
      fakeClient({
        // Deliberately NOT the old default slug: resolution must not depend on the
        // org being named "big-shoulders-restoration". It is chosen because it is
        // the only one, not because of what it is called.
        organizations: [{ id: "org-1", slug: "acme-restoration", name: "Acme Restoration" }],
        workspaces: [
          {
            id: "workspace-1",
            org_id: "org-1",
            key: "default",
            slug: "acme-restoration",
            name: "Acme Restoration",
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

  // Mechanism 2 of the org-scoping audit, in one assertion. This used to return
  // whichever org was named by DEFAULT_ORG_SLUG, so a session-less caller — a
  // bearer token, which proves "you're allowed" and never "you're Acme" — silently
  // became that tenant and stamped its rows with that org. It must refuse instead.
  it("refuses to guess when there is no session and more than one org exists", async () => {
    await expect(
      resolveWorkspaceContextForUser(
        fakeClient({
          organizations: [
            { id: "org-bsr", slug: "big-shoulders-restoration", name: "Big Shoulders Restoration" },
            { id: "org-acme", slug: "acme-restoration", name: "Acme Restoration" },
          ],
          workspaces: [
            { id: "ws-bsr", org_id: "org-bsr", key: "default", slug: "bsr", name: "BSR", status: "active" },
            { id: "ws-acme", org_id: "org-acme", key: "default", slug: "acme", name: "Acme", status: "active" },
          ],
        }),
        null,
      ),
    ).rejects.toThrow(WorkspaceUnavailableError);
  });

  it("refuses when no org exists at all rather than returning a partial context", async () => {
    await expect(
      resolveWorkspaceContextForUser(fakeClient({ organizations: [], workspaces: [] }), null),
    ).rejects.toThrow(WorkspaceUnavailableError);
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
