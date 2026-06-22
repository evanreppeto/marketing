import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { listActiveArcRunConversationIds, listRecentArcRuns } from "./persistence";

const SCOPE = { orgId: "org-1", workspaceId: "ws-1" };

describe("listActiveArcRunConversationIds", () => {
  it("scopes the in-flight run scan to the given workspace", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: {
        data: [{ source_id: "conv-1", started_at: "2026-06-20T00:00:00.000Z", created_at: null }],
        error: null,
      },
    });

    const runs = await listActiveArcRunConversationIds(SCOPE, supabase);

    expect(runs).toEqual([{ conversationId: "conv-1", since: "2026-06-20T00:00:00.000Z" }]);
    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
    expect(supabase.calls).toContainEqual(["eq", "workspace_id", "ws-1"]);
  });

  it("does not filter by workspace when no scope is given", async () => {
    const supabase = createSupabaseQueryMock({ agent_tasks: { data: [], error: null } });

    await listActiveArcRunConversationIds(undefined, supabase);

    expect(supabase.calls.some((call) => call[0] === "eq" && call[1] === "workspace_id")).toBe(false);
  });
});

describe("listRecentArcRuns", () => {
  it("scopes the recent-runs query to the given workspace", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: {
        data: [
          {
            id: "t-1",
            status: "completed",
            objective: "Draft email",
            source_id: "conv-1",
            created_at: "2026-06-20T00:00:00.000Z",
            started_at: null,
            completed_at: null,
          },
        ],
        error: null,
      },
      arc_conversations: { data: [{ id: "conv-1", title: "Thread" }], error: null },
    });

    const runs = await listRecentArcRuns(30, SCOPE, supabase);

    expect(runs).toEqual([
      {
        taskId: "t-1",
        conversationId: "conv-1",
        title: "Thread",
        status: "completed",
        objective: "Draft email",
        createdAt: "2026-06-20T00:00:00.000Z",
        startedAt: null,
        completedAt: null,
      },
    ]);
    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
    expect(supabase.calls).toContainEqual(["eq", "workspace_id", "ws-1"]);
  });
});
